/* ЛПЗС «Родина» — Canvas-рендерер на реальных 2D-моделях оборудования.
   Спрайты assets/*.webp рисуются по геометрии узлов без растяжения,
   поверх — равномерный поток зерна, уровни бункеров и индикация состояний. */

(function (global) {
  "use strict";

  const P = global.PLANT;
  const S = P.S;

  let cv, ctx, scale = 1, offX = 0, offY = 0, hover = null;
  const IMG = {};
  const GRAIN_TEXTURE = {};
  const TEXTURED = new Set(["intake", "tor", "muz", "pneumo"]);
  const VAR = {};
  let ready = false;

  const SPRITES = ["intake", "magnet", "noria", "debearder", "hopper", "muz",
    "fan", "tor", "trier", "diverter", "pneumo", "silo", "screw", "cyclone", "truck"];

  const C = {
    bg0: "#0a1119", bg1: "#0e1822", grid: "#13202c",
    grain0: "#f0c24e", grain1: "#d9a333", grain2: "#a9761c",
    dust: "rgba(178,176,166,.75)", chaff: "#8a6a2e",
    duct: "#a45fb0", pipe: "#3d4a57",
    text: "#c8d4e0", textDim: "#7a8898",
    ok: "#37b866", warn: "#d9a53a", bad: "#d9483c", info: "#4b8fd1",
  };
  const SENS = { dks: "ДКС", dsl1: "ДСЛ1", dsl2: "ДСЛ2", dp: "ДП", prot: "ЗАЩИТА" };

  function tint(img, filter) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d");
    x.filter = filter;
    x.drawImage(img, 0, 0);
    return c;
  }

  function init(canvas, onReady) {
    cv = canvas;
    ctx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentElement);
    let left = SPRITES.length;
    const done = () => { if (--left === 0) { ready = true; if (onReady) onReady(); } };
    SPRITES.forEach((name) => {
      const im = new Image();
      im.onload = () => {
        IMG[name] = im;
        VAR[name] = {
          norm: tint(im, "saturate(0.92) brightness(0.96)"),
          idle: tint(im, "saturate(0.3) brightness(0.52)"),
          fault: tint(im, "saturate(1.5) brightness(0.82) sepia(0.35) hue-rotate(-28deg)"),
        };
        done();
      };
      im.onerror = done;
      if (TEXTURED.has(name)) {
        const grain = new Image(); grain.onload = () => { GRAIN_TEXTURE[name] = grain; };
        grain.src = "assets/" + name + "_grain.png";
      }
      im.src = "assets/" + name + (TEXTURED.has(name) ? "_empty.png" : ".webp");
    });
    const lg = new Image();
    lg.onload = () => { IMG.logo = lg; };
    lg.src = "assets/logo.webp";
  }

  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(320, Math.round(r.width * dpr));
    cv.height = Math.max(200, Math.round(r.height * dpr));
    cv.style.width = r.width + "px";
    cv.style.height = r.height + "px";
    scale = Math.min(cv.width / S.W, cv.height / S.H);
    offX = (cv.width - S.W * scale) / 2;
    offY = (cv.height - S.H * scale) / 2;
  }

  const SX = (wx) => offX + wx * scale;
  const SY = (wy) => offY + wy * scale;

  function toWorld(px, py) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width || !r.height) return [NaN, NaN];
    return [((px - r.left) * cv.width / r.width - offX) / scale, ((py - r.top) * cv.height / r.height - offY) / scale];
  }

  function hitAt(wx, wy) {
    let best = null, area = 1e12;
    for (const [id, n] of Object.entries(S.ND)) {
      if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) {
        const a = n.w * n.h;
        if (a < area) { area = a; best = id; }
      }
    }
    return best;
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function activeSegs() {
    const set = new Set();
    for (const p of S.grain) {
      const s = p.route[p.i];
      if (s && s.k === "path") set.add(s);
    }
    return set;
  }

  function drawPipes(active) {
    const routes = [];
    if (S.ROUTES) {
      if (S.ROUTES.main) routes.push(S.ROUTES.main);
      (S.ROUTES.dust || []).forEach((r) => routes.push(r));
      Object.values(S.ROUTES.chaff || {}).forEach((r) => routes.push(r));
    }
    const seen = new Set();
    routes.forEach((route) => {
      route.forEach((s) => {
        if (s.k !== "path" || s.spd >= 120) return;
        const key = s.pts.map((p) => p.join(",")).join(";");
        if (seen.has(key)) return;
        seen.add(key);
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = C.pipe; ctx.lineWidth = 11; ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 3.5; ctx.stroke();
        if (active.has(s)) {
          ctx.beginPath();
          s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.strokeStyle = "rgba(240,194,78,.7)";
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 10]);
          ctx.lineDashOffset = -(performance.now() / 1000) * 34;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    });
  }

  function drawDucts() {
    S.DUCTS.forEach((d) => {
      const m = S.machines[d.id];
      const on = m && m.running;
      ctx.save();
      ctx.lineJoin = "round";
      ctx.beginPath();
      d.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = on ? "rgba(164,95,176,.85)" : "rgba(164,95,176,.32)";
      ctx.lineWidth = 4.5;
      ctx.setLineDash([14, 10]);
      if (on) ctx.lineDashOffset = -(performance.now() / 1000) * 40;
      ctx.stroke();
      ctx.restore();
      const p0 = d.pts[0];
      ctx.font = "700 14px 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = on ? "#cb92d4" : "#7a5a80";
      ctx.fillText(d.poz, p0[0] + 8, p0[1] - 12);
    });
  }

  function variantFor(m) {
    if (!m) return "norm";
    if (m.fault) return "fault";
    if (m.running || m.starting) return "norm";
    return "idle";
  }

  function drawSprite(id) {
    const n = S.ND[id];
    if (!n || !n.sprite) return;
    const set = VAR[n.sprite];
    if (!set) return;
    const m = S.machines[id];
    const v = set[variantFor(m)] || set.norm;
    ctx.save();
    if (m && m.running && m.vib > 0.15 && n.kind !== "screw" && n.kind !== "trier") {
      const t = performance.now() / 1000;
      ctx.translate(Math.sin(t * 34) * 0.55 * m.vib, Math.cos(t * 29) * 0.4 * m.vib);
    }
    ctx.drawImage(v, n.x, n.y, n.w, n.h);
    const grain = GRAIN_TEXTURE[n.sprite];
    if (grain) {
      // Original artwork alpha mask: no grain can cover steel or leave the housing.
      const amount = Math.max(0, Math.min(1, n.kind === "intake" ? (S.piles.pit || 0) : (m ? m.mat : 0)));
      if (n.kind === "intake") {
        const split = .44, gh = grain.naturalHeight, gw = grain.naturalWidth;
        ctx.globalAlpha = amount;
        ctx.drawImage(grain, 0, 0, gw, gh*split, n.x, n.y, n.w, n.h*split);
        ctx.globalAlpha = Math.max(0, Math.min(1, m ? m.mat : 0));
        ctx.drawImage(grain, 0, gh*split, gw, gh*(1-split), n.x, n.y+n.h*split, n.w, n.h*(1-split));
      } else {
        ctx.globalAlpha = amount;
        ctx.drawImage(grain, n.x, n.y, n.w, n.h);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function grainWindows() {
    const t = performance.now() / 1000;
    for (const [id, n] of Object.entries(S.ND)) {
      const a = S.A[id];
      const m = S.machines[id];
      if (!a || !a.win || !m) continue;
      // Solid mechanisms own their occlusion; do not draw schematic grain over steel.
      if (n.kind === "screw" || n.kind === "trier" || TEXTURED.has(n.sprite)) continue;
      const mat = m.mat || 0;
      if (mat <= 0) continue;                    // продукт кончился — окно пустое
      const [ux, uy, uw, uh] = a.win;
      const x = n.x + ux * n.w, y = n.y + uy * n.h, w = uw * n.w, h = uh * n.h;
      ctx.save();
      rr(x, y, w, h, 3); ctx.clip();
      ctx.globalAlpha = 0.8 * Math.min(1, mat * 1.25);
      if (n.kind === "noria") {
        const step = 17, off = (m.spin * 66) % step;
        for (let gy = y + h + step; gy > y - step; gy -= step) {
          const py = gy - off;
          ctx.fillStyle = C.grain1;
          ctx.beginPath(); ctx.ellipse(x + w * 0.5, py, w * 0.32, 3.4, 0, 0, 7); ctx.fill();
          ctx.fillStyle = C.grain0;
          ctx.beginPath(); ctx.ellipse(x + w * 0.5, py - 1.4, w * 0.2, 2, 0, 0, 7); ctx.fill();
        }
      } else if (n.kind === "screw" || n.kind === "intake") {
        const step = 15, off = (m.spin * 44) % step;
        ctx.fillStyle = C.grain1;
        for (let gx = x - step; gx < x + w + step; gx += step) {
          ctx.beginPath(); ctx.ellipse(gx + off, y + h * 0.6, 4.4, 3, 0, 0, 7); ctx.fill();
        }
      } else {
        const off = (m.spin * 20) % 13;
        ctx.fillStyle = "rgba(240,194,78,.42)";
        ctx.fillRect(x, y + h * (0.84 - 0.34 * mat), w, h * 0.34 * mat + 2);
        ctx.fillStyle = "rgba(217,163,51,.55)";
        for (let gx = x - 13; gx < x + w + 13; gx += 13) {
          ctx.beginPath(); ctx.ellipse(gx + off, y + h * 0.68, 3.6, 2.5, 0, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // Sprite-local service apertures, measured against the 620px source artwork.
  // These deliberately do NOT use the product-flow anchors in plant.js: those
  // anchors are schematic and overlap the green frame / drive motors.
  const MECH_WINDOWS = {
    screw: [0.165, 0.245, 0.425, 0.305],
    trier: [[0.105, 0.047, 0.627, 0.203], [0.105, 0.504, 0.627, 0.190]],
  };
  const TAU = Math.PI * 2;

  function metalGradient(y, h, dark) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    const stops = dark ? ["#253039", "#77858b", "#45555e", "#18242c"]
      : ["#35454f", "#d4e0e3", "#7c949f", "#253640"];
    [0, 0.28, 0.55, 1].forEach((p, i) => g.addColorStop(p, stops[i]));
    return g;
  }

  function face(points, color) {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  function drawScrewSolid(n, m) {
    const [ux, uy, uw, uh] = MECH_WINDOWS.screw;
    const x = n.x + ux*n.w, y = n.y + uy*n.h, len = uw*n.w, h = uh*n.h;
    const cy = y + h*0.48, radius = h*0.43, shaft = radius*0.21;
    const pitch = len/6.5, skew = radius*0.28, angle = (m.spin || 0)*4.8;
    const dark = !m.running, facets = [];
    ctx.save();
    // Opaque cavity replaces the old static flights, only inside the cutaway.
    ctx.beginPath(); ctx.rect(x, y, len, h); ctx.clip();
    ctx.fillStyle = "#101e24"; ctx.fillRect(x, y, len, h);
    const wall = ctx.createLinearGradient(0, y, 0, y+h);
    wall.addColorStop(0, "#071116"); wall.addColorStop(0.55, "#30413b"); wall.addColorStop(1, "#101c1c");
    ctx.fillStyle = wall; ctx.fillRect(x, y, len, h);
    const project = (u, r, a) => [x+u+skew*(r/radius)*Math.sin(a), cy+r*Math.cos(a)];
    // A helicoid is a filled radial sheet, not a sinusoidal outline. Each
    // angular strip has a rear face, a front face and a thick outer edge.
    const count = 360, start = -pitch, end = len+pitch;
    for (let i = 0; i < count; i++) {
      const u = start+(end-start)*i/count, v = start+(end-start)*(i+1)/count;
      const a = TAU*u/pitch+angle, b = TAU*v/pitch+angle;
      const mid = (a+b)*0.5, z = Math.sin(mid);
      const light = Math.max(0, Math.min(1, 0.48+0.32*Math.cos(mid-0.7)+0.16*z));
      const base = (dark ? 48 : 66)+light*(dark ? 83 : 131);
      const color = `rgb(${base|0},${(base+12)|0},${(base+19)|0})`;
      facets.push({z, points: [project(u,shaft,a),project(u,radius,a),project(v,radius,b),project(v,shaft,b)],
        edge: [project(u,radius,a),project(v,radius,b)], color});
    }
    facets.sort((a,b) => a.z-b.z);
    const paint = (f) => {
      face(f.points, f.color);
      // Narrow axial extrusion gives the flight a visible solid steel rim.
      const a=f.edge[0], b=f.edge[1], thick=Math.max(0.65,n.w*0.0018);
      face([a,b,[b[0]+thick,b[1]+0.35],[a[0]+thick,a[1]+0.35]], f.z>0 ? "#bacbd1" : "#3a4e58");
    };
    facets.filter(f=>f.z<0).forEach(paint);
    // Opaque shaft occludes the far half of every flight.
    ctx.fillStyle = metalGradient(cy-shaft, shaft*2, dark);
    ctx.fillRect(x,cy-shaft,len,shaft*2);
    facets.filter(f=>f.z>=0).forEach(paint);
    // Fixed front trough lip occludes the lower flight tips; never rotates.
    ctx.fillStyle = "#203c32"; ctx.fillRect(x,y+h-2.4,len,2.4);
    ctx.fillStyle = "#597365"; ctx.fillRect(x,y+h-2.4,len,0.7);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x,y,2,h); ctx.fillRect(x+len-2,y,2,h);
    ctx.restore();
  }

  function drawTrierDrum(n, m, win, index) {
    const [ux,uy,uw,uh]=win;
    const x=n.x+ux*n.w, y=n.y+uy*n.h, width=uw*n.w, h=uh*n.h;
    const r=h*0.455, cy=y+h*0.50, ex=r*0.30;
    const left=x+ex+1.5, right=x+width-ex-1.5, length=right-left;
    const angle=(m.spin||0)*3.8+index*0.43, dark=!m.running;
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,width,h); ctx.clip();
    // Erase only the cylinder bays. Frame, cross-members, legs and motors
    // remain the original untransformed sprite outside these apertures.
    ctx.fillStyle="#11231e"; ctx.fillRect(x,y,width,h);
    ctx.fillStyle="#0a1419"; ctx.fillRect(left,y+h-3,length,3);
    ctx.fillStyle=metalGradient(cy-r*0.14,r*0.28,dark);
    ctx.fillRect(x,cy-r*0.14,width,r*0.28); // exposed shaft journals
    ctx.fillStyle=metalGradient(cy-r,2*r,dark);
    ctx.beginPath(); ctx.ellipse(left,cy,ex,r,0,0,TAU); ctx.fill();
    // The cylinder silhouette: straight generators and elliptical ends.
    ctx.beginPath(); ctx.moveTo(left,cy-r); ctx.lineTo(right,cy-r);
    ctx.ellipse(right,cy,ex,r,0,-Math.PI/2,Math.PI/2);
    ctx.lineTo(left,cy+r); ctx.ellipse(left,cy,ex,r,0,Math.PI/2,Math.PI*1.5);
    ctx.closePath(); ctx.fillStyle=metalGradient(cy-r,2*r,dark); ctx.fill();
    ctx.save(); ctx.clip();
    const project=(u,a)=>[left+u+ex*Math.cos(a),cy+r*Math.sin(a)];
    const cols=27, rows=22, da=0.053, half=length/cols*0.19;
    // Fixed axial columns, rotating circumferential rows. Back-facing cells
    // are culled, and each cell contracts naturally at the cylinder limb.
    for(let row=0;row<rows;row++) {
      const a=angle+row*TAU/rows;
      if(Math.cos(a)<=0.06) continue;
      const depth=Math.cos(a);
      for(let col=0;col<cols;col++) {
        const u=(col+0.45+(row%2)*0.22)*length/cols;
        const cell=[];
        for(let k=0;k<8;k++) {
          const t=k*TAU/8;
          cell.push(project(u+half*Math.cos(t),a+da*Math.sin(t)));
        }
        face(cell,`rgba(9,20,27,${0.40+depth*0.38})`);
        const p=project(u-half*0.7,a+da), q=project(u+half*0.7,a+da);
        ctx.strokeStyle=`rgba(220,235,238,${depth*0.42})`; ctx.lineWidth=0.45;
        ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
      }
    }
    ctx.restore();
    // Raised end ring and solid cap hide surface cells behind the near end.
    ctx.fillStyle=metalGradient(cy-r,2*r,dark);
    ctx.beginPath(); ctx.ellipse(right,cy,ex,r,0,0,TAU); ctx.fill();
    ctx.strokeStyle="#31444e"; ctx.lineWidth=1.1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(right,cy,ex*0.77,r*0.83,0,0,TAU); ctx.stroke();
    // Two cap fasteners actually orbit; cap, shaft and shell do not wobble.
    for(let k=0;k<2;k++) {
      const a=angle+k*Math.PI;
      ctx.fillStyle="#d0dbdc"; ctx.beginPath();
      ctx.ellipse(right+ex*0.60*Math.cos(a),cy+r*0.60*Math.sin(a),0.75,1.0,0,0,TAU); ctx.fill();
    }
    ctx.fillStyle="#334a52"; ctx.beginPath(); ctx.ellipse(right,cy,ex*0.32,r*0.18,0,0,TAU); ctx.fill();
    ctx.fillStyle=metalGradient(cy-r*0.11,r*0.22,dark);
    ctx.fillRect(right,cy-r*0.11,x+width-right,r*0.22);
    ctx.restore();
  }

  function drawMoving(id) {
    const n = S.ND[id], m = S.machines[id];
    if (!n || !m) return;
    // Render these even at rest: stopping must freeze, never reveal the old sprite.
    if (n.kind === "screw") { drawScrewSolid(n, m); return; }
    if (n.kind === "trier") {
      MECH_WINDOWS.trier.forEach((win, i) => drawTrierDrum(n, m, win, i));
      return;
    }
    const w = m.w || 0;
    if (w < 0.02) return;
    const spin = m.spin || 0;
    const mat = m.mat || 0;
    const steel = "rgba(214,226,240,.5)";
    ctx.save();

    if (n.kind === "intake") {
      // скребки приёмного транспортёра
      const a = S.A[id];
      if (a && a.beltY !== undefined) {
        const off = (spin * 46) % 30;
        ctx.strokeStyle = steel; ctx.lineWidth = 1.8;
        for (let x = a.bx1; x <= a.bx2; x += 30) {
          const px = x + off;
          if (px > a.bx2) continue;
          ctx.beginPath(); ctx.moveTo(px, a.beltY - 6); ctx.lineTo(px, a.beltY + 6); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /* уровень зерна в завальной яме — видно, как она пустеет */
  function drawPit() {
    const n = S.ND.intake, a = S.A.intake;
    if (!n || !a) return;
    const f = Math.max(0, Math.min(1, S.piles.pit || 0));
    const x = n.x + n.w * 0.10, w = n.w * 0.50;
    const yTop = n.y + n.h * 0.30, hMax = n.h * 0.30;
    ctx.save();
    ctx.globalAlpha = 0.92;
    if (f > 0.006) {
      const h = hMax * f, y = yTop + hMax - h;
      ctx.beginPath();
      ctx.moveTo(x, yTop + hMax);
      ctx.lineTo(x, y + 5);
      ctx.quadraticCurveTo(x + w * 0.5, y - 9 * f, x + w, y + 5);
      ctx.lineTo(x + w, yTop + hMax);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, y, 0, yTop + hMax);
      g.addColorStop(0, C.grain0); g.addColorStop(1, C.grain2);
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "rgba(120,74,14,.22)";
      const cnt = Math.floor(f * 42);
      for (let i = 0; i < cnt; i++) {
        ctx.fillRect(x + 6 + ((i * 47) % Math.max(6, w - 12)),
                     yTop + hMax - 4 - ((i * 31) % Math.max(4, h - 5)), 2.3, 2.3);
      }
    } else {
      // яма пуста — видно дно
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(38,50,66,.7)";
      ctx.fillRect(x, yTop + hMax - 5, w, 5);
    }
    ctx.restore();
  }

  function drawLevels() {
    const map = { bun_21: "V", bun_A: "A", bun_B: "B", bun_61: "b61", bun_9: "b9", bun_16: "b16" };
    for (const [id, key] of Object.entries(map)) {
      const n = S.ND[id], a = S.A[id];
      const f = S.piles[key] || 0;
      if (!n || !a || f <= 0.004) continue;
      const body = a.body || [0.16, 0.10, 0.68, 0.46];
      const cone = a.cone || [0.20, 0.58, 0.60, 0.30];
      const bx = n.x + body[0] * n.w, by = n.y + body[1] * n.h;
      const bw = body[2] * n.w, bh = body[3] * n.h;
      const cx = n.x + cone[0] * n.w, cy = n.y + cone[1] * n.h;
      const cw = cone[2] * n.w, ch = cone[3] * n.h;
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx + cw, cy);
      ctx.lineTo(cx + cw * 0.58, cy + ch); ctx.lineTo(cx + cw * 0.42, cy + ch);
      ctx.closePath();
      const gc = ctx.createLinearGradient(0, cy, 0, cy + ch);
      gc.addColorStop(0, C.grain1); gc.addColorStop(1, C.grain2);
      ctx.fillStyle = gc; ctx.fill();
      const gh = bh * f, gy = by + bh - gh;
      ctx.beginPath();
      ctx.moveTo(bx, by + bh);
      ctx.lineTo(bx, gy + 6);
      ctx.quadraticCurveTo(bx + bw / 2, gy - 8, bx + bw, gy + 6);
      ctx.lineTo(bx + bw, by + bh);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, gy, 0, by + bh);
      g.addColorStop(0, C.grain0); g.addColorStop(1, C.grain2);
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "rgba(120,74,14,.26)";
      const cnt = Math.floor(f * 60);
      for (let i = 0; i < cnt; i++) {
        ctx.fillRect(bx + 5 + ((i * 53) % Math.max(6, bw - 10)),
                     by + bh - 4 - ((i * 29) % Math.max(4, gh - 6)), 2.4, 2.4);
      }
      ctx.restore();
    }
  }

  function drawGrain() {
    for (const p of S.grain) {
      if (p.route[p.i] && p.route[p.i].k === "dwell") continue;
      if (Object.values(S.ND).some(n => TEXTURED.has(n.sprite) && p.x > n.x && p.x < n.x+n.w && p.y > n.y && p.y < n.y+n.h)) continue;
      let col;
      if (p.tone === -1) col = C.dust;
      else if (p.tone === -2) col = C.chaff;
      else col = p.tone < 0.34 ? C.grain0 : p.tone < 0.68 ? C.grain1 : C.grain2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.72, 0.6, 0, 7);
      ctx.fillStyle = col;
      ctx.fill();
    }
  }

  let VOPT = { labels: true, pipes: true, ducts: true, legend: true };
  let labelQ = [];
  function flushLabels() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const it of labelQ) {
      const px = SX(it.x), py = SY(it.y);
      if (it.t === "name") {
        ctx.font = "600 12px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(6,10,14,.9)";
        ctx.strokeText(it.s, px, py);
        ctx.fillStyle = C.text; ctx.fillText(it.s, px, py);
      } else {
        ctx.font = "600 10px 'Segoe UI', sans-serif";
        const w = ctx.measureText(it.s).width + 12;
        rr(px - w / 2, py - 8, w, 15, 2.5);
        ctx.fillStyle = "rgba(10,17,25,.92)"; ctx.fill();
        ctx.strokeStyle = "#27333f"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#8494a4"; ctx.textAlign = "center";
        ctx.fillText(it.s, px, py + 3.5);
      }
    }
    labelQ = [];
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function queueLabels() {
    for (const [id, n] of Object.entries(S.ND)) {
      const m = S.machines[id];
      if (!m) continue;
      const nm = m.name
        .replace("Конвейер шнековый ", "Шнек ")
        .replace("Бункер оперативный БО-1 ", "БО-1 ")
        .replace("Бункер отходов 2х10 ", "Бункер ")
        .replace("Бункер зерновой ", "")
        .replace("Комплект аспирации ", "")
        .replace("Переключатель потока ", "Поток ")
        .replace("Стол пневмосортировальный ", "")
        .replace("Магнитный сепаратор ", "Магнит ")
        .replace("Яма завальная с конвейером", "Завальная яма")
        .replace("Остеобрушиватель ", "");
      labelQ.push({ t: "name", x: n.x + n.w / 2, y: n.y - 10, s: nm });
      if (m.poz) labelQ.push({ t: "poz", x: n.x + n.w / 2, y: n.y + n.h + 16, s: m.poz });
    }
  }

  const TAG = {
    fault:   { bg: "rgba(58,16,14,.95)", br: "#d9483c", fg: "#ffb3aa", blink: true },
    timer:   { bg: "rgba(52,40,10,.95)", br: "#d9a53a", fg: "#ffdf9c" },
    stopped: { bg: "rgba(22,29,37,.95)", br: "#6f7d8c", fg: "#c2ccd8" },
    manual:  { bg: "rgba(18,36,56,.95)", br: "#4b8fd1", fg: "#a9d0f2" },
    bypass:  { bg: "rgba(42,24,50,.95)", br: "#a45fb0", fg: "#dcb2e4" },
    to:      { bg: "rgba(46,34,10,.95)", br: "#b08a2a", fg: "#f0d79a" },
  };

  function shortFault(m) {
    for (const k of m.sensorList) if (m.sens[k] && !m.byp[k]) return "АВАРИЯ · " + SENS[k];
    return "АВАРИЯ";
  }

  function tagsFor(id, m, chainSet) {
    const t = [];
    if (m.fault) t.push(["fault", shortFault(m)]);
    if (m.starting) t.push(["timer", "ПУСК " + m.t_start.toFixed(1) + " с"]);
    if (m.stopping) t.push(["timer", "ОСТАНОВ " + m.t_stop.toFixed(1) + " с"]);
    if (!m.running && !m.starting && !m.stopping && !m.fault &&
        (S.mode_run || S.mode_starting) && chainSet.has(id)) t.push(["stopped", "НЕ В РАБОТЕ"]);
    if (m.manual) t.push(["manual", "РР"]);
    const byp = m.sensorList.filter((k) => m.byp[k]);
    if (byp.length) t.push(["bypass", "Ø " + byp.map((k) => SENS[k]).join(" ")]);
    if (m.hours_to > 0 && m.hours_cur >= m.hours_to) t.push(["to", "ТО"]);
    return t;
  }

  function drawTag(x, y, text, kind) {
    const st = TAG[kind] || TAG.stopped;
    ctx.font = "700 11px 'Segoe UI', sans-serif";
    const w = ctx.measureText(text).width + 16, h = 18;
    const a = st.blink ? 0.8 + 0.2 * Math.sin(performance.now() / 180) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
    rr(x, y, w, h, 3); ctx.fillStyle = st.bg; ctx.fill();
    ctx.restore();
    rr(x, y, w, h, 3); ctx.strokeStyle = st.br; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = st.br; ctx.fillRect(x + 2, y + 2, 3, h - 4);
    ctx.fillStyle = st.fg; ctx.textAlign = "left";
    ctx.fillText(text, x + 11, y + 12.5);
    return w;
  }

  function drawAnnotations() {
    const chainSet = new Set(P.chain());
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [id, m] of Object.entries(S.machines)) {
      const n = S.ND[id];
      if (!n) continue;
      const tags = tagsFor(id, m, chainSet);
      if (!tags.length) continue;
      const right = n.x + n.w < S.W - 430;
      const ax = SX(right ? n.x + n.w : n.x);
      const ay = SY(n.y + Math.min(26, n.h * 0.12));
      const tx = ax + (right ? 12 : -12);
      ctx.strokeStyle = "rgba(150,168,188,.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay + 9); ctx.lineTo(tx, ay + 9); ctx.stroke();
      ctx.beginPath(); ctx.arc(ax, ay + 9, 1.8, 0, 7);
      ctx.fillStyle = "rgba(150,168,188,.7)"; ctx.fill();
      tags.slice(0, 4).forEach(([k, s], i) => {
        ctx.font = "700 11px 'Segoe UI', sans-serif";
        const w = ctx.measureText(s).width + 16;
        drawTag(right ? tx : tx - w, ay + i * 21, s, k);
      });
    }
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function drawBunkerText() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const map = { bun_21: "V", bun_A: "A", bun_B: "B" };
    for (const [id, key] of Object.entries(map)) {
      const n = S.ND[id];
      if (!n) continue;
      const f = (S.piles[key] || 0) * 100;
      const px = SX(n.x + n.w / 2), py = SY(n.y + n.h * 0.32);
      ctx.font = "800 26px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(8,12,18,.88)";
      ctx.strokeText(n.letter, px, py);
      ctx.fillStyle = "#e8eef5"; ctx.fillText(n.letter, px, py);
      ctx.font = "700 14px 'Segoe UI', sans-serif";
      const txt = Math.round(f) + "%";
      const w = ctx.measureText(txt).width + 14;
      rr(px - w / 2, py + 8, w, 19, 3);
      ctx.fillStyle = "rgba(10,17,25,.9)"; ctx.fill();
      ctx.strokeStyle = f >= 95 ? C.bad : C.ok; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = f >= 95 ? "#ffb3aa" : "#b6f0c8";
      ctx.fillText(txt, px, py + 22);
    }
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function drawLegend() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = 240, h = 108, x = 14, y = cv.height - h - 14;
    rr(x, y, w, h, 6);
    ctx.fillStyle = "rgba(8,14,20,.9)"; ctx.fill();
    ctx.strokeStyle = "#212c38"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = "700 11px 'Segoe UI', sans-serif";
    ctx.textAlign = "left"; ctx.fillStyle = C.textDim;
    ctx.fillText("СОСТОЯНИЕ МЕХАНИЗМОВ", x + 13, y + 19);
    [[C.ok, "работа"], [C.warn, "пуск / останов по задержке"], [C.bad, "авария по датчику"],
     [C.info, "РР — ручной режим"], [C.duct, "Ø — контроль датчика снят"]]
      .forEach(([col, s], i) => {
        const iy = y + 37 + i * 14;
        ctx.beginPath(); ctx.arc(x + 19, iy - 3.5, 3.6, 0, 7);
        ctx.fillStyle = col; ctx.fill();
        ctx.font = "500 11px 'Segoe UI', sans-serif";
        ctx.fillStyle = "#94a3b3"; ctx.fillText(s, x + 30, iy);
      });
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function drawEstopBanner() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = 440, h = 46, x = (cv.width - w) / 2, y = 16;
    ctx.save();
    rr(x, y, w, h, 5); ctx.fillStyle = "rgba(44,11,9,.95)"; ctx.fill();
    rr(x, y, w, h, 5); ctx.clip();
    ctx.strokeStyle = "rgba(217,72,60,.28)"; ctx.lineWidth = 7;
    for (let i = -h; i < w; i += 20) {
      ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke();
    }
    ctx.restore();
    rr(x, y, w, h, 5);
    const a = 0.65 + 0.35 * Math.sin(performance.now() / 240);
    ctx.strokeStyle = "rgba(217,72,60," + a + ")"; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.font = "800 19px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(18,4,3,.85)";
    ctx.strokeText("АВАРИЙНЫЙ СТОП НАЖАТ", x + w / 2, y + 29);
    ctx.fillStyle = "#ffd2cb";
    ctx.fillText("АВАРИЙНЫЙ СТОП НАЖАТ", x + w / 2, y + 29);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function drawSelection() {
    for (const [id, m] of Object.entries(S.machines)) {
      const n = S.ND[id];
      if (!n) continue;
      if (hover === id) {
        rr(n.x - 4, n.y - 4, n.w + 8, n.h + 8, 7);
        ctx.strokeStyle = "rgba(75,143,209,.9)"; ctx.lineWidth = 2.2; ctx.stroke();
      }
      if (m.fault) {
        rr(n.x - 4, n.y - 4, n.w + 8, n.h + 8, 7);
        ctx.strokeStyle = "rgba(217,72,60," + (0.55 + 0.45 * Math.sin(performance.now() / 160)) + ")";
        ctx.lineWidth = 2.6; ctx.stroke();
      }
    }
  }

  /* --------------------------------------------------------------- фон цеха
     Каркас здания, отметки этажей и бетонный пол. Всё приглушённое:
     фон не должен спорить с оборудованием и трассами. */
  function drawBackdrop() {
    const FLOORS = [
      [0, 300, "отм. +18.0"],
      [300, 620, "отм. +12.6"],
      [620, 950, "отм. +8.4"],
      [950, 1250, "отм. +4.2"],
      [1250, S.H, "отм. 0.000"],
    ];
    // перекрытия
    FLOORS.forEach(([y0, y1, mark], i) => {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,.016)" : "rgba(255,255,255,.032)";
      ctx.fillRect(0, y0, S.W, y1 - y0);
      ctx.strokeStyle = "rgba(150,178,210,.14)";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(S.W, y0); ctx.stroke();
      ctx.font = "600 13px 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(150,178,210,.3)";
      ctx.fillText(mark, 8, y0 + 17);
    });
    // колонны каркаса
    ctx.strokeStyle = "rgba(150,178,210,.10)";
    ctx.lineWidth = 9;
    for (let x = 180; x < S.W; x += 470) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke();
    }
    // мелкая координатная сетка
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= S.W; x += 52) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke(); }
    for (let y = 0; y <= S.H; y += 52) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.W, y); ctx.stroke(); }
    // бетонный пол
    const fy = S.H - 96;
    const fg = ctx.createLinearGradient(0, fy, 0, S.H);
    fg.addColorStop(0, "rgba(46,60,78,.55)"); fg.addColorStop(1, "rgba(26,35,48,.8)");
    ctx.fillStyle = fg; ctx.fillRect(0, fy, S.W, 96);
    ctx.strokeStyle = "rgba(150,178,210,.18)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(S.W, fy); ctx.stroke();
    ctx.strokeStyle = "rgba(150,178,210,.07)"; ctx.lineWidth = 1;
    for (let x = 0; x < S.W; x += 140) {
      ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x - 38, S.H); ctx.stroke();
    }
  }

  /* подпись владельца схемы — правый нижний угол, поверх фона */
  function drawWatermark() {
    const img = IMG.logo;
    if (!img) return;
    const w = 214, h = (img.height / img.width) * w;
    const x = S.W - w - 28, y = S.H - h - 26;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(img, x, y, w, h);
    ctx.globalAlpha = 0.34;
    ctx.font = "600 13px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "#9fb4cd";
    ctx.fillText("промышленная автоматизация", S.W - 28, y + h + 16);
    ctx.restore();
  }

  const BACK = ["truck_in", "truck_out", "truck_A", "truck_B"];
  const SILOS = ["bun_21", "bun_A", "bun_B"];

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);

    drawBackdrop();

    if (!ready) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = "600 15px 'Segoe UI', sans-serif";
      ctx.fillStyle = C.textDim; ctx.textAlign = "center";
      ctx.fillText("Загрузка моделей оборудования…", cv.width / 2, cv.height / 2);
      return;
    }

    drawWatermark();

    const active = activeSegs();
    if (VOPT.ducts) drawDucts();
    if (VOPT.pipes) drawPipes(active);

    BACK.forEach(drawSprite);
    SILOS.forEach(drawSprite);
    drawLevels();
    Object.keys(S.ND).forEach((id) => {
      if (BACK.includes(id) || SILOS.includes(id)) return;
      drawSprite(id);
    });

    // Intake material uses the original masked texture, not a rectangular overlay.
    Object.keys(S.ND).forEach(drawMoving);
    grainWindows();
    drawGrain();
    drawSelection();

    if (VOPT.labels) { queueLabels(); flushLabels(); }
    drawBunkerText();
    drawAnnotations();
    // Legend removed from simulation at operator request.

    if (S.estop) {
      ctx.fillStyle = "rgba(150,30,22,.05)";
      ctx.fillRect(0, 0, S.W, S.H);
      drawEstopBanner();
    }
  }

  global.RENDER = { init, render, toWorld, hitAt, setHover: (id) => { hover = id; },
    setViewOpt: (o) => { VOPT = o; } };
})(window);
