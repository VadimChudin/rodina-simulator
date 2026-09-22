'use strict';
// Run: node tests/test_dependencies.js (no packages required).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../frontend/js/plant.js'), 'utf8');
let checks = 0;
function fresh(triers, pneumo, options = {}) {
  const context = {window: {}, console};
  vm.createContext(context); vm.runInContext(source, context);
  const P = context.window.PLANT, S = P.S;
  P.setEstop(false); P.ackAlarms();
  assert.equal(P.setOptions({triers, pneumo, op: true, ...options}).ok, true);
  S.settings.seq_up = S.settings.seq_down = 0.01;
  for (const m of Object.values(S.machines)) {m.delay_start = .2; m.delay_stop = .2;}
  return P;
}
function until(P, condition, max = 10000) {
  for (let i=0; i<max && !condition(); i++) P.tick(.1);
  assert.ok(condition(), 'simulation timed out: ' + JSON.stringify(P.S.alarms.slice(0, 2)));
}
// Independent expected prerequisite edges (not generated from production graph).
function expectedEdges(P) {
  const o = P.S.opt;
  const product = ['intake','noria_4',...(o.op ? ['op_5'] : []),'muz_6','noria_8','tor_10','noria_12',
    ...(o.triers ? [...(o.trier1 ? ['bt_14_1'] : []),...(o.trier2 ? ['bt_14_2'] : [])] : []),
    'noria_15',...(o.pneumo ? ['sp_18'] : []),'noria_20'];
  const edges = product.slice(0,-1).map((id,i)=>[id,product[i+1]]);
  edges.push(['muz_6','beater_6'],['tor_10','beater_10'],['muz_6','as_1'],['tor_10','as_2'],
    ['muz_6','conv_22_1'],['tor_10','conv_22_1'],['conv_22_3','conv_22_2'],['conv_22_2','conv_22_1'],
    ['conv_22_1','noria_24'],['conv_22_4','noria_23']);
  for(let i=1;i<=3;i++) edges.push(['as_'+i,'sluice_'+i],['sluice_'+i,'conv_22_4']);
  if(o.triers) for(const id of ['bt_14_1','bt_14_2'].filter(id=>P.chain().includes(id))) edges.push([id,'conv_22_2']);
  if(o.pneumo) edges.push(['sp_fan','sp_18'],['sp_18','as_3'],['sp_18','conv_22_3']);
  return edges;
}
function startup(P) {
  const S=P.S, events=[], edges=expectedEdges(P);
  assert.equal(P.startMode().ok,true);
  const members=Array.from(P.chain());
  const expected=['as_1','sluice_1','as_2','sluice_2','as_3','sluice_3','conv_22_4','noria_23',
    'conv_22_3','conv_22_2','conv_22_1','noria_24','intake','noria_4','muz_6','beater_6',
    'noria_8','tor_10','beater_10','noria_12','noria_15','noria_20',
    ...(S.opt.op?['op_5']:[]), ...(S.opt.pneumo?['sp_fan','sp_18']:[]),
    ...(S.opt.triers?[...(S.opt.trier1?['bt_14_1']:[]),...(S.opt.trier2?['bt_14_2']:[])]:[])];
  assert.deepEqual([...members].sort(),expected.sort(),'all selected drives participate');
  for(let t=0;t<10000&&!S.mode_run;t++) {
    const before=Object.fromEntries(Object.entries(S.machines).map(([id,m])=>[id,{running:m.running,starting:m.starting}]));
    P.tick(.1);
    for(const id of members) if(!before[id].starting&&!before[id].running&&(S.machines[id].starting||S.machines[id].running)) {
      events.push(id);
      for(const [consumer,dep] of edges.filter(([consumer])=>consumer===id)) {
        assert.equal(before[dep].running,true,consumer+' starts only after '+dep+' is running');
        assert.equal(S.machines[dep].stopping,false);
      }
    }
    if(S.feed) assert.ok(P.routeReady(),'feed opens only when all route drives are ready');
  }
  assert.ok(S.mode_run); assert.ok(S.feed); assert.ok(P.routeReady());
  assert.equal(events.length,members.length);
  assert.equal(new Set(events).size,members.length);
  assert.ok(events.indexOf('beater_6')<events.indexOf('muz_6'));
  assert.ok(events.indexOf('beater_10')<events.indexOf('tor_10'));
  checks++;
  return events;
}
function allOff(P) {return Object.values(P.S.machines).every(m=>!m.running&&!m.starting&&!m.stopping);}
const results=[];
for (const [name,triers,pneumo] of [['bt_sp',true,true],['bt_only',true,false],['sp_only',false,true],['bypass',false,false]]) {
  const P=fresh(triers,pneumo), S=P.S;
  const started=startup(P);
  for(let i=0;i<25;i++) P.tick(.1); // real product in transit; do not clear it for normal stop
  assert.ok(S.grain.length>0);
  assert.equal(P.stopMode().ok,true); assert.equal(S.feed,false);
  const stopped=[];
  for(let i=0;i<10000&&S.mode_stopping;i++) {
    const was=Object.fromEntries(P.chain().map(id=>[id,S.machines[id].running]));
    P.tick(.1);
    for(const id of P.chain()) if(was[id]&&!S.machines[id].running) stopped.push(id);
  }
  assert.ok(allOff(P)); assert.equal(S.seq,null); assert.equal(S.mode_stopping,false);
  assert.deepEqual(stopped,[...started].reverse(),'stop reverses complete dependency order');
  assert.equal(S.grain.length,0,'normal stop drains product');
  assert.equal(S.alarms.some(a=>a.active),false,'normal stop does not create an interlock fault');
  checks++;
  // Every selected drive trips the line and inhibits restart until clear + acknowledge.
  for(const id of P.chain()) {
    const Q=fresh(triers,pneumo); startup(Q);
    assert.equal(Q.injectSensor(id,'prot').ok,true);
    assert.ok(allOff(Q)); assert.equal(Q.S.feed,false); assert.equal(Q.S.seq,null);
    assert.equal(Q.startMode().ok,false);
    Q.clearSensor(id,'prot'); assert.equal(Q.startMode().ok,false);
    assert.equal(Q.ackAlarms().ok,true); assert.equal(Q.startMode().ok,true);
    checks++;
  }
  const F=fresh(triers,pneumo); F.startMode(); F.tick(.1);
  F.injectSensor('beater_6','prot');
  assert.ok(allOff(F)); assert.equal(F.S.mode_starting,false); assert.equal(F.S.seq,null);
  assert.equal(F.S.feed,false); F.setBypass('beater_6','prot',true);
  assert.equal(F.S.machines.beater_6.fault,true,'protection cannot be bypassed'); checks++;
  const Q=fresh(triers,pneumo); Q.startMode(); Q.tick(.1); Q.stopMode();
  until(Q,()=>!Q.S.mode_stopping); assert.ok(allOff(Q)); checks++;
  const E=fresh(triers,pneumo); startup(E); E.setEstop(true);
  assert.ok(allOff(E)); assert.equal(E.S.feed,false); assert.equal(E.startMode().ok,false); checks++;
  results.push({route:name,driveCount:started.length,startOrder:started,stopOrder:stopped});
}
// Relay permissives are not bypassed by manual/ignore-next settings.
for(const [main,aux] of [['muz_6','beater_6'],['tor_10','beater_10'],['sp_fan','sp_18']]) {
  const P=fresh(true,true), m=P.S.machines[main]; m.manual=true; m.ignore_next=true;
  assert.equal(P.startMachine(main).ok,false);
  P.S.machines[aux].manual=true; P.S.machines[aux].ignore_next=true;
  assert.equal(P.startMachine(aux).ok,true);
  assert.equal(P.startMachine(main).ok,false,'starting is not ready');
  P.tick(.1); P.tick(.1); assert.equal(P.startMachine(main).ok,true);
  P.S.machines[aux].running=false;
  P.tick(.1); assert.ok(allOff(P),'lost permissive cancels accelerating main'); checks++;
  const Q=fresh(true,true); startup(Q); Q.S.machines[aux].running=false;
  Q.tick(.1); assert.ok(allOff(Q)); assert.equal(Q.S.feed,false); checks++;
}
for(const options of [{trier1:true,trier2:false},{trier1:false,trier2:true},{op:false}]) startup(fresh(true,true,options));
console.log(JSON.stringify({passed:true,checks,routes:results},null,2));
