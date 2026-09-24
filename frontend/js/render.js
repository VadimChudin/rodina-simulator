/* ЛПЗС «Родина» — отрисовка мнемосхемы на Canvas.
   Спрайты assets/* рисуются по геометрии узлов без растяжения. Продукт
   рисуется по ячейкам модели тракта (PLANT.ELEM): где стоит элемент —
   там стоит и зерно. */

(function (global) {
  "use strict";

  const P = global.PLANT;
  const S = P.S;

  let cv, ctx, scale = 1, offX = 0, offY = 0, hover = null, selected = null;
  let fitScale = 1, zoom = 1, panX = 0, panY = 0;
  const IMG = {};
  const GRAIN_TEXTURE = {};
  const TEXTURED = new Set(["intake", "tor", "muz", "pneumo"]);
  const VAR = {};
  let ready = false;
  let VOPT = { labels: true, pipes: true, ducts: true, tags: true };

  const SPRITES = ["intake", "magnet", "noria", "debearder", "hopper", "muz",
    "fan", "tor", "trier", "diverter", "pneumo", "silo", "screw", "cyclone", "truck"];

  const C = {
    // светлая гамма сайта sysat.by: белый / #f6f6f6, синий #004395, красный #e81d23
    bg0: "#e4e9ef", bg1: "#f7f8fa", grid: "rgba(0,67,149,.07)",
    grain0: "#f2c14a", grain1: "#d49a2a", grain2: "#9c6a16",
    dust: "rgba(120,112,98,.75)", chaff: "#8a6a2e",
    pipe: "#8a97a6", pipeEdge: "#5c6977", text: "#16181c", textDim: "#566170",
    ok: "#37b866", warn: "#d9a53a", bad: "#e0503f", info: "#4b8fd1", idle: "#6f7d8c",
  };

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
          norm: tint(im, "saturate(0.92) brightness(0.98)"),
          idle: tint(im, "saturate(0.35) brightness(0.8)"),
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
    fitScale = Math.min(cv.width / S.W, cv.height / S.H);
    applyView();
  }

  // Пользовательский масштаб поверх «вписать»; сдвиг ограничен краями схемы.
  function applyView() {
    scale = fitScale * zoom;
    const mx = Math.max(0, (S.W * scale - cv.width) / 2), my = Math.max(0, (S.H * scale - cv.height) / 2);
    panX = Math.max(-mx, Math.min(mx, panX));
    panY = Math.max(-my, Math.min(my, panY));
    offX = (cv.width - S.W * scale) / 2 + panX;
    offY = (cv.height - S.H * scale) / 2 + panY;
  }
  function zoomAt(clientX, clientY, k) {
    const r = cv.getBoundingClientRect();
    const sx = (clientX - r.left) * cv.width / r.width, sy = (clientY - r.top) * cv.height / r.height;
    const wx = (sx - offX) / scale, wy = (sy - offY) / scale;
    zoom = Math.max(1, Math.min(5, zoom * k));
    const ns = fitScale * zoom;
    panX = sx - wx * ns - (cv.width - S.W * ns) / 2;
    panY = sy - wy * ns - (cv.height - S.H * ns) / 2;
    applyView();
  }
  function panBy(dx, dy) {
    const r = cv.getBoundingClientRect();
    panX += dx * cv.width / r.width; panY += dy * cv.height / r.height;
    applyView();
  }
  function fit() { zoom = 1; panX = 0; panY = 0; applyView(); }

  const SX = (wx) => offX + wx * scale;
  const SY = (wy) => offY + wy * scale;
  const px = (v) => v * Math.min(2, window.devicePixelRatio || 1);   // экранные пиксели → пиксели холста

  function toWorld(cx, cy) {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return [NaN, NaN];
    return [((cx - r.left) * cv.width / r.width - offX) / scale, ((cy - r.top) * cv.height / r.height - offY) / scale];
  }

  function toClient(wx, wy) {
    const r = cv.getBoundingClientRect();
    return [r.left + (offX + wx * scale) * r.width / cv.width, r.top + (offY + wy * scale) * r.height / cv.height];
  }

  // Узел под курсором: мелкие (моторы, шлюзы) имеют приоритет над крупными.
  function hitAt(wx, wy) {
    let best = null, area = 1e12;
    for (const [id, n] of Object.entries(S.ND)) {
      if (n.kind === "truck" && S.trucks[id] && S.trucks[id].phase === "away") continue;
      const pad = n.kind === "motor" ? 6 : 0;
      if (wx >= n.x - pad && wx <= n.x + n.w + pad && wy >= n.y - pad && wy <= n.y + n.h + pad) {
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

  const machineOf = (n) => (n && n.drive ? S.machines[n.drive] : null);
  function nodeFault(n) {
    if (!n) return false;
    return (n.drive && S.machines[n.drive].fault) || (n.drive2 && S.machines[n.drive2].fault);
  }
  function nodeRun(n) {
    const m = machineOf(n);
    if (!m) return false;
    return n.drive2 ? m.running || S.machines[n.drive2].running : m.running || m.w > 0.05;
  }

  /* --------------------------------------------------------- трубы и потоки */
  function polyPath(pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  }
  function drawPipes() {
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const e of Object.values(P.ELEM)) {
      if (e.drive && !e.id.startsWith("d_")) continue;       // пути внутри машин не рисуем
      if (e.id.startsWith("d_")) continue;
      polyPath(e.pts);
      ctx.strokeStyle = C.pipeEdge; ctx.lineWidth = e.dust ? 9 : 13; ctx.stroke();
      ctx.strokeStyle = C.pipe; ctx.lineWidth = e.dust ? 6 : 10; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  function drawDucts() {
    S.DUCTS.forEach((d) => {
      const m = S.machines[d.id];
      const on = m && m.running;
      ctx.save();
      ctx.lineJoin = "round";
      polyPath(d.pts);
      ctx.strokeStyle = on ? "rgba(132,58,160,.9)" : "rgba(132,58,160,.38)";
      ctx.lineWidth = 5;
      ctx.setLineDash([16, 11]);
      if (on) ctx.lineDashOffset = -(performance.now() / 1000) * 40;
      ctx.stroke();
      ctx.restore();
      const p = d.pts[4];
      ctx.font = "700 16px Raleway, 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = on ? "#6f2f88" : "#8f6d9c";
      ctx.fillText(d.poz, p[0] + 12, p[1] - 8);
    });
  }

  // Позиция на ломаной по доле длины.
  function along(pts, t) {
    let total = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(L); total += L;
    }
    let d = t * total;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) {
        const k = seg[i] ? Math.min(1, d / seg[i]) : 0;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
      }
      d -= seg[i];
    }
    return pts[pts.length - 1];
  }
  const HIDDEN_FLOW = new Set(["ksp", "tor", "pnev", "bt_14_1", "bt_14_2", "ost", "conv_22_1", "conv_22_2",
    "conv_22_3", "conv_22_4", "conv_22_5",
    "noria_4", "noria_8", "noria_12", "noria_15", "noria_20", "noria_23", "noria_24"]);
  // Ячейки модели → зёрна: только для лент и аспирации. Самотёчные трубы
  // показывает система частиц (drawParticles), нории и шнеки — свои узлы.
  function drawFlow() {
    for (const e of Object.values(P.ELEM)) {
      if (HIDDEN_FLOW.has(e.id)) continue;                  // внутри корпуса — показывает текстура/окно
      if (!e.drive && !e.dust) continue;                    // самотёк — частицы с физикой
      const nominal = 3.4 * e.T / e.N;
      for (let i = 0; i < e.N; i++) {
        const q = e.cells[i];
        if (q <= 1e-4) continue;
        const k = Math.min(4, Math.ceil(q / (e.dust ? nominal * 0.02 : nominal) * 2 - 0.2));
        for (let j = 0; j < k; j++) {
          const t = (i + e.acc + (j + 0.5) / k * 0.9) / e.N;
          const p = along(e.pts, Math.min(1, t));
          const h = (Math.sin((i * 12.9898 + j * 78.233) * 43758.5453) + 1) / 2;
          const jx = (h - 0.5) * 7, jy = (((h * 7.3) % 1) - 0.5) * 6;
          ctx.beginPath();
          ctx.ellipse(p[0] + jx, p[1] + jy, e.dust ? 2.8 : 4.4, e.dust ? 2.2 : 3.1, 0.6, 0, 7);
          ctx.fillStyle = e.dust ? C.dust : (h < 0.33 ? C.grain0 : h < 0.66 ? C.grain1 : C.grain2);
          ctx.fill();
        }
      }
    }
  }

  /* ------------------------------------------- частицы в самотёчных трубах */
  // Зерно в трубе разгоняется проекцией тяжести на уклон, тормозится трением,
  // теряет скорость на изломах. Число частиц пропорционально поступлению
  // продукта в элемент модели (ELEM.inKg), поэтому малый поток виден как редкие зёрна.
  const PHYS = { g: 1400, mu: 0.35, vMin: 70, vMax: 900, bend: 0.55, kgPer: 0.16, max: 2600 };
  const PARTS = [];
  const SEGS = {};
  let lastFrame = 0;
  function segsOf(e) {
    let s = SEGS[e.id];
    if (s) return s;
    s = { list: [], total: 0 };
    for (let i = 1; i < e.pts.length; i++) {
      const [x0, y0] = e.pts[i - 1], [x1, y1] = e.pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 0.5) continue;
      s.list.push({ x0, y0, ux: (x1 - x0) / len, uy: (y1 - y0) / len, len, from: s.total });
      s.total += len;
    }
    SEGS[e.id] = s;
    return s;
  }
  const hash = (k) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  let seed = 1;
  function stepParticles(dtReal) {
    const ts = S.timeScale || 1;
    const dt = Math.min(0.05, dtReal) * Math.min(3, ts);
    const kgPer = PHYS.kgPer * Math.max(1, ts / 3);
    for (const e of Object.values(P.ELEM)) {
      if (e.drive || e.dust) continue;
      if (e._seen === undefined) { e._seen = e.inKg; e._sp = 0; continue; }
      e._sp += (e.inKg - e._seen) / kgPer; e._seen = e.inKg;
      const sg = segsOf(e);
      while (e._sp >= 1) {
        e._sp -= 1;
        if (PARTS.length >= PHYS.max || !sg.list.length) continue;
        const r = hash(seed++);
        PARTS.push({ e, s: r * 6, v: PHYS.vMin * (0.8 + 0.5 * hash(seed++)), seg: 0,
          off: (r - 0.5) * 6.5, c: r < 0.33 ? C.grain0 : r < 0.7 ? C.grain1 : C.grain2 });
      }
    }
    let w = 0;
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i], sg = segsOf(p.e);
      let sc = sg.list[p.seg];
      // продукт в закрытой трубе копится у выхода
      const stopAt = p.e.blocked ? sg.total - 6 - (i % 23) * 2.2 : Infinity;
      const a = PHYS.g * sc.uy - PHYS.mu * PHYS.g * Math.abs(sc.ux);
      p.v = Math.max(PHYS.vMin, Math.min(PHYS.vMax, p.v + a * dt));
      p.s = Math.min(stopAt, p.s + p.v * dt);
      if (p.s >= stopAt) p.v = PHYS.vMin;
      while (p.seg < sg.list.length - 1 && p.s >= sc.from + sc.len) {
        const nx = sg.list[p.seg + 1];
        const turn = 1 - (sc.ux * nx.ux + sc.uy * nx.uy);   // 0 — прямо, 2 — разворот
        p.v = Math.max(PHYS.vMin, p.v * (1 - PHYS.bend * Math.min(1, turn)));
        p.seg++; sc = nx;
      }
      if (p.s >= sg.total) continue;                        // вышел из трубы — дальше модель
      PARTS[w++] = p;
    }
    PARTS.length = w;
  }
  function drawParticles() {
    for (const p of PARTS) {
      const sg = segsOf(p.e), sc = sg.list[p.seg];
      const d = p.s - sc.from;
      const x = sc.x0 + sc.ux * d - sc.uy * p.off, y = sc.y0 + sc.uy * d + sc.ux * p.off;
      const stretch = Math.min(3.2, p.v / 260);            // смаз при быстром падении
      ctx.beginPath();
      ctx.ellipse(x, y, 3.6 + stretch, 2.6, Math.atan2(sc.uy, sc.ux), 0, TAU);
      ctx.fillStyle = p.c; ctx.fill();
    }
  }
  function cellAt(e, t) {
    const i = Math.floor(t * e.N - e.acc);
    return i >= 0 && i < e.N ? e.cells[i] : 0;
  }
  const nominalCell = (e) => 3.4 * e.T / e.N;

  /* --------------------------------------------------------- спрайты */
  function variantFor(n) {
    if (nodeFault(n)) return "fault";
    if (!n.drive) return n.kind === "silo" || n.kind === "hopper" || n.kind === "truck" || n.kind === "magnet" || n.kind === "cyclone" ? "norm" : "idle";
    return nodeRun(n) || (machineOf(n) && machineOf(n).cmd) ? "norm" : "idle";
  }
  function drawSprite(id) {
    const n = S.ND[id];
    if (!n || !n.sprite) return;
    const set = VAR[n.sprite];
    if (!set) return;
    const m = machineOf(n);
    const v = set[variantFor(n)];
    ctx.save();
    if (m && m.vib > 0.02 && (n.kind === "muz" || n.kind === "tor" || n.kind === "sp" || n.kind === "op")) {
      const t = performance.now() / 1000;
      ctx.translate(Math.sin(t * 37) * 0.55 * m.vib, Math.cos(t * 29) * 0.4 * m.vib);
    }
    ctx.drawImage(v, n.x, n.y, n.w, n.h);
    const grain = GRAIN_TEXTURE[n.sprite];
    if (grain) {
      const amount = Math.max(0, Math.min(1, n.kind === "intake" ? S.levels.pit : (m ? m.mat : 0)));
      if (n.kind === "intake") {
        // яма: насыпь срезается сверху по уровню, а не просвечивает
        const split = 0.44, gh = grain.naturalHeight, gw = grain.naturalWidth;
        const top = 0.19, bot = 0.43, cut = top + (bot - top) * (1 - Math.sqrt(amount));
        if (amount > 0.004) ctx.drawImage(grain, 0, gh * cut, gw, gh * (split - cut), n.x, n.y + n.h * cut, n.w, n.h * (split - cut));
        ctx.globalAlpha = Math.max(0, Math.min(1, (m ? m.mat : 0) * 1.5));
        ctx.drawImage(grain, 0, gh * split, gw, gh * (1 - split), n.x, n.y + n.h * split, n.w, n.h * (1 - split));
      } else {
        ctx.globalAlpha = Math.min(1, amount * 1.3);
        ctx.drawImage(grain, n.x, n.y, n.w, n.h);
      }
      ctx.globalAlpha = 1;
    }
    if (m && DECKS[n.kind]) drawDeckGrain(n, m);
    ctx.restore();
  }

  // Решёта (доли спрайта: x0, y0, x1, y1, толщина слоя), замерены по *_grain.png.
  const DECKS = {
    tor: [[0.241, 0.229, 0.633, 0.310, 0.022], [0.246, 0.341, 0.633, 0.422, 0.022], [0.244, 0.455, 0.631, 0.539, 0.021]],
    muz: [[0.334, 0.315, 0.810, 0.411, 0.031], [0.334, 0.435, 0.810, 0.536, 0.032]],
    sp: [[0.126, 0.064, 0.776, 0.399, 0.05]],
  };
  // Зёрна на решётах: сползают по уклону, подпрыгивают от колебаний стана,
  // в конце решета падают вниз с ускорением. Количество — по наполнению машины.
  function drawDeckGrain(n, m) {
    const f = Math.min(1, m.mat * 1.2);
    if (f < 0.01) return;
    const t = performance.now() / 1000;
    const flow = (m.spin || 0) * 0.16;
    DECKS[n.kind].forEach((d, di) => {
      const [u0, v0, u1, v1, th] = d;
      const X0 = n.x + u0 * n.w, Y0 = n.y + v0 * n.h, X1 = n.x + u1 * n.w, Y1 = n.y + v1 * n.h;
      const count = Math.round(46 * f);
      for (let k = 0; k < count; k++) {
        const hk = hash(k * 7 + di * 131);
        const ph = (hk + flow * (0.8 + 0.4 * hash(k + 3))) % 1;
        let x, y;
        if (ph < 0.9) {
          const u = ph / 0.9;
          x = X0 + (X1 - X0) * u; y = Y0 + (Y1 - Y0) * u;
          y -= th * n.h * (0.2 + 0.6 * hash(k + 11));
          y -= m.vib * 2.2 * Math.abs(Math.sin(t * 26 + k * 1.7));
        } else {
          const q = (ph - 0.9) / 0.1;
          x = X1 + 4 * q; y = Y1 + q * q * n.h * 0.07;
        }
        ctx.fillStyle = k % 4 ? C.grain1 : C.grain0;
        ctx.beginPath(); ctx.ellipse(x, y, 2.1, 1.5, 0.3, 0, TAU); ctx.fill();
      }
    });
  }

  /* ------------------------------------------------------------ нории */
  // Разрез башмака и трубы нории: лента с ковшами идёт вверх по левой ветви
  // (ковши загружены по ячейкам модели), вниз — по правой, порожние и перевёрнутые.
  // Лента движется, только пока вращается привод; остановленная нория держит зерно в ковшах.
  function liftGeom(id) {
    const a = S.A[id];
    const L1 = Math.hypot(a.col - a.in[0], a.bot - a.in[1]);
    const L2 = a.bot - a.top;
    const L3 = Math.hypot(a.out[0] - a.col, a.out[1] - a.top);
    return { a, L1, L2, total: L1 + L2 + L3 };
  }
  function drawNoriaInner(id) {
    const n = S.ND[id], m = machineOf(n), e = P.ELEM[id];
    if (!m || !e) return;
    const g = liftGeom(id);
    const x0 = n.x + 0.355 * n.w, ww = 0.23 * n.w, cx = x0 + ww / 2;
    const y0 = n.y + 0.128 * n.h, y1 = n.y + 0.957 * n.h;
    const belt = 0.19 * ww, xl = cx - belt, xr = cx + belt;
    const yb = n.y + 0.905 * n.h, rp = belt;
    const dist = (m.spin || 0) * g.total / e.T;
    const nom = nominalCell(e);
    const sp = 0.05 * n.h, bh = sp * 0.56, bw = 0.27 * ww;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, ww, y1 - y0); ctx.clip();
    const bg = ctx.createLinearGradient(x0, 0, x0 + ww, 0);
    bg.addColorStop(0, "#1c242c"); bg.addColorStop(0.5, "#303b46"); bg.addColorStop(1, "#1c242c");
    ctx.fillStyle = bg; ctx.fillRect(x0, y0, ww, y1 - y0);
    // зерно в башмаке — то, что ещё не зачерпнуто
    let boot = 0;
    for (let i = 0; i < e.N && (i + e.acc) / e.N * g.total < g.L1 + 12; i++) boot += e.cells[i];
    const bootF = Math.min(1, boot / (nom * 2.5));
    if (bootF > 0.01) {
      const hgt = (y1 - yb + rp) * 0.9 * bootF;
      ctx.beginPath();
      ctx.moveTo(x0, y1); ctx.lineTo(x0, y1 - hgt);
      ctx.quadraticCurveTo(cx, y1 - hgt * 1.35, x0 + ww, y1 - hgt * 0.7);
      ctx.lineTo(x0 + ww, y1); ctx.closePath();
      const gg = ctx.createLinearGradient(0, y1 - hgt, 0, y1);
      gg.addColorStop(0, C.grain0); gg.addColorStop(1, C.grain2);
      ctx.fillStyle = gg; ctx.fill();
    }
    // лента: две ветви и огибание нижнего барабана
    ctx.strokeStyle = "#11171c"; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(xl, y0 - 4); ctx.lineTo(xl, yb); ctx.arc(cx, yb, rp, Math.PI, 0, true); ctx.lineTo(xr, y0 - 4); ctx.stroke();
    ctx.fillStyle = "#6c7884";
    const rv = 7.5, ro = dist % rv;
    for (let y = yb - ro; y > y0 - rv; y -= rv) ctx.fillRect(xl - 0.8, y, 1.6, 1.6);
    for (let y = y0 - rv + ro; y < yb; y += rv) ctx.fillRect(xr - 0.8, y, 1.6, 1.6);
    // нижний (натяжной) барабан
    const ang = dist / rp;
    ctx.fillStyle = "#56626e"; ctx.beginPath(); ctx.arc(cx, yb, rp * 0.82, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#b8c4ce"; ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      const q = ang + k * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, yb); ctx.lineTo(cx + Math.cos(q) * rp * 0.78, yb + Math.sin(q) * rp * 0.78); ctx.stroke();
    }
    ctx.fillStyle = "#c9d3db"; ctx.beginPath(); ctx.arc(cx, yb, rp * 0.2, 0, TAU); ctx.fill();
    // ковши
    const off = dist % sp;
    const bucket = (y, up, f) => {
      const bx = up ? xl : xr, s = up ? -1 : 1;
      const top = up ? y - bh / 2 : y + bh / 2, bot = up ? y + bh / 2 : y - bh / 2;
      ctx.beginPath();
      ctx.moveTo(bx, top); ctx.lineTo(bx + s * bw, top);
      ctx.lineTo(bx + s * bw * 0.62, bot); ctx.lineTo(bx, bot); ctx.closePath();
      ctx.fillStyle = up ? "#8795a2" : "#6c7985"; ctx.fill();
      ctx.strokeStyle = "#2c353e"; ctx.lineWidth = 0.9; ctx.stroke();
      if (!up || f <= 0.02) return;
      const k = Math.min(1, f);
      const gy = Math.min(bot - 1.3, bot - (bot - top) * 0.92 * k);   // даже горсть зерна видна
      const wx = (yy) => bw * (0.62 + 0.38 * (bot - yy) / (bot - top));
      ctx.beginPath();
      ctx.moveTo(bx, bot); ctx.lineTo(bx - bw * 0.62, bot);
      ctx.lineTo(bx - wx(gy), gy);
      if (f > 0.85) ctx.quadraticCurveTo(bx - wx(gy) * 0.5, gy - bh * 0.45 * Math.min(1, (f - 0.85) * 3), bx, gy);
      else ctx.lineTo(bx, gy);
      ctx.closePath();
      ctx.fillStyle = C.grain1; ctx.fill();
      ctx.fillStyle = C.grain0;
      ctx.fillRect(bx - wx(gy) * 0.7, gy + 0.4, wx(gy) * 0.45, 1.1);
    };
    for (let p = off; yb - p > y0 - bh; p += sp) {
      const y = yb - rp * 0.4 - p;
      const t = (g.L1 + (g.a.bot - y)) / g.total;
      bucket(y, true, cellAt(e, Math.max(0, Math.min(0.999, t))) / nom);
    }
    for (let p = off + sp / 2; y0 + p < yb - rp * 0.4 + bh; p += sp) bucket(y0 + p, false, 0);
    ctx.restore();
    // рамка смотрового разреза
    ctx.strokeStyle = "rgba(20,26,32,.85)"; ctx.lineWidth = 1.4;
    ctx.strokeRect(x0, y0, ww, y1 - y0);
    // приводной (верхний) барабан в головке нории
    const hx = n.x + 0.477 * n.w, hy = n.y + 0.06 * n.h, hr = 0.075 * n.w;
    const ha = dist / hr;
    ctx.save();
    ctx.strokeStyle = m.running ? "rgba(235,242,247,.9)" : "rgba(200,210,220,.7)"; ctx.lineWidth = hr * 0.13; ctx.lineCap = "round";
    for (let k = 0; k < 5; k++) {
      const q = ha + k * TAU / 5;
      ctx.beginPath(); ctx.moveTo(hx + Math.cos(q) * hr * 0.25, hy + Math.sin(q) * hr * 0.25);
      ctx.lineTo(hx + Math.cos(q) * hr * 0.85, hy + Math.sin(q) * hr * 0.85); ctx.stroke();
    }
    ctx.restore();
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

  function drawScrewSolid(n, m, e) {
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
    if (e) screwBed(e, x, y, len, h);
    facets.filter(f=>f.z>=0).forEach(paint);
    // Fixed front trough lip occludes the lower flight tips; never rotates.
    ctx.fillStyle = "#203c32"; ctx.fillRect(x,y+h-2.4,len,2.4);
    ctx.fillStyle = "#597365"; ctx.fillRect(x,y+h-2.4,len,0.7);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x,y,2,h); ctx.fillRect(x+len-2,y,2,h);
    ctx.restore();
  }

  // Слой продукта в жёлобе шнека: высота по ячейкам модели, зёрна сдвигаются
  // витками вдоль оси. Рисуется между задними и передними витками.
  function screwBed(e, x, y, len, h) {
    const x1 = e.pts[0][0], x2 = e.pts[e.pts.length - 1][0];
    const cap = nominalCell(e) * 0.3;                      // шнеки отходов: номинал ~30 % потока линии
    const tOf = (X) => Math.max(0, Math.min(0.999, (X - x1) / (x2 - x1)));
    const step = 3, top = [];
    let any = 0;
    for (let X = x; X <= x + len + 0.1; X += step) {
      const f = Math.min(1, cellAt(e, tOf(X)) / cap);
      any = Math.max(any, f);
      top.push([X, y + h - h * 0.5 * f]);
    }
    if (any < 0.01) return;
    ctx.beginPath(); ctx.moveTo(x, y + h);
    top.forEach(([X, Y]) => ctx.lineTo(X, Y));
    ctx.lineTo(x + len, y + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, y + h * 0.5, 0, y + h);
    g.addColorStop(0, C.grain0); g.addColorStop(1, C.grain2);
    ctx.fillStyle = g; ctx.fill();
    const dir = Math.sign(x2 - x1) || 1;
    const shift = (S.machines[e.drive].spin || 0) * Math.abs(x2 - x1) / e.T * dir;
    for (let k = 0; k < 70; k++) {
      const X = x + ((((hash(k) * len + shift) % len) + len) % len);
      const f = Math.min(1, cellAt(e, tOf(X)) / cap);
      if (hash(k + 99) > f * 1.4) continue;
      const Y = y + h - h * 0.5 * f * hash(k + 7) - 1;
      ctx.fillStyle = k % 3 ? C.grain2 : "#fbe3a0";
      ctx.fillRect(X, Y, 1.6, 1.1);
    }
  }

  // Зерно в цилиндре триера видно сквозь ячейки: слой внизу и зёрна,
  // которые ячейки поднимают по стенке и сбрасывают обратно.
  function trierGrain(e, m, left, length, cy, r, index) {
    const f = Math.min(1, e.fill * 1.6);
    if (f < 0.01) return;
    const depth = r * (0.25 + 0.55 * f);
    ctx.save();
    ctx.globalAlpha = 0.55;
    const g = ctx.createLinearGradient(0, cy + r - depth, 0, cy + r);
    g.addColorStop(0, C.grain0); g.addColorStop(1, C.grain2);
    ctx.fillStyle = g; ctx.fillRect(left, cy + r - depth, length, depth);
    ctx.globalAlpha = 0.95;
    const turn = (m.spin || 0) * 0.9 + index * 0.37;
    const count = m.w > 0.2 ? Math.round(60 * f) : 0;
    for (let k = 0; k < count; k++) {
      const ph = (hash(k * 3 + index) + turn) % 1;
      let yy;
      if (ph < 0.72) yy = cy + r * 0.92 * Math.sin(Math.PI / 2 - ph / 0.72 * Math.PI * 0.62);
      else { const q = (ph - 0.72) / 0.28; yy = cy + r * 0.92 * Math.sin(-0.12 * Math.PI) + q * q * r * 1.2; }
      const xx = left + length * ((hash(k + 41) + (m.spin || 0) * 0.02) % 1);
      ctx.fillStyle = k % 3 ? C.grain1 : C.grain0;
      ctx.beginPath(); ctx.ellipse(xx, Math.min(cy + r * 0.95, yy), 1.7, 1.2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawTrierDrum(n, m, win, index, e) {
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
    if (e) trierGrain(e, m, left, length, cy, r, index);
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
    const n = S.ND[id];
    if (!n) return;
    const m = machineOf(n);
    if (n.kind === "screw" && m) { drawScrewSolid(n, m, P.ELEM[id]); return; }
    if (n.kind === "trier") {
      const m1 = S.machines[n.drive], m2 = S.machines[n.drive2];
      MECH_WINDOWS.trier.forEach((win, i) => drawTrierDrum(n, i ? m2 : m1, win, i, P.ELEM[id]));
      return;
    }
    if (n.kind === "intake" && m && m.w > 0.02) {
      const a = S.A[id];
      const off = (m.spin * 46) % 30;
      ctx.strokeStyle = "rgba(214,226,240,.5)"; ctx.lineWidth = 1.8;
      for (let x = a.bx1; x <= a.bx2; x += 30) {
        const p = x + off;
        if (p > a.bx2) continue;
        ctx.beginPath(); ctx.moveTo(p, a.beltY - 6); ctx.lineTo(p, a.beltY + 6); ctx.stroke();
      }
    }
    if (n.kind === "fan" && m) drawImpeller(n, m);
  }

  // Крыльчатка в решётке входного патрубка спрайта fan.webp (центр и радиус замерены по рисунку).
  function drawImpeller(n, m) {
    const cx = n.x + n.w * 0.333, cy = n.y + n.h * 0.347, R = n.w * 0.143;
    const dark = !m.running && m.w < 0.05;
    const a0 = (m.spin || 0) * 7;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    g.addColorStop(0, dark ? "#202a36" : "#2a3644"); g.addColorStop(1, "#0b1119");
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    // лопатки загнуты назад — как у радиального вентилятора
    const blades = 10;
    for (let k = 0; k < blades; k++) {
      const a = a0 + k * TAU / blades;
      const r0 = R * 0.22, r1 = R * 0.95;
      ctx.beginPath();
      ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
      ctx.quadraticCurveTo(cx + R * 0.62 * Math.cos(a + 0.55), cy + R * 0.62 * Math.sin(a + 0.55),
        cx + r1 * Math.cos(a + 0.95), cy + r1 * Math.sin(a + 0.95));
      ctx.strokeStyle = dark ? "#58677a" : "#9fb0c2"; ctx.lineWidth = R * 0.12; ctx.lineCap = "round"; ctx.stroke();
      ctx.strokeStyle = dark ? "#6f7f93" : "#dbe6ef"; ctx.lineWidth = R * 0.035; ctx.stroke();
    }
    // размытие при вращении
    if (m.w > 0.3) {
      ctx.globalAlpha = 0.25 * m.w; ctx.fillStyle = "#8ea0b4";
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // неподвижная защитная решётка и ступица
    ctx.save();
    ctx.strokeStyle = "rgba(190,205,220,.55)"; ctx.lineWidth = R * 0.03;
    [0.45, 0.72, 0.97].forEach((k) => { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, TAU); ctx.stroke(); });
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8;
      ctx.beginPath(); ctx.moveTo(cx + R * 0.2 * Math.cos(a), cy + R * 0.2 * Math.sin(a));
      ctx.lineTo(cx + R * 0.97 * Math.cos(a), cy + R * 0.97 * Math.sin(a)); ctx.stroke();
    }
    const hub = ctx.createRadialGradient(cx - R * 0.05, cy - R * 0.05, 0, cx, cy, R * 0.2);
    hub.addColorStop(0, "#dfe7ee"); hub.addColorStop(1, "#56657a");
    ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, TAU); ctx.fill();
    ctx.restore();
    // шкив ремённой передачи
    const px = n.x + n.w * 0.625, py = n.y + n.h * 0.509, pr = n.w * 0.045;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a0 * 1.4);
    ctx.strokeStyle = dark ? "rgba(150,165,180,.5)" : "rgba(220,230,240,.8)"; ctx.lineWidth = pr * 0.18;
    for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.moveTo(pr * 0.25, 0); ctx.lineTo(pr * 0.85, 0); ctx.stroke(); }
    ctx.restore();
  }

  /* --------------------------------------------------------- автотранспорт */
  // В спрайте truck.webp шапка зерна занимает верх рисунка до ~13,5 % высоты.
  const HEAP = 0.135;
  function drawTruck(id) {
    const n = S.ND[id], t = S.trucks[id], img = VAR.truck && VAR.truck.norm;
    if (!n || !t || !img || t.phase === "away") return;
    const iw = img.width, ih = img.height;
    const x = n.x + t.x;
    const bump = t.moving ? Math.sin(performance.now() / 60) * 0.8 : 0;
    const y = n.y + bump;
    ctx.save();
    // кузов и шасси без шапки зерна
    ctx.drawImage(img, 0, ih * HEAP, iw, ih * (1 - HEAP), x, y + n.h * HEAP, n.w, n.h * (1 - HEAP));
    // шапка зерна по степени загрузки
    const f = Math.max(0, Math.min(1, t.load));
    if (f > 0.01) {
      const hh = n.h * HEAP * f;
      ctx.drawImage(img, 0, 0, iw, ih * HEAP, x, y + n.h * HEAP - hh, n.w, hh);
    }
    ctx.restore();
  }
  // Струя зерна: из кузова в приёмную решётку ямы, из бункера — в кузов.
  function drawStreams() {
    const now = performance.now() / 1000;
    for (const [id, t] of Object.entries(S.trucks)) {
      if (!t.pour) continue;
      const n = S.ND[id];
      let x0, y0, x1, y1;
      if (id === "truck_in") {
        const it = S.ND.intake;
        x0 = n.x + t.x + n.w * 0.97; y0 = n.y + n.h * 0.28;
        x1 = x0 + 6; y1 = it.y + it.h * 0.06;
      } else {
        const b = S.ND[{ truck_out: "bun_21", truck_A: "bun_A", truck_B: "bun_B" }[id]];
        const a = S.A[{ truck_out: "bun_21", truck_A: "bun_A", truck_B: "bun_B" }[id]];
        x0 = a.out[0]; y0 = b.y + b.h * 0.97; x1 = x0; y1 = n.y + n.h * (HEAP * (1 - t.load) + 0.02);
      }
      const len = y1 - y0;
      ctx.save();
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, "rgba(240,194,78,.9)"); g.addColorStop(1, "rgba(217,163,51,.55)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - 5, y0); ctx.lineTo(x0 + 5, y0); ctx.lineTo(x1 + 11, y1); ctx.lineTo(x1 - 11, y1); ctx.closePath(); ctx.fill();
      for (let k = 0; k < 26; k++) {
        const ph = (now * 1.6 + k / 26) % 1;
        const yy = y0 + len * ph * ph;             // свободное падение
        const spread = 4 + 9 * ph;
        const xx = x0 + (x1 - x0) * ph + Math.sin(k * 12.9898) * spread;
        ctx.fillStyle = k % 3 ? C.grain0 : C.grain2;
        ctx.beginPath(); ctx.ellipse(xx, yy, 3.4, 2.5, 0.6, 0, TAU); ctx.fill();
      }
      // пыль в месте падения
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(now * 6);
      ctx.fillStyle = "#e8d7a8";
      ctx.beginPath(); ctx.ellipse(x1, y1 - 4, 34, 10, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function stateColor(m) {
    if (!m) return C.idle;
    if (m.fault) return C.bad;
    if (m.running) return C.ok;
    if (m.cmd || m.w > 0.02) return C.warn;
    return C.idle;
  }

  // Шлюзовый затвор: корпус и ротор с лопастями.
  function drawSluice(id) {
    const n = S.ND[id], m = machineOf(n);
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, r = n.h * 0.36;
    rr(n.x, n.y, n.w, n.h, 6);
    const g = ctx.createLinearGradient(n.x, 0, n.x + n.w, 0);
    g.addColorStop(0, "#2b3844"); g.addColorStop(0.5, "#5b6d7a"); g.addColorStop(1, "#2b3844");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = m && m.fault ? C.bad : "#1b252e"; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((m ? m.spin : 0) * 3);
    ctx.strokeStyle = m && m.running ? "#d8e3ea" : "#8391a0"; ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r, 0); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(n.x + n.w - 9, n.y + 9, 5, 0, 7); ctx.fillStyle = stateColor(m); ctx.fill();
  }

  // Значок электродвигателя для приводов без отдельного спрайта.
  function drawMotor(id) {
    const n = S.ND[id], m = machineOf(n);
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, r = n.w / 2 - 3;
    const col = stateColor(m);
    ctx.save();
    if (m && m.fault) { ctx.shadowColor = C.bad; ctx.shadowBlur = 14 + 8 * Math.sin(performance.now() / 160); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7);
    ctx.fillStyle = "#15202a"; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((m ? m.spin : 0) * 6);
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, r * 0.35); ctx.lineTo(0, r * 0.8); ctx.stroke(); }
    ctx.restore();
    ctx.font = "800 22px Raleway, 'Segoe UI', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#e6edf4"; ctx.fillText("M", cx, cy + 1);
    ctx.textBaseline = "alphabetic";
  }

  // Переключатель потока: стрелка показывает текущее положение заслонки.
  function drawFlapper(id) {
    const n = S.ND[id], m = machineOf(n), a = S.A[id];
    if (!m) return;
    const cx = a.in[0], cy = n.y + n.h * 0.46;
    const t = m.pos;
    const tx = a.oa[0] + (a.ob[0] - a.oa[0]) * t, ty = a.oa[1];
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = m.fault ? C.bad : m.running ? C.warn : "#1f9d55";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (tx - cx) * 0.8, cy + (ty - cy) * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 7); ctx.fillStyle = "#1c2833"; ctx.fill();
    ctx.restore();
  }

  /* --------------------------------------------------------- ёмкости */
  function drawPit() {
    const n = S.ND.intake;
    const f = Math.max(0, Math.min(1, S.levels.pit));
    const x = n.x + n.w * 0.10, w = n.w * 0.50;
    const yTop = n.y + n.h * 0.30, hMax = n.h * 0.30;
    if (f <= 0.006 || GRAIN_TEXTURE.intake) return;
    const h = hMax * f, y = yTop + hMax - h;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(x, yTop + hMax); ctx.lineTo(x, y + 5);
    ctx.quadraticCurveTo(x + w * 0.5, y - 9 * f, x + w, y + 5);
    ctx.lineTo(x + w, yTop + hMax); ctx.closePath();
    ctx.fillStyle = C.grain1; ctx.fill();
    ctx.restore();
  }
  // Уровень в бункерах: смотровой разрез по оси ёмкости (спрайт непрозрачный,
  // поэтому продукт рисуется поверх него в вырезе корпуса и конуса).
  function drawLevels() {
    for (const [id, n] of Object.entries(S.ND)) {
      if (!n.level) continue;
      const a = S.A[id];
      const f = Math.max(0, Math.min(1, S.levels[n.level] || 0));
      const body = a.body, cone = a.cone;
      const bx = n.x + body[0] * n.w, by = n.y + body[1] * n.h;
      const bw = body[2] * n.w, bh = body[3] * n.h;
      const cy = n.y + cone[1] * n.h, ch = cone[3] * n.h;
      const mid = n.x + n.w / 2, half = bw * 0.17, tip = half * 0.3;
      const yTop = by + bh * 0.04, yBot = cy + ch * 0.8;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(mid - half, yTop); ctx.lineTo(mid + half, yTop);
      ctx.lineTo(mid + half, cy); ctx.lineTo(mid + tip, yBot); ctx.lineTo(mid - tip, yBot);
      ctx.lineTo(mid - half, cy); ctx.closePath();
      ctx.fillStyle = "rgba(24,31,38,.88)"; ctx.fill();
      ctx.save(); ctx.clip();
      if (f > 0.002) {
        // уровень по объёму: конус вмещает треть цилиндра той же высоты
        const hc = yBot - cy, hb = cy - yTop, vc = hc / 3, v = f * (hb + vc);
        const gy = v <= vc ? yBot - hc * Math.cbrt(v / vc) : cy - (v - vc);
        ctx.beginPath();
        ctx.moveTo(mid - half - 2, yBot + 2); ctx.lineTo(mid - half - 2, gy + 3);
        ctx.quadraticCurveTo(mid, gy - Math.min(8, half * 0.5), mid + half + 2, gy + 3);
        ctx.lineTo(mid + half + 2, yBot + 2); ctx.closePath();
        const g = ctx.createLinearGradient(0, gy, 0, yBot);
        g.addColorStop(0, C.grain0); g.addColorStop(1, C.grain2);
        ctx.fillStyle = g; ctx.fill();
        // струя сверху, пока в бункер идёт продукт
        const inflow = LEVEL_IN[n.level] && LEVEL_IN[n.level].some((k) => P.ELEM[k] && P.ELEM[k].cells[P.ELEM[k].N - 1] > 1e-3);
        if (inflow) {
          const tt = performance.now() / 1000;
          for (let k = 0; k < 14; k++) {
            const ph = (tt * 1.3 + k / 14) % 1;
            ctx.fillStyle = k % 2 ? C.grain0 : C.grain1;
            ctx.beginPath(); ctx.ellipse(mid + Math.sin(k * 5.1) * 2.5, yTop + (gy - yTop) * ph * ph, 1.8, 2.6, 0, 0, TAU); ctx.fill();
          }
        }
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(12,16,20,.8)"; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }
  }
  // Трубы, которые сыпят в ёмкость (для струи в разрезе).
  const LEVEL_IN = { bo_1: ["c_4_61", "c_ost_61"], bo_2: ["c_8_9"], bo_3: ["c_f2_16"], V: ["c_20_21"], A: ["c_23_A"], B: ["c_24_B"] };

  /* ------------------------------------------------------------ циклоны */
  // Закрутка пыли в циклоне, пока работает вентилятор его сети.
  function drawCyclone(id) {
    const n = S.ND[id], k = id.slice(-1), m = S.machines["fan_asp_" + k];
    if (!m || m.w < 0.1) return;
    const tt = (m.spin || 0);
    const cx = n.x + n.w * 0.5, top = n.y + n.h * 0.22, bot = n.y + n.h * 0.9;
    ctx.save();
    for (let j = 0; j < 22; j++) {
      const ph = (hash(j * 5) + tt * 0.35) % 1;
      const y = top + (bot - top) * ph;
      const rad = n.w * 0.34 * (ph < 0.42 ? 1 : 1 - (ph - 0.42) / 0.58 * 0.85);
      const ang = tt * 9 + j * 2.4 + ph * 14;
      const x = cx + Math.cos(ang) * rad;
      if (Math.sin(ang) < 0) continue;                      // задняя сторона — за стенкой
      ctx.fillStyle = `rgba(120,110,96,${0.55 * m.w})`;
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* --------------------------------------------------------- подписи */
  const SHORT = {
    intake: "Завальная яма", m_vor: "Ворошитель", magnet_3: "Магнит ПМ-200",
    noria_4: "Нория 4", ost: "ОП-11", bun_61: "БО-1", ksp: "МУЗ-8М", m_biter: "Битер МУЗ",
    fan_asp_1: "АС-1", noria_8: "Нория 8", bun_9: "БО-2", tor: "ТОР-18", m_tor_biter: "Битер ТОР",
    fan_asp_2: "АС-2", noria_12: "Нория 12", flow_1: "Поток 13.1", bt_14_1: "БТ 14.1", bt_14_2: "БТ 14.2",
    m_trier_1: "N1", m_trier_2_1: "N2", m_trier_1_2: "N1", m_trier_2_2: "N2",
    noria_15: "Нория 15", flow_2: "Поток 13.2", bun_16: "БО-3", pnev: "СП-200", fan_pnev: "Вент. СП",
    fan_asp_3: "АС-3", noria_20: "Нория 20", bun_21: "БЗ-А-20", cyc_1: "Циклон 1", cyc_2: "Циклон 2",
    cyc_3: "Циклон 3", shl_1: "Шлюз 1", shl_2: "Шлюз 2", shl_3: "Шлюз 3", conv_22_1: "Шнек 22.1",
    conv_22_2: "Шнек 22.2", conv_22_3: "Шнек 22.3", conv_22_4: "Шнек 22.4", conv_22_5: "Шнек 22.5",
    noria_23: "Нория 23", noria_24: "Нория 24",
  };
  // Подписи рисуются в экранных координатах: читаемы при любом масштабе.
  function drawLabels() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fs = Math.max(9, Math.min(15, 13 * scale / dpr / 0.36));
    for (const [id, n] of Object.entries(S.ND)) {
      const s = SHORT[id];
      if (!s) continue;
      const motor = n.kind === "motor";
      if (motor && fs < 11) continue;                     // на мелком масштабе подписи моторов мешают
      // Переключатели потока стоят вплотную к нориям — подпись справа; магнит — под узлом.
      const side = n.kind === "diverter" ? "right" : id === "magnet_3" ? "below" : null;
      let x = SX(n.x + n.w / 2);
      let y = motor || side === "below" ? SY(n.y + n.h) + px(13) : SY(n.y) - px(6);
      if (side === "right") { x = SX(n.x + n.w) + px(4); y = SY(n.y + n.h * 0.5); }
      ctx.font = `${motor ? 700 : 800} ${px(motor ? fs - 2.5 : fs - 1)}px Raleway, 'Segoe UI', sans-serif`;
      ctx.textAlign = side === "right" ? "left" : "center";
      if ("letterSpacing" in ctx) ctx.letterSpacing = px(motor ? 0.4 : 0.9) + "px";
      ctx.lineWidth = px(3.6); ctx.strokeStyle = "rgba(255,255,255,.94)"; ctx.lineJoin = "round";
      ctx.strokeText(motor ? s : s.toUpperCase(), x, y);
      ctx.fillStyle = motor ? "#3d4854" : C.text; ctx.fillText(motor ? s : s.toUpperCase(), x, y);
    }
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function tagsFor(n) {
    const t = [];
    const ids = [n.drive, n.drive2].filter(Boolean);
    for (const id of ids) {
      const m = S.machines[id], inf = P.info(id);
      const pre = n.drive2 ? (id === n.drive ? "N1 " : "N2 ") : "";
      if (inf.state === "fault") t.push(["fault", pre + "АВАРИЯ" + (inf.faults.length ? " · " + inf.faults[0] : "")]);
      else if (inf.state === "starting") t.push(["timer", pre + "ПУСК " + inf.startLeft.toFixed(0) + " с"]);
      else if (inf.state === "stopping") t.push(["timer", pre + "СТОП " + inf.stopLeft.toFixed(0) + " с"]);
      else if (inf.state === "hand" || inf.state === "hand-run") t.push(["manual", pre + "РУЧН."]);
      else if (inf.state === "local" || inf.state === "local-run") t.push(["manual", pre + "МЕСТН."]);
      else if (inf.state === "blocked" && !S.V.gemer) t.push(["fault", pre + "СТОП КНОПКОЙ"]);
      if (m.toHours > 0 && m.hours >= m.toHours) t.push(["to", pre + "ТО"]);
      if (id === "flow_1" || id === "flow_2") {
        if (inf.state === "moving") t.push(["timer", "ПЕРЕВОД"]);
      }
    }
    return t;
  }
  const TAG = {
    fault: { bg: "rgba(58,16,14,.96)", br: "#e0503f", fg: "#ffc0b6", blink: true },
    timer: { bg: "rgba(52,40,10,.96)", br: "#d9a53a", fg: "#ffe2a4" },
    manual: { bg: "rgba(18,36,56,.96)", br: "#4b8fd1", fg: "#b4d6f4" },
    to: { bg: "rgba(46,34,10,.96)", br: "#b08a2a", fg: "#f0d79a" },
  };
  function drawTags() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `700 ${px(11)}px Raleway, 'Segoe UI', sans-serif`;
    for (const [id, n] of Object.entries(S.ND)) {
      if (!n.drive || n.kind === "motor") continue;
      let tags = tagsFor(n);
      // приводы-значки показывают метки у своего узла
      for (const [mid, mn] of Object.entries(S.ND)) {
        if (mn.kind === "motor" && mn.parent === id && mn.drive !== n.drive && mn.drive !== n.drive2) tags = tags.concat(tagsFor(mn));
      }
      if (!tags.length) continue;
      const x0 = SX(n.x + n.w / 2);
      let y = SY(n.y + n.h) + px(6);
      tags.slice(0, 3).forEach(([k, s]) => {
        const st = TAG[k];
        const w = ctx.measureText(s).width + px(14), h = px(17);
        ctx.save();
        ctx.globalAlpha = st.blink ? 0.82 + 0.18 * Math.sin(performance.now() / 180) : 1;
        rr(x0 - w / 2, y, w, h, px(3)); ctx.fillStyle = st.bg; ctx.fill();
        ctx.strokeStyle = st.br; ctx.lineWidth = px(1.3); ctx.stroke();
        ctx.fillStyle = st.fg; ctx.textAlign = "center";
        ctx.fillText(s, x0, y + px(12));
        ctx.restore();
        y += h + px(3);
      });
    }
    for (const [id, n] of Object.entries(S.ND)) {
      if (n.kind !== "motor" || n.parent) continue;
      const tags = tagsFor(n);
      if (!tags.length) continue;
      const [k, s] = tags[0], st = TAG[k];
      const x0 = SX(n.x + n.w / 2), y = SY(n.y + n.h) + px(18);
      const w = ctx.measureText(s).width + px(14), h = px(17);
      rr(x0 - w / 2, y, w, h, px(3)); ctx.fillStyle = st.bg; ctx.fill();
      ctx.strokeStyle = st.br; ctx.lineWidth = px(1.3); ctx.stroke();
      ctx.fillStyle = st.fg; ctx.textAlign = "center"; ctx.fillText(s, x0, y + px(12));
    }
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function drawBunkerText() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [id, n] of Object.entries(S.ND)) {
      if (!n.level) continue;
      const f = (S.levels[n.level] || 0) * 100;
      const full = { bo_1: S.V.out_dvy_bo_1, bo_2: S.V.out_dvy_bo_2, bo_3: S.V.out_dvy_bo_3,
        V: S.V.out_dvy_a, A: S.V.out_dvy_bunk_1, B: S.V.out_dvy_bunk_2 }[n.level];
      const cx = SX(n.x + n.w / 2);
      let py = SY(n.y + n.h * (n.kind === "silo" ? 0.3 : 0.36));
      if (n.letter) {
        ctx.font = `800 ${px(26)}px Raleway, 'Segoe UI', sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = px(4); ctx.strokeStyle = "rgba(8,12,18,.88)";
        ctx.strokeText(n.letter, cx, py);
        ctx.fillStyle = "#e8eef5"; ctx.fillText(n.letter, cx, py);
        py += px(8);
      }
      ctx.font = `700 ${px(n.letter ? 14 : 12)}px Raleway, 'Segoe UI', sans-serif`;
      const txt = Math.round(f) + "%" + (full ? " ДВУ" : "");
      const w = ctx.measureText(txt).width + px(14), h = px(n.letter ? 19 : 17);
      rr(cx - w / 2, py, w, h, px(3));
      ctx.fillStyle = "rgba(10,17,25,.9)"; ctx.fill();
      ctx.strokeStyle = full ? C.bad : f >= 90 ? C.warn : C.ok; ctx.lineWidth = px(1.2); ctx.stroke();
      ctx.fillStyle = full ? "#ffb3aa" : "#b6f0c8"; ctx.textAlign = "center";
      ctx.fillText(txt, cx, py + h - px(5));
    }
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  }

  function drawSelection() {
    for (const [id, n] of Object.entries(S.ND)) {
      const pad = n.kind === "motor" ? 3 : 5;
      if (hover === id || selected === id) {
        rr(n.x - pad, n.y - pad, n.w + pad * 2, n.h + pad * 2, 8);
        ctx.strokeStyle = selected === id ? "rgba(120,190,255,.95)" : "rgba(75,143,209,.8)";
        ctx.lineWidth = selected === id ? 3.2 : 2.4; ctx.stroke();
      }
      if (n.kind !== "motor" && nodeFault(n)) {
        rr(n.x - pad, n.y - pad, n.w + pad * 2, n.h + pad * 2, 8);
        ctx.strokeStyle = "rgba(224,80,63," + (0.55 + 0.45 * Math.sin(performance.now() / 160)) + ")";
        ctx.lineWidth = 3; ctx.stroke();
      }
    }
  }

  function drawBackdrop() {
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = 0; x <= S.W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S.H); ctx.stroke(); }
    for (let y = 0; y <= S.H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S.W, y); ctx.stroke(); }
    // межэтажная граница основного и отходного трактов
    ctx.fillStyle = "rgba(0,67,149,.035)";
    ctx.fillRect(0, 860, S.W, S.H - 860);
    ctx.strokeStyle = "rgba(0,67,149,.22)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 860); ctx.lineTo(S.W, 860); ctx.stroke();
    ctx.font = "700 30px Raleway, 'Segoe UI', sans-serif";
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(0,67,149,.42)";
    ctx.fillText("ОСНОВНОЙ ТРАКТ ОЧИСТКИ", S.W - 30, 44);
    ctx.fillText("АСПИРАЦИЯ И ОТХОДЫ", S.W - 30, 904);
    const fy = S.H - 60;
    const fg = ctx.createLinearGradient(0, fy, 0, S.H);
    fg.addColorStop(0, "rgba(150,160,172,.45)"); fg.addColorStop(1, "rgba(120,130,142,.6)");
    ctx.fillStyle = fg; ctx.fillRect(0, fy, S.W, 60);
  }

  function drawWatermark() {
    const img = IMG.logo;
    if (!img) return;
    const w = 230, h = (img.height / img.width) * w;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.drawImage(img, S.W - w - 40, S.H - h - 80, w, h);
    ctx.restore();
  }

  const BACK = ["truck_in", "truck_out", "truck_A", "truck_B"];

  function render() {
    const now = performance.now() / 1000;
    if (ready) stepParticles(lastFrame ? now - lastFrame : 0);
    lastFrame = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
    drawBackdrop();
    if (!ready) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = "600 15px Raleway, 'Segoe UI', sans-serif";
      ctx.fillStyle = C.textDim; ctx.textAlign = "center";
      ctx.fillText("Загрузка моделей оборудования…", cv.width / 2, cv.height / 2);
      return;
    }
    if (VOPT.ducts) drawDucts();
    if (VOPT.pipes) drawPipes();
    BACK.forEach(drawTruck);
    for (const [id, n] of Object.entries(S.ND)) {
      if (BACK.includes(id)) continue;
      if (n.kind === "motor") continue;
      if (n.kind === "sluice") drawSluice(id); else drawSprite(id);
    }
    drawLevels();
    ["cyc_1", "cyc_2", "cyc_3"].forEach(drawCyclone);
    drawPit();
    Object.keys(S.ND).forEach(drawMoving);
    for (const [id, n] of Object.entries(S.ND)) if (n.kind === "noria") drawNoriaInner(id);
    drawFlow();
    drawParticles();
    drawStreams();
    ["flow_1", "flow_2"].forEach(drawFlapper);
    for (const [id, n] of Object.entries(S.ND)) if (n.kind === "motor") drawMotor(id);
    drawSelection();
    if (VOPT.labels) drawLabels();
    drawBunkerText();
    if (VOPT.tags) drawTags();
  }

  global.RENDER = {
    init, render, toWorld, toClient, hitAt, zoomAt, panBy, fit,
    setHover: (id) => { hover = id; }, setSelected: (id) => { selected = id; },
    setViewOpt: (o) => { VOPT = { ...VOPT, ...o }; }, getViewOpt: () => ({ ...VOPT }),
    stats: () => ({ particles: PARTS.length }),
  };
})(window);
