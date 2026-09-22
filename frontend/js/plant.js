/* ЛПЗС «Родина» — модель линии подготовки зерна и семян.
   Геометрия узлов рассчитана под реальные пропорции 2D-моделей
   оборудования (assets/*.webp), маршруты — по Приложению 5.

   Движение продукта равномерное: все участки типа "path" проходятся
   с постоянной скоростью, без рывков и ускорений. */

(function (global) {
  "use strict";

  const W = 3120, H = 1560;

  /* скорости, ед/с — подобраны так, чтобы поток читался спокойно */
  const V_BELT = 66;    // лента / шнек
  const V_LIFT = 126;    // нория
  const V_CHUTE = 92;   // самотёк
  const V_DUCT = 120;   // воздуховод аспирации

  /* пропорции спрайтов (w/h), замерены по обрезанным файлам */
  const AR = {
    cyclone: 0.473, debearder: 0.818, diverter: 1.015, fan: 0.969,
    hopper: 0.631, intake: 1.845, magnet: 0.842, muz: 1.487,
    noria: 0.347, pneumo: 1.902, screw: 3.851, silo: 0.479,
    tor: 0.852, trier: 1.459, truck: 2.279,
  };
  const byW = (sp, x, y, w) => ({ x, y, w, h: Math.round(w / AR[sp]), sprite: sp });
  const byH = (sp, x, y, h) => ({ x, y, w: Math.round(h * AR[sp]), h, sprite: sp });

  /* ------------------------------------------------------------------ узлы */
  const ND = {
    truck_in:  { ...byW("truck", 100, 300, 300), kind: "truck" },
    intake:    { ...byW("intake", 90, 480, 380), kind: "intake", poz: "1–2" },
    magnet_3:  { ...byW("magnet", 470, 574, 70), kind: "magnet", poz: "3" },
    noria_4:   { ...byH("noria", 560, 250, 430), kind: "noria", poz: "4" },
    op_5:      { ...byW("debearder", 730, 255, 130), kind: "op", poz: "5" },
    bun_61:    { ...byW("hopper", 750, 430, 88), kind: "hopper", poz: "6.1" },
    muz_6:     { ...byW("muz", 720, 580, 300), kind: "muz", poz: "6" },
    as_1:      { ...byW("fan", 880, 180, 100), kind: "fan", poz: "7" },
    noria_8:   { ...byH("noria", 1050, 250, 430), kind: "noria", poz: "8" },
    bun_9:     { ...byW("hopper", 1220, 255, 88), kind: "hopper", poz: "9" },
    tor_10:    { ...byW("tor", 1208, 410, 270), kind: "tor", poz: "10" },
    as_2:      { ...byW("fan", 1310, 150, 100), kind: "fan", poz: "11" },
    noria_12:  { ...byH("noria", 1520, 250, 430), kind: "noria", poz: "12" },
    div_10_1:  { ...byW("diverter", 1690, 255, 90), kind: "diverter", poz: "13.1" },
    bt_14_1:   { ...byW("trier", 1690, 380, 300), kind: "trier", poz: "14.1" },
    bt_14_2:   { ...byW("trier", 1690, 610, 300), kind: "trier", poz: "14.2" },
    noria_15:  { ...byH("noria", 2040, 250, 430), kind: "noria", poz: "15" },
    div_10_2:  { ...byW("diverter", 2210, 255, 90), kind: "diverter", poz: "13.2" },
    bun_16:    { ...byW("hopper", 2220, 365, 88), kind: "hopper", poz: "16" },
    sp_18:     { ...byW("pneumo", 2198, 530, 340), kind: "sp", poz: "18" },
    as_3:      { ...byW("fan", 2300, 150, 100), kind: "fan", poz: "19" },
    noria_20:  { ...byH("noria", 2570, 250, 430), kind: "noria", poz: "20" },
    bun_21:    { ...byH("silo", 2740, 300, 320), kind: "silo", poz: "21", letter: "В" },
    truck_out: { ...byW("truck", 2720, 650, 300), kind: "truck" },

    cyc_3:     { ...byH("cyclone", 60, 880, 250), kind: "cyclone", poz: "19" },
    cyc_2:     { ...byH("cyclone", 200, 880, 250), kind: "cyclone", poz: "11" },
    cyc_1:     { ...byH("cyclone", 340, 880, 250), kind: "cyclone", poz: "7" },
    sluice_3:  { x: 88, y: 1090, w: 62, h: 58, kind: "sluice", poz: "19" },
    sluice_2:  { x: 228, y: 1090, w: 62, h: 58, kind: "sluice", poz: "11" },
    sluice_1:  { x: 368, y: 1090, w: 62, h: 58, kind: "sluice", poz: "7" },
    conv_22_4: { ...byW("screw", 40, 1190, 430), kind: "screw", poz: "22.4" },
    noria_23:  { ...byH("noria", 520, 1000, 400), kind: "noria", poz: "23" },
    bun_A:     { ...byH("silo", 700, 1060, 300), kind: "silo", poz: "25", letter: "А" },
    truck_A:   { ...byW("truck", 700, 1400, 250), kind: "truck" },
    conv_22_1: { ...byW("screw", 1050, 860, 430), kind: "screw", poz: "22.1" },
    noria_24:  { ...byH("noria", 1300, 990, 400), kind: "noria", poz: "24" },
    bun_B:     { ...byH("silo", 1480, 1060, 300), kind: "silo", poz: "25", letter: "Б" },
    truck_B:   { ...byW("truck", 1480, 1400, 250), kind: "truck" },
    conv_22_2: { ...byW("screw", 1800, 960, 430), kind: "screw", poz: "22.2" },
    conv_22_3: { ...byW("screw", 2300, 860, 430), kind: "screw", poz: "22.3" },
  };

  /* -------------------------------------------------- точки присоединения */
  const A = {};
  function anchors() {
    for (const [id, n] of Object.entries(ND)) {
      const a = {};
      const px = (u) => n.x + u * n.w, py = (v) => n.y + v * n.h;
      switch (n.kind) {
        case "noria":
          a.in = [px(0.10), py(0.93)]; a.out = [px(0.90), py(0.16)];
          a.col = px(0.50); a.top = py(0.14); a.bot = py(0.88);
          a.win = [0.40, 0.12, 0.20, 0.76];      // окно с зерном внутри
          break;
        case "intake":
          a.beltY = py(0.50); a.bx1 = px(0.14); a.bx2 = px(0.88);
          a.out = [px(0.92), py(0.52)];
          a.win = [0.12, 0.40, 0.78, 0.18];
          break;
        case "magnet": a.in = [px(0.5), py(0.02)]; a.out = [px(0.5), py(0.98)]; break;
        case "op": a.in = [px(0.28), py(0.04)]; a.out = [px(0.86), py(0.84)]; break;
        case "hopper": a.in = [px(0.5), py(0.02)]; a.out = [px(0.5), py(0.97)]; break;
        case "muz":
          a.in = [px(0.30), py(0.02)]; a.out = [px(0.52), py(0.96)];
          a.waste = [px(0.80), py(0.94)]; a.duct = [px(0.90), py(0.02)];
          a.win = [0.30, 0.22, 0.48, 0.34];
          break;
        case "tor":
          a.in = [px(0.22), py(0.03)]; a.out = [px(0.50), py(0.96)];
          a.waste = [px(0.80), py(0.94)]; a.duct = [px(0.86), py(0.03)];
          a.win = [0.30, 0.25, 0.44, 0.34];
          break;
        case "trier":
          a.in = [px(0.10), py(0.14)]; a.out = [px(0.92), py(0.52)];
          a.waste = [px(0.50), py(0.96)];
          a.win = [0.18, 0.22, 0.58, 0.16];
          break;
        case "sp":
          a.in = [px(0.08), py(0.14)]; a.out = [px(0.78), py(0.82)];
          a.waste = [px(0.58), py(0.96)]; a.duct = [px(0.82), py(0.04)];
          a.win = [0.16, 0.18, 0.54, 0.22];
          break;
        case "silo":
          a.in = [px(0.5), py(0.03)]; a.out = [px(0.5), py(0.98)];
          a.body = [0.10, 0.13, 0.80, 0.53]; a.cone = [0.12, 0.66, 0.76, 0.24];
          break;
        case "cyclone":
          a.in = [px(0.04), py(0.20)]; a.out = [px(0.50), py(0.99)];
          break;
        case "sluice": a.in = [px(0.5), py(0)]; a.out = [px(0.5), py(1)]; break;
        case "diverter":
          a.in = [px(0.5), py(0.04)]; a.oa = [px(0.24), py(0.94)]; a.ob = [px(0.78), py(0.94)];
          break;
        case "screw":
          a.in = [px(0.08), py(0.42)]; a.out = [px(0.92), py(0.52)];
          a.win = [0.14, 0.44, 0.72, 0.24];
          break;
        default: break;
      }
      A[id] = a;
    }
  }
  anchors();

  /* ----------------------------------------------------------- воздуховоды */
  const DUCTS = [
    { id: "as_1", poz: "АС-1", pts: [A.muz_6.duct, [A.muz_6.duct[0], 140], [48, 140], [48, 840], [A.cyc_1.in[0], 840], A.cyc_1.in] },
    { id: "as_2", poz: "АС-2", pts: [A.tor_10.duct, [A.tor_10.duct[0], 110], [34, 110], [34, 830], [A.cyc_2.in[0], 830], A.cyc_2.in] },
    { id: "as_3", poz: "АС-3", pts: [A.sp_18.duct, [A.sp_18.duct[0], 80], [20, 80], [20, 820], [A.cyc_3.in[0], 820], A.cyc_3.in] },
  ];

  /* ------------------------------------------------------- список машин */
  const MACHINE_DEFS = [
    ["intake",    "Яма завальная с конвейером",      "intake",   "conv"],
    ["magnet_3",  "Магнитный сепаратор ПМ-200",      "magnet",   "info"],
    ["noria_4",   "Нория 4",                          "noria",    "noria"],
    ["op_5",      "Остеобрушиватель ОП-11",           "op",       "machine"],
    ["bun_61",    "Бункер оперативный БО-1 (6.1)",   "hopper",   "bunker"],
    ["muz_6",     "МУЗ-8М",                           "muz",      "machine"],
    ["beater_6",  "МУЗ-8М битер",                     "beater",   "machine"],
    ["as_1",      "Комплект аспирации АС-1",          "fan",      "aspir"],
    ["cyc_1",     "Циклон АС-1",                      "cyclone",  "info"],
    ["sluice_1",  "Шлюз аспирации АС-1",              "sluice",   "sluice"],
    ["noria_8",   "Нория 8",                          "noria",    "noria"],
    ["bun_9",     "Бункер оперативный БО-1 (9)",     "hopper",   "bunker"],
    ["tor_10",    "ТОР-18",                           "tor",      "machine"],
    ["beater_10", "ТОР-18 битер",                     "beater",   "machine"],
    ["as_2",      "Комплект аспирации АС-2",          "fan",      "aspir"],
    ["cyc_2",     "Циклон АС-2",                      "cyclone",  "info"],
    ["sluice_2",  "Шлюз аспирации АС-2",              "sluice",   "sluice"],
    ["noria_12",  "Нория 12",                         "noria",    "noria"],
    ["div_10_1",  "Переключатель потока 13.1",        "diverter", "diverter"],
    ["bt_14_1",   "Триерный блок 1.1",                "trier",    "trier"],
    ["bt_14_2",   "Триерный блок 2.1",                "trier",    "trier"],
    ["noria_15",  "Нория 15",                         "noria",    "noria"],
    ["div_10_2",  "Переключатель потока 13.2",        "diverter", "diverter"],
    ["bun_16",    "Бункер оперативный БО-1 (16)",    "hopper",   "bunker"],
    ["sp_18",     "Стол пневмосортировальный СП-200", "sp",      "pneumo"],
    ["sp_fan",    "Вентилятор пневмостола СП-200",     "fan",      "machine"],
    ["as_3",      "Комплект аспирации АС-3",          "fan",      "aspir"],
    ["cyc_3",     "Циклон АС-3",                      "cyclone",  "info"],
    ["sluice_3",  "Шлюз аспирации АС-3",              "sluice",   "sluice"],
    ["noria_20",  "Нория 20",                         "noria",    "noria"],
    ["bun_21",    "Бункер зерновой БЗ-А-20х1",        "silo",     "bunker"],
    ["conv_22_1", "Конвейер шнековый 22.1",           "screw",    "conv"],
    ["conv_22_2", "Конвейер шнековый 22.2",           "screw",    "conv"],
    ["conv_22_3", "Конвейер шнековый 22.3",           "screw",    "conv"],
    ["conv_22_4", "Конвейер шнековый 22.4",           "screw",    "conv"],
    ["noria_23",  "Нория 23",                         "noria",    "noria"],
    ["noria_24",  "Нория 24",                         "noria",    "noria"],
    ["bun_A",     "Бункер отходов 2х10 (А)",          "silo",     "bunker"],
    ["bun_B",     "Бункер отходов 2х10 (Б)",          "silo",     "bunker"],
  ];

  function sensorsOf(dlg) {
    if (dlg === "noria") return ["dks", "dsl1", "dsl2", "dp", "prot"];
    if (dlg === "conv") return ["dks", "dp", "prot"];
    if (dlg === "sluice") return ["dks", "prot"];
    if (dlg === "info" || dlg === "bunker" || dlg === "diverter") return [];
    return ["prot"];
  }

  function mkMachine(id, name, kind, dlg) {
    return {
      id, name, kind, dlg,
      poz: (ND[id] && ND[id].poz) || "",
      sensorList: sensorsOf(dlg),
      delay_start: 3, delay_stop: 2,
      hours_to: 200,
      hours_cur: +(Math.random() * 60).toFixed(2),
      hours_total: +(800 + Math.random() * 1400).toFixed(1),
      running: false, starting: false, stopping: false,
      t_start: 0, t_stop: 0,
      manual: false, ignore_next: false,
      sens: { dks: false, dsl1: false, dsl2: false, dp: false, prot: false },
      byp: { dks: false, dsl1: false, dsl2: false, dp: false, prot: false },
      fault: false, fault_text: "",
      phase: 0, vib: 0, spin: 0, mat: 0, to_warned: false,
      rpm: 0, amps: 0, load: 0, temp: 22,
    };
  }

  const S = {
    W, H, ND, A, DUCTS, AR,
    estop: true,
    estop_src: "Нажат аварийный стоп на шкафу",
    mode_run: false, mode_starting: false, mode_stopping: false,
    feed: false, feed_requested: false,
    opt: { triers: true, trier1: true, trier2: true, pneumo: true, op: true },
    route: "bt_sp",
    settings: { dvu_bo61: 15, dvu_bo9: 15, dvu_bo16: 15, dvu_a: 15, dvu_waste1: 15, dvu_waste2: 15,
                seq_up: 0.36, seq_down: 0.30, feed_rate: 7, prod_nom: 12.4, pit_load: 100 },
    user: { login: "operator", role: "Оператор" },
    machines: {},
    diverters: {
      div_10_1: { pos: "trier",  a: "trier",  b: "noria_12", la: "На триер",      lb: "На норию 12", sw: 4, busy: 0, manual: false },
      div_10_2: { pos: "pneumo", a: "pneumo", b: "noria_17", la: "На пневмостол", lb: "На норию 17", sw: 4, busy: 0, manual: false },
    },
    clock: 0,
    piles: { pit: 0.86, V: 0.18, A: 0.34, B: 0.22, b61: 0.28, b9: 0.24, b16: 0.2 },
    dvuTimers: {},
    alarms: [], archive: [],
    grain: [],
    seq: null,
    prod: 0, humIn: 18.6, humOut: 18.6, agent: 22,
    trend: { temp: [], hum: [], prod: [] },
  };

  MACHINE_DEFS.forEach(([id, name, kind, dlg]) => { S.machines[id] = mkMachine(id, name, kind, dlg); });

  // Keep the existing mutable UI API, but reject route edits while occupied.
  function routeLocked() {
    return S.feed || S.mode_run || S.mode_starting || S.mode_stopping ||
      S.grain.length > 0 || Object.values(S.machines).some(m => m.running || m.starting || m.stopping || m.mat > 0.003);
  }
  S.opt = new Proxy(S.opt, { set(target, key, value) {
    if (target[key] !== value && routeLocked()) return true;
    target[key] = value; return true;
  } });
  function setOptions(patch) {
    if (routeLocked()) return { ok: false, error: "Маршрут занят: остановите подачу и освободите тракт" };
    for (const key of Object.keys(patch)) if (key in S.opt) S.opt[key] = !!patch[key];
    if (!S.opt.trier1 && !S.opt.trier2) S.opt.triers = false;
    rebuildRoutes();
    return { ok: true };
  }
  function fullDestination() { return ["V", "A", "B"].some(k => S.piles[k] >= 0.995); }
  function routeReady() {
    return !S.estop && !Object.values(S.diverters).some(d => d.busy > 0) &&
      chain().every(id => { const m = S.machines[id]; return m.running && !m.stopping && !m.fault; });
  }
  function startOrder() {
    const list = [], seen = new Set(), visiting = new Set(), members = new Set(chain());
    function visit(id) {
      if (seen.has(id)) return;
      if (visiting.has(id)) throw new Error("Cyclic drive dependency: " + id);
      visiting.add(id);
      for (const dep of dependenciesOf(id)) {
        if (!members.has(dep)) throw new Error("Missing route prerequisite: " + dep);
        visit(dep);
      }
      visiting.delete(id); seen.add(id);
      list.push(id);
    }
    chain().forEach(visit);
    return list;
  }
  function ts() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  }
  function raise(msg, lvl) {
    const a = { ts: ts(), message: msg, lvl: lvl || "warn", active: lvl === "err" };
    S.alarms.unshift(a); S.archive.unshift({ ...a });
    S.alarms = S.alarms.slice(0, 120); S.archive = S.archive.slice(0, 400);
  }

  /* ------------------------------------------------ технологическая цепочка */
  function flowList() {
    const o = S.opt;
    const f = ["intake", "noria_4"];
    if (o.op) f.push("op_5");
    f.push("muz_6", "noria_8", "tor_10", "noria_12");
    if (o.triers) { if (o.trier1) f.push("bt_14_1"); if (o.trier2) f.push("bt_14_2"); }
    f.push("noria_15");
    if (o.pneumo) f.push("sp_18");
    f.push("noria_20");
    return f;
  }

  function nextOf(id) {
    const f = flowList();
    const i = f.indexOf(id);
    if (i >= 0 && i < f.length - 1) return f[i + 1];
    const m = {
      as_1: "sluice_1", sluice_1: "conv_22_4", as_2: "sluice_2", sluice_2: "conv_22_4",
      as_3: "sluice_3", sluice_3: "conv_22_4", conv_22_4: "noria_23",
      conv_22_3: "conv_22_2", conv_22_2: "conv_22_1", conv_22_1: "noria_24",
    };
    return m[id] || null;
  }

  // Electrical-series prerequisite is distinct from the material successor.
  // A beater must reach running before its main drive; never the reverse.
  // sp_fan is a separate simulated drive, not aspiration fan as_3.
  function driveInterlocks(id) {
    return ({ muz_6: ["beater_6"], tor_10: ["beater_10"],
      sp_fan: ["sp_18"] })[id] || [];
  }
  function dependenciesOf(id) {
    const next = nextOf(id);
    const auxiliaries = ({
      muz_6: ["as_1", "conv_22_1"],
      tor_10: ["as_2", "conv_22_1"],
      bt_14_1: ["conv_22_2"], bt_14_2: ["conv_22_2"],
      sp_18: ["as_3", "conv_22_3"],
    })[id] || [];
    if (id === "noria_15" && S.opt.pneumo) auxiliaries.push("sp_fan");
    return [...new Set([...(next ? [next] : []), ...driveInterlocks(id), ...auxiliaries])];
  }
  function missingPrerequisite(id, strict) {
    const m = S.machines[id];
    const deps = strict || (!m.manual && !m.ignore_next) ? dependenciesOf(id) : driveInterlocks(id);
    return deps.find(dep => { const d = S.machines[dep]; return !d || !d.running || d.stopping || d.fault; });
  }

  function chain() {
    const o = S.opt;
    const asp = ["as_1", "sluice_1", "as_2", "sluice_2", "as_3", "sluice_3",
      "conv_22_4", "noria_23", "conv_22_3", "conv_22_2", "conv_22_1", "noria_24"];
    let body = ["noria_20"];
    if (o.pneumo) body = ["sp_fan", "sp_18", ...body];
    body = ["noria_15", ...body];
    if (o.triers) {
      const t = [];
      if (o.trier1) t.push("bt_14_1");
      if (o.trier2) t.push("bt_14_2");
      body = [...t, ...body];
    }
    body = ["noria_12", "beater_10", "tor_10", "noria_8", "beater_6", "muz_6", ...body];
    if (o.op) body = ["op_5", ...body];
    body = ["noria_4", "intake", ...body];
    const out = [];
    [...asp, ...body].forEach((id) => { if (S.machines[id] && !out.includes(id)) out.push(id); });
    return out;
  }

  function need() {
    const o = S.opt;
    const n = ["intake", "noria_4", "muz_6", "beater_6", "noria_8", "tor_10", "beater_10",
      "noria_12", "noria_15", "noria_20"];
    if (o.op) n.push("op_5");
    if (o.triers) { if (o.trier1) n.push("bt_14_1"); if (o.trier2) n.push("bt_14_2"); }
    if (o.pneumo) n.push("sp_18", "sp_fan");
    return n;
  }

  /* --------------------------------------------------------------- маршруты */
  const PATH = (pts, spd) => ({ k: "path", pts, spd: spd || V_CHUTE });
  const DWELL = (t, p) => ({ k: "dwell", t, x: p[0], y: p[1] });
  const FILL = (b) => ({ k: "fill", b });

  function mainRoute() {
    const o = S.opt;
    const r = [];
    r.push(PATH([[A.intake.bx1, A.intake.beltY], [A.intake.bx2, A.intake.beltY]], V_BELT));
    r.push(PATH([A.intake.out, A.magnet_3.in], V_CHUTE));
    r.push(PATH([A.magnet_3.in, A.magnet_3.out], V_CHUTE));
    r.push(PATH([A.magnet_3.out, A.noria_4.in], V_CHUTE));
    r.push(PATH([[A.noria_4.col, A.noria_4.bot], [A.noria_4.col, A.noria_4.top]], V_LIFT));
    if (o.op) {
      r.push(PATH([A.noria_4.out, A.op_5.in], V_CHUTE));
      r.push(DWELL(1.2, [ND.op_5.x + ND.op_5.w * 0.5, ND.op_5.y + ND.op_5.h * 0.5]));
      r.push(PATH([A.op_5.out, A.bun_61.in], V_CHUTE));
    } else {
      r.push(PATH([A.noria_4.out, A.bun_61.in], V_CHUTE));
    }
    r.push(DWELL(0.8, [ND.bun_61.x + ND.bun_61.w * 0.5, ND.bun_61.y + ND.bun_61.h * 0.5]));
    r.push(PATH([A.bun_61.out, A.muz_6.in], V_CHUTE));
    r.push(DWELL(1.7, [ND.muz_6.x + ND.muz_6.w * 0.45, ND.muz_6.y + ND.muz_6.h * 0.45]));
    r.push(PATH([A.muz_6.out, A.noria_8.in], V_CHUTE));
    r.push(PATH([[A.noria_8.col, A.noria_8.bot], [A.noria_8.col, A.noria_8.top]], V_LIFT));
    r.push(PATH([A.noria_8.out, A.bun_9.in], V_CHUTE));
    r.push(DWELL(0.8, [ND.bun_9.x + ND.bun_9.w * 0.5, ND.bun_9.y + ND.bun_9.h * 0.5]));
    r.push(PATH([A.bun_9.out, A.tor_10.in], V_CHUTE));
    r.push(DWELL(1.7, [ND.tor_10.x + ND.tor_10.w * 0.45, ND.tor_10.y + ND.tor_10.h * 0.45]));
    r.push(PATH([A.tor_10.out, A.noria_12.in], V_CHUTE));
    r.push(PATH([[A.noria_12.col, A.noria_12.bot], [A.noria_12.col, A.noria_12.top]], V_LIFT));
    r.push(PATH([A.noria_12.out, A.div_10_1.in], V_CHUTE));
    if (o.triers && (o.trier1 || o.trier2)) {
      if (o.trier1) {
        r.push(PATH([A.div_10_1.oa, A.bt_14_1.in], V_CHUTE));
        r.push(DWELL(1.6, [ND.bt_14_1.x + ND.bt_14_1.w * 0.5, ND.bt_14_1.y + ND.bt_14_1.h * 0.35]));
        r.push(PATH([A.bt_14_1.out, [A.bt_14_1.out[0] + 30, A.bt_14_1.out[1] + 90], A.bt_14_2.in], V_CHUTE));
      } else {
        r.push(PATH([A.div_10_1.oa, A.bt_14_2.in], V_CHUTE));
      }
      if (o.trier2) {
        r.push(DWELL(1.6, [ND.bt_14_2.x + ND.bt_14_2.w * 0.5, ND.bt_14_2.y + ND.bt_14_2.h * 0.35]));
        r.push(PATH([A.bt_14_2.out, A.noria_15.in], V_CHUTE));
      } else {
        r.push(PATH([A.bt_14_2.in, A.noria_15.in], V_CHUTE));
      }
    } else {
      r.push(PATH([A.div_10_1.ob, [A.div_10_1.ob[0] + 60, A.div_10_1.ob[1] + 40], A.noria_15.in], V_CHUTE));
    }
    r.push(PATH([[A.noria_15.col, A.noria_15.bot], [A.noria_15.col, A.noria_15.top]], V_LIFT));
    r.push(PATH([A.noria_15.out, A.div_10_2.in], V_CHUTE));
    if (o.pneumo) {
      r.push(PATH([A.div_10_2.oa, A.bun_16.in], V_CHUTE));
      r.push(DWELL(0.8, [ND.bun_16.x + ND.bun_16.w * 0.5, ND.bun_16.y + ND.bun_16.h * 0.5]));
      r.push(PATH([A.bun_16.out, A.sp_18.in], V_CHUTE));
      r.push(DWELL(2.1, [ND.sp_18.x + ND.sp_18.w * 0.42, ND.sp_18.y + ND.sp_18.h * 0.32]));
      r.push(PATH([A.sp_18.out, A.noria_20.in], V_CHUTE));
    } else {
      r.push(PATH([A.div_10_2.ob, [A.div_10_2.ob[0] + 80, A.div_10_2.ob[1] + 60], A.noria_20.in], V_CHUTE));
    }
    r.push(PATH([[A.noria_20.col, A.noria_20.bot], [A.noria_20.col, A.noria_20.top]], V_LIFT));
    r.push(PATH([A.noria_20.out, A.bun_21.in], V_CHUTE));
    r.push(FILL("V"));
    return r;
  }

  function dustRoute(i) {
    const d = DUCTS[i];
    const cyc = ["cyc_1", "cyc_2", "cyc_3"][i];
    const sl = ["sluice_1", "sluice_2", "sluice_3"][i];
    const r = [PATH(d.pts, V_DUCT)];
    r.push(DWELL(0.9, [ND[cyc].x + ND[cyc].w * 0.5, ND[cyc].y + ND[cyc].h * 0.45]));
    r.push(PATH([A[cyc].out, A[sl].out], V_CHUTE));
    r.push(PATH([A[sl].out, [A[sl].out[0], A.conv_22_4.in[1]]], V_CHUTE));
    r.push(PATH([[A[sl].out[0], A.conv_22_4.in[1]], A.conv_22_4.out], V_BELT));
    r.push(PATH([A.conv_22_4.out, A.noria_23.in], V_CHUTE));
    r.push(PATH([[A.noria_23.col, A.noria_23.bot], [A.noria_23.col, A.noria_23.top]], V_LIFT));
    r.push(PATH([A.noria_23.out, A.bun_A.in], V_CHUTE));
    r.push(FILL("A"));
    return r;
  }

  function chaffRoute(from) {
    const r = [];
    if (from === "muz") r.push(PATH([A.muz_6.waste, [A.muz_6.waste[0] + 120, A.conv_22_1.in[1] - 40], A.conv_22_1.in], V_CHUTE));
    else if (from === "tor") r.push(PATH([A.tor_10.waste, [A.tor_10.waste[0] - 60, A.conv_22_1.in[1] + 20], [ND.conv_22_1.x + ND.conv_22_1.w * 0.4, A.conv_22_1.in[1]]], V_CHUTE));
    else if (from === "trier") {
      r.push(PATH([A.bt_14_2.waste, [A.bt_14_2.waste[0] + 60, A.conv_22_2.in[1] - 40], A.conv_22_2.in], V_CHUTE));
      r.push(PATH([A.conv_22_2.in, A.conv_22_2.out], V_BELT));
      r.push(PATH([A.conv_22_2.out, [A.conv_22_2.out[0] - 40, A.conv_22_1.out[1] + 40], A.conv_22_1.out], V_CHUTE));
    } else if (from === "sp") {
      r.push(PATH([A.sp_18.waste, [A.sp_18.waste[0] + 60, A.conv_22_3.in[1] - 40], A.conv_22_3.in], V_CHUTE));
      r.push(PATH([A.conv_22_3.in, A.conv_22_3.out], V_BELT));
      r.push(PATH([A.conv_22_3.out, A.conv_22_2.out], V_CHUTE));
      r.push(PATH([A.conv_22_2.out, A.conv_22_1.out], V_CHUTE));
    }
    if (from === "muz" || from === "tor") r.push(PATH([A.conv_22_1.in, A.conv_22_1.out], V_BELT));
    r.push(PATH([A.conv_22_1.out, A.noria_24.in], V_CHUTE));
    r.push(PATH([[A.noria_24.col, A.noria_24.bot], [A.noria_24.col, A.noria_24.top]], V_LIFT));
    r.push(PATH([A.noria_24.out, A.bun_B.in], V_CHUTE));
    r.push(FILL("B"));
    return r;
  }

  let ROUTES = { main: [], dust: [], chaff: {} };
  function rebuildRoutes() {
    S.route = S.opt.triers && S.opt.pneumo ? "bt_sp" : S.opt.triers ? "bt_only" : S.opt.pneumo ? "sp_only" : "bypass";
    ROUTES.main = mainRoute();
    ROUTES.dust = [dustRoute(0), dustRoute(1), dustRoute(2)];
    ROUTES.chaff = { muz: chaffRoute("muz"), tor: chaffRoute("tor"), trier: chaffRoute("trier"), sp: chaffRoute("sp") };
    S.ROUTES = ROUTES;
  }
  rebuildRoutes();

  /* --------------------------------------------------------- датчики/аварии */
  const SENS_RU = { dks: "ДКС", dsl1: "ДСЛ 1", dsl2: "ДСЛ 2", dp: "ДП (подпор)", prot: "защита двигателя" };

  function recomputeFault(m) {
    let txt = "";
    for (const k of m.sensorList) {
      if (m.sens[k] && (k === "prot" || !m.byp[k])) { txt = m.name + ": сработал " + SENS_RU[k]; break; }
    }
    const was = m.fault;
    m.fault = !!txt; m.fault_text = txt;
    return was !== m.fault;
  }

  function stopLineByFault(m) {
    S.mode_run = S.mode_starting = S.mode_stopping = false;
    S.feed = false; S.feed_requested = false; S.seq = null;
    Object.values(S.machines).forEach((x) => { x.running = x.starting = x.stopping = false; x.t_start = x.t_stop = 0; });
    raise("Аварийный останов линии из-за " + m.name, "err");
  }

  function injectSensor(id, key) {
    const m = S.machines[id];
    if (!m) return { ok: false };
    if (!m.sensorList.includes(key)) return { ok: false, error: m.name + ": такого датчика нет" };
    m.sens[key] = true;
    recomputeFault(m);
    if (m.fault) {
      m.running = m.starting = false;
      raise(m.fault_text, "err");
      if (chain().includes(id)) stopLineByFault(m);
    } else raise(m.name + ": датчик сработал, контроль снят тумблером", "warn");
    return { ok: true };
  }

  function clearSensor(id, key) {
    const m = S.machines[id];
    if (!m) return;
    if (key) m.sens[key] = false;
    else m.sensorList.forEach((k) => { m.sens[k] = false; });
    recomputeFault(m);
  }

  function setBypass(id, key, val) {
    const m = S.machines[id];
    if (!m || key === "prot") return;
    m.byp[key] = !!val;
    const ch = recomputeFault(m);
    if (ch && !m.fault) raise(m.name + ": контроль " + (SENS_RU[key] || key) + " снят, авария квитирована", "ok");
    if (ch && m.fault) { m.running = m.starting = m.stopping = false; raise(m.fault_text, "err"); if (chain().includes(id)) stopLineByFault(m); }
  }

  /* --------------------------------------------------------- команды пульта */
  function startMachine(id, fromSeq) {
    const m = S.machines[id];
    if (!m) return { ok: false, error: "Нет такого механизма" };
    if (S.estop) return { ok: false, error: "Аварийный стоп — пуск запрещён" };
    recomputeFault(m);
    if (m.fault) return { ok: false, error: m.fault_text };
    if (fullDestination()) return { ok: false, error: "Конечный бункер заполнен" };
    if (S.alarms.some(a => a.active)) return { ok: false, error: "Сначала сбросьте устранённые аварии" };
    if (m.stopping || S.mode_stopping) return { ok: false, error: "Идёт останов" };
    if (Object.values(S.diverters).some(d => d.busy > 0)) return { ok: false, error: "Идёт перевод маршрута" };
    if (m.running || m.starting) return { ok: true };
    const missing = missingPrerequisite(id, fromSeq || S.mode_starting || S.mode_run);
    if (missing) return { ok: false, error: "Не готов обязательный механизм: " + S.machines[missing].name };
    m.stopping = false; m.starting = true;
    m.t_start = Math.max(0.2, m.delay_start);
    return { ok: true };
  }

  function stopMachine(id) {
    const m = S.machines[id];
    if (!m) return { ok: false };
    if ((S.mode_starting || S.mode_run) && chain().includes(id)) return stopMode();
    if (chain().includes(id)) S.feed = false;
    m.starting = false; m.t_start = 0;
    if (m.stopping) return { ok: true };
    if (!m.running) { m.stopping = false; return { ok: true }; }
    m.stopping = true; m.t_stop = Math.max(0.2, m.delay_stop);
    return { ok: true };
  }

  function setEstop(on, src) {
    S.estop = !!on;
    if (on) {
      S.estop_src = src || "Нажат аварийный стоп на шкафу";
      S.mode_run = S.mode_starting = S.mode_stopping = false;
      S.feed = false; S.feed_requested = false; S.seq = null;
      Object.values(S.machines).forEach((m) => { m.running = m.starting = m.stopping = false; });
      // Preserve product in the stopped route; emergency stop is not unloading.
      raise(S.estop_src, "err");
    } else raise("Аварийный стоп снят", "ok");
  }

  function routeName() {
    return {
      bt_sp: "Из завальной ямы с БТ и СП",
      bt_only: "Из завальной ямы через БТ мимо СП",
      sp_only: "Из завальной ямы мимо БТ через СП",
      bypass: "Из завальной ямы мимо БТ и мимо СП",
    }[S.route] || "—";
  }

  function startMode() {
    if (S.mode_run || S.mode_starting) return { ok: true };
    if (S.mode_stopping) return { ok: false, error: "Дождитесь останова" };
    if (fullDestination()) return { ok: false, error: "Конечный бункер заполнен" };
    if (Object.values(S.diverters).some(d => d.busy > 0)) return { ok: false, error: "Идёт перевод маршрута" };
    if (S.opt.triers && !S.opt.trier1 && !S.opt.trier2) return { ok: false, error: "Не выбран триер" };
    for (const id of chain()) { recomputeFault(S.machines[id]); if (S.machines[id].fault) return { ok: false, error: S.machines[id].fault_text }; }
    S.feed = false;
    if (S.estop) return { ok: false, error: "Аварийный стоп. Пуск режима запрещён" };
    if (S.alarms.some((a) => a.active)) return { ok: false, error: "Есть неквитированные аварии — нажмите «Сброс аварий»" };
    S.diverters.div_10_1.pos = S.opt.triers ? "trier" : "noria_12";
    S.diverters.div_10_2.pos = S.opt.pneumo ? "pneumo" : "noria_17";
    S.route = S.opt.triers && S.opt.pneumo ? "bt_sp" : S.opt.triers ? "bt_only" : S.opt.pneumo ? "sp_only" : "bypass";
    rebuildRoutes();
    S.feed_requested = true;
    S.mode_starting = true; S.mode_stopping = false; S.mode_run = false;
    S.seq = { list: startOrder(), i: 0, wait: S.settings.seq_up, dir: "up" };
    raise("Запущен режим очистки: " + routeName(), "ok");
    return { ok: true };
  }

  function stopMode() {
    S.feed = false; S.feed_requested = false;
    if (S.mode_stopping) return { ok: true };
    Object.values(S.machines).forEach(m => { m.starting = false; m.t_start = 0; });
    S.mode_starting = false; S.mode_stopping = true; S.mode_run = false;
    S.seq = { list: startOrder().reverse(), i: 0, wait: 0, dir: "down", draining: true };
    raise("Останов режима очистки", "warn");
    return { ok: true };
  }

  function ackAlarms() {
    if (S.estop) return { ok: false, error: "Сначала отожмите аварийный стоп" };
    const stuck = [];
    Object.values(S.machines).forEach((m) => {
      m.sensorList.forEach((k) => { if (m.sens[k]) stuck.push(m.name + " · " + SENS_RU[k]); });
    });
    if (stuck.length) return { ok: false, error: "Датчик ещё активен: " + stuck[0] + ". Снимите причину в окне механизма" };
    S.alarms.forEach(a => { a.active = false; });
    Object.values(S.machines).forEach((m) => recomputeFault(m));
    return { ok: true };
  }

  function switchDiverter(id, pos) {
    const d = S.diverters[id];
    if (!d) return { ok: false };
    if (pos !== d.a && pos !== d.b) return { ok: false, error: "Недопустимое положение" };
    if (d.busy > 0) return { ok: false, error: "Идёт переключение" };
    if (d.pos === pos) return { ok: true };
    if (routeLocked()) return { ok: false, error: "Маршрут занят: перевод под продуктом запрещён" };
    d.busy = d.sw; d.target = pos;
    raise("Переключатель " + id.replace("div_", "") + ": перевод в «" + (pos === d.a ? d.la : d.lb) + "»", "ok");
    return { ok: true };
  }

  /* ---------------------------------------------- равномерное движение зерна */
  function polyLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }
  function polyAt(pts, d) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + L >= d) {
        const u = L ? (d - acc) / L : 0;
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
                pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
      }
      acc += L;
    }
    const p = pts[pts.length - 1];
    return [p[0], p[1]];
  }

  function initSeg(p, s) {
    if (!s) { p.dead = true; return; }
    if (s.k === "path") {
      if (!s._L) s._L = polyLen(s.pts);
      p.t = 0;
      const pt = polyAt(s.pts, 0);
      p.x = pt[0]; p.y = pt[1];
      p.off = (Math.random() - 0.5) * 5;
    } else if (s.k === "dwell") {
      p.dw = s.t * (0.85 + Math.random() * 0.3);
      p.x = s.x + (Math.random() - 0.5) * 16;
      p.y = s.y + (Math.random() - 0.5) * 10;
    } else if (s.k === "fill") { addPile(s.b, s.b === "V" ? 0.00060 : s.b === "A" ? 0.00030 : 0.00035); p.dead = true; }
  }

  function advance(p) { p.i += 1; initSeg(p, p.route[p.i]); }

  function spawn(route, tone, r) {
    if (S.grain.length > 900) return;
    const p = { route, i: 0, tone: tone === undefined ? Math.random() : tone,
      r: r || (2.2 + Math.random() * 1.1), t: 0, off: 0 };
    initSeg(p, route[0]);
    S.grain.push(p);
  }

  function addPile(b, v) {
    if (S.piles[b] === undefined) return;
    S.piles[b] = Math.max(0, Math.min(1, S.piles[b] + v));
  }

  function stepGrain(dt) {
    const live = [];
    for (const p of S.grain) {
      const s = p.route[p.i];
      if (!s) continue;
      if (s.k === "path") {
        p.t += s.spd * dt;                       // постоянная скорость
        const pt = polyAt(s.pts, Math.min(p.t, s._L));
        p.x = pt[0] + p.off * 0.5;
        p.y = pt[1] + p.off * 0.5;
        if (p.t >= s._L) advance(p);
      } else if (s.k === "dwell") {
        p.dw -= dt;
        if (p.dw <= 0) advance(p);
      } else if (s.k === "fill") { p.dead = true; }
      if (!p.dead) live.push(p);
    }
    S.grain = live;
  }

  /* Наличие продукта в каждом механизме: 0 — пусто, 1 — идёт полным слоем.
     Значение течёт от головы линии к хвосту, поэтому при закрытии подачи
     (или когда завальная яма пуста) механизмы опорожняются волной, а не разом. */
  function stepMaterial(dt) {
    const head = S.feed && S.piles.pit > 0.002 ? 1 : 0;
    const K = 0.85;                                // скорость передачи слоя между машинами
    const put = (id, src) => {
      const m = S.machines[id];
      if (!m) return 0;
      const storage = {muz_6:"b61", tor_10:"b9", sp_18:"b16"}[id];
      const buffered = storage ? Math.min(.35, Math.max(0, (S.piles[storage] || 0) - .004) * 3.5) : 0;
      const tgt = m.running && !m.fault ? Math.min(1, Math.max(src, buffered)) : 0;
      m.mat += (tgt - m.mat) * (1 - Math.exp(-dt * (tgt > m.mat ? K : K * 0.8)));
      if (tgt === 0 && m.mat < 0.0001) m.mat = 0;
      return m.mat;
    };

    // основной тракт очистки — строго по выбранному маршруту
    let up = head;
    for (const id of flowList()) up = put(id, up);

    // битера работают вместе со своими машинами
    put("beater_6", S.machines.muz_6 ? S.machines.muz_6.mat : 0);
    put("beater_10", S.machines.tor_10 ? S.machines.tor_10.mat : 0);

    // аспирация: воздух несёт пыль, пока идёт продукт
    const mz = S.machines.muz_6 ? S.machines.muz_6.mat : 0;
    const tr = S.machines.tor_10 ? S.machines.tor_10.mat : 0;
    const sp = S.machines.sp_18 ? S.machines.sp_18.mat : 0;
    const bt = S.machines.bt_14_2 ? S.machines.bt_14_2.mat : 0;
    const dust = [mz, tr, Math.max(sp, bt)];
    let toConv4 = 0;
    ["as_1", "as_2", "as_3"].forEach((fid, i) => {
      const f = put(fid, dust[i]);
      toConv4 = Math.max(toConv4, put("sluice_" + (i + 1), f));
    });
    const c4 = put("conv_22_4", toConv4);
    put("noria_23", c4);

    // сброс отходов: шнеки 22.1–22.3 и нория 24
    const c3 = put("conv_22_3", sp);
    const c2 = put("conv_22_2", Math.max(bt, c3));
    const c1 = put("conv_22_1", Math.max(mz, tr, c2));
    put("noria_24", c1);
  }

  function stepOperative(dt) {
    const pairs = [
      ["b61", "noria_4", "muz_6", "dvu_bo61", "Бункер оперативный 6.1"],
      ["b9", "noria_8", "tor_10", "dvu_bo9", "Бункер оперативный 9"],
      ["b16", "noria_15", "sp_18", "dvu_bo16", "Бункер оперативный 16"],
    ];
    pairs.forEach(([key, inId, outId, dvuKey, name]) => {
      if (key === "b16" && !S.opt.pneumo) { S.dvuTimers[key] = 0; return; }
      const inM = S.machines[inId], outM = S.machines[outId];
      const lv = S.piles[key];
      const inflow = S.feed && inM.running ? 0.021 : 0;
      const outflow = outM.running && lv > 0.004
        ? (0.020 + 0.004 * Math.sin(S.clock * 0.35 + key.length)) * Math.min(1, lv / 0.08)
        : 0;
      S.piles[key] = Math.max(0, Math.min(1, S.piles[key] + (inflow - outflow) * dt));
      if (S.piles[key] >= 0.99) {
        S.dvuTimers[key] = (S.dvuTimers[key] || 0) + dt;
        if (S.dvuTimers[key] >= S.settings[dvuKey]) {
          S.dvuTimers[key] = 0;
          if (S.feed) {
            S.feed = false;
            raise("ДВУ " + name + ": заполнен — подача остановлена (задержка " + S.settings[dvuKey] + " с)", "warn");
          }
        }
      } else S.dvuTimers[key] = 0;
    });
  }

  function stepDVU(dt) {
    const checks = [
      ["V", "dvu_a", "Бункер зерновой БЗ-А (В)", () => { S.feed = false; }],
      ["A", "dvu_waste1", "Бункер отходов А", () => stopMachine("noria_23")],
      ["B", "dvu_waste2", "Бункер отходов Б", () => stopMachine("noria_24")],
    ];
    checks.forEach(([key, dvuKey, name, act]) => {
      if (S.piles[key] >= 0.995) {
        S.dvuTimers[key] = (S.dvuTimers[key] || 0) + dt;
        if (S.dvuTimers[key] >= S.settings[dvuKey]) {
          S.dvuTimers[key] = -Infinity;
          S.feed = false;
          raise("ДВУ " + name + ": заполнен (задержка " + S.settings[dvuKey] + " с)", "warn");
          act();
        }
      } else S.dvuTimers[key] = 0;
    });
  }

  /* --------------------------------------------------------------- главный тик */
  const acc = { main: 0, dust: 0, chaff: 0, trend: 0, dustIndex: 0, chaffIndex: 0 };

  function tick(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    S.clock += dt;
    const faulty = chain().map(id => S.machines[id]).find(m => { recomputeFault(m); return m.fault; });
    if (faulty && (S.mode_run || S.mode_starting || S.mode_stopping || chain().some(id => S.machines[id].running || S.machines[id].starting))) stopLineByFault(faulty);
    // Recheck permissives while accelerating and running, not only on command.
    // Normal shutdown is reverse-topological after product drain.
    const lost = chain().find(id => {
      const m = S.machines[id];
      return (m.starting || m.running) && !m.stopping && missingPrerequisite(id, S.mode_run || S.mode_starting);
    });
    if (lost) {
      raise("Потеря готовности зависимого механизма: " + S.machines[lost].name, "err");
      stopLineByFault(S.machines[lost]);
    }
    if (S.seq) {
      const seq = S.seq;
      if (seq.draining && !S.grain.length && !chain().some(id => S.machines[id].mat > 0.003)) seq.draining = false;
      seq.wait -= dt;
      if (!seq.draining && seq.wait <= 0 && seq.i < seq.list.length) {
        const id = seq.list[seq.i], m = S.machines[id];
        if (seq.dir === "up") {
          if (m.running && !m.stopping && !m.fault) { seq.i++; seq.wait = S.settings.seq_up; }
          else if (!m.starting) {
            const result = startMachine(id, true);
            if (!result.ok) { stopLineByFault(m); raise(result.error, "err"); }
          }
        } else {
          stopMachine(id);
          if (!m.running && !m.starting && !m.stopping) { seq.i++; seq.wait = S.settings.seq_down; }
        }
      }
      if (S.seq === seq && seq.i >= seq.list.length) {
        S.seq = null;
        if (seq.dir === "up") {
          S.mode_starting = false; S.mode_run = routeReady();
          if (S.feed_requested) { const result = setFeed(true); if (!result.ok) raise(result.error, "warn"); }
        } else S.mode_stopping = S.mode_run = false;
      }
    }

    for (const m of Object.values(S.machines)) {
      if (S.estop || m.fault) { m.running = m.starting = m.stopping = false; }
      if (m.starting) { m.t_start -= dt; if (m.t_start <= 0) { m.starting = false; m.running = true; } }
      if (m.stopping) { m.t_stop -= dt; if (m.t_stop <= 0) { m.stopping = false; m.running = false; } }
      m.vib += ((m.running ? 1 : 0) - m.vib) * Math.min(1, dt * 4);
      // обороты с инерцией: разгон быстрый, выбег плавный — детали докручиваются после стопа
      const wTgt = m.running ? 1 : 0;
      m.w = m.w === undefined ? 0 : m.w;
      m.w += (wTgt - m.w) * Math.min(1, dt * (m.running ? 2.2 : 0.7));
      if (m.w < 0.004) m.w = 0;
      m.spin += m.w * dt;
      if (m.running) {
        m.phase += dt;
        m.hours_cur += dt / 3600; m.hours_total += dt / 3600;
        m.rpm = 1440 + Math.sin(m.phase) * 6;
        m.amps = (m.kind === "fan" ? 21 : 8) + Math.sin(m.phase * 0.6) * 1;
        m.load = 52 + Math.sin(m.phase * 0.25) * 8;
        m.temp += (68 - m.temp) * dt * 0.04;
        if (m.hours_to > 0 && m.hours_cur >= m.hours_to && !m.to_warned) {
          m.to_warned = true; raise("Истекло время ТО: " + m.name, "warn");
        }
      } else {
        m.rpm = 0; m.amps = 0; m.load = 0;
        m.temp += (22 - m.temp) * dt * 0.02;
      }
    }

    for (const [id, d] of Object.entries(S.diverters)) {
      if (d.busy > 0) {
        d.busy -= dt;
        if (d.busy <= 0) {
          d.busy = 0; d.pos = d.target || d.pos;
          if (id === "div_10_1") S.opt.triers = d.pos === "trier";
          if (id === "div_10_2") S.opt.pneumo = d.pos === "pneumo";
          rebuildRoutes();
        }
      }
    }

    const ok = routeReady();
    if (S.feed && !ok) S.feed = false;
    if (S.feed && S.piles.pit <= 0.002) { S.feed = false; raise("Завальная яма пуста — подача остановлена", "warn"); }

    if (S.feed) {
      acc.main += dt * S.settings.feed_rate;
      while (acc.main >= 1) {
        acc.main -= 1;
        spawn(ROUTES.main);
        S.piles.pit = Math.max(0, S.piles.pit - 0.00045);
      }
      S.prod += (S.settings.prod_nom - S.prod) * dt * 0.3;
    } else { acc.main = 0; S.prod += (0 - S.prod) * dt * 0.6; }

    acc.dust += dt * 3;
    while (acc.dust >= 1) {
      acc.dust -= 1;
      const i = acc.dustIndex++ % 3;
      const fan = S.machines["as_" + (i + 1)], sl = S.machines["sluice_" + (i + 1)];
      if (S.feed && fan.running && sl.running && S.machines.conv_22_4.running) {
        spawn(ROUTES.dust[i], -1, 1.4 + Math.random() * 0.5);
      }
    }

    acc.chaff += dt * 4;
    while (acc.chaff >= 1) {
      acc.chaff -= 1;
      if (!S.feed || !S.machines.noria_24.running) break;
      const keys = [];
      if (S.machines.muz_6.running && S.machines.conv_22_1.running) keys.push("muz");
      if (S.machines.tor_10.running && S.machines.conv_22_1.running) keys.push("tor");
      if (S.opt.triers && S.machines.bt_14_2.running && S.machines.conv_22_2.running) keys.push("trier");
      if (S.opt.pneumo && S.machines.sp_18.running && S.machines.conv_22_3.running) keys.push("sp");
      if (!keys.length) break;
      spawn(ROUTES.chaff[keys[acc.chaffIndex++ % keys.length]], -2, 1.8 + Math.random() * 0.6);
    }

    // A trip freezes retained material; acknowledgement never unloads the route.
    if (!S.estop && !faulty) {
      stepGrain(dt);
      stepMaterial(dt);
      stepOperative(dt);
    }
    stepDVU(dt);

    acc.trend += dt;
    if (acc.trend >= 1) {
      acc.trend = 0;
      S.agent += ((S.mode_run ? 62 : 22) - S.agent) * 0.04;
      S.humOut += ((S.feed ? 13.2 : 18.6) - S.humOut) * 0.03;
      S.trend.temp.push(S.agent); S.trend.hum.push(S.humOut); S.trend.prod.push(S.prod);
      ["temp", "hum", "prod"].forEach((k) => { if (S.trend[k].length > 120) S.trend[k].shift(); });
    }
  }

  function setFeed(on) {
    if (on) {
      if (S.estop || S.mode_stopping || fullDestination() || S.alarms.some(a => a.active)) return { ok: false, error: "Подача заблокирована: стоп, авария или полный бункер" };
      if (!routeReady()) return { ok: false, error: "Маршрут не готов" };
      if (!S.mode_run) return { ok: false, error: "Режим очистки не запущен" };
      if (S.piles.pit <= 0.002) return { ok: false, error: "Завальная яма пуста — загрузите зерно" };
      const miss = need().filter((id) => !(S.machines[id] && S.machines[id].running));
      if (miss.length) return { ok: false, error: "Не все механизмы тракта в работе" };
      S.feed = true; S.feed_requested = true;
      raise("Подача зерна открыта", "ok");
    } else {
      S.feed = false;
      raise("Подача зерна закрыта оператором", "info");
    }
    return { ok: true };
  }

  function refillPit() {
    S.piles.pit = Math.max(0, Math.min(1, S.settings.pit_load / 100));
    raise("Завальная яма загружена автотранспортом до " + Math.round(S.piles.pit * 100) + " %", "ok");
    return { ok: true };
  }

  const DEFAULT_SETTINGS = JSON.parse(JSON.stringify(S.settings));
  function resetSettings() {
    Object.assign(S.settings, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
    raise("Настройки возвращены к заводским значениям", "info");
  }

  function statusLine() {
    if (S.estop) return S.estop_src;
    if (S.mode_starting) return "Идёт запуск режима очистки — механизмы с хвоста линии";
    if (S.mode_stopping) return "Идёт останов режима очистки — с головы линии";
    if (S.mode_run) return S.feed ? "Режим очистки — линия в работе" : "Режим очистки — подача закрыта";
    const a = S.alarms.find((x) => x.active);
    return a ? a.message : "Линия остановлена";
  }

  global.PLANT = {
    S, W, H, ND, A, DUCTS, ROUTES,
    tick, startMachine, stopMachine, setEstop, startMode, stopMode, routeLocked, setOptions,
    ackAlarms, switchDiverter, raise, chain, need, nextOf, flowList,
    injectSensor, clearSensor, setBypass, recomputeFault,
    statusLine, routeName, rebuildRoutes, addPile, ts,
    dependenciesOf, driveInterlocks, startOrder, routeReady,
    setFeed, refillPit, resetSettings, DEFAULT_SETTINGS,
  };
})(window);
