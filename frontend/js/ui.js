/* ЛПЗС «Родина» — интерфейс пульта: панель, окна механизмов (стиль пульта Weintek),
   журнал, график, тренажёр аварий. Связка с PLANT (модель) и RENDER (канвас). */

(function (global) {
  "use strict";

  const P = global.PLANT;
  const S = P.S;
  const $ = (id) => document.getElementById(id);

  let selected = null;
  let chartKey = "temp";
  let chartKey2 = "temp";
  const viewOpt = { labels: true, pipes: true, ducts: true, legend: true };
  let openDiverterId = null;
  let openDlgId = null;   // id механизма, чьё окно открыто — для живого обновления

  const SENSOR_NAMES = { dks: "ДКС", dsl1: "ДСЛ 1", dsl2: "ДСЛ 2", dp: "ДП", prot: "Защита двигателя" };

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }


  let dialogReturnFocus = null;
  const settingLimits = {"dvu_bo61": [0.0, 120.0], "dvu_bo9": [0.0, 120.0], "dvu_bo16": [0.0, 120.0], "dvu_a": [0.0, 120.0], "dvu_waste1": [0.0, 120.0], "dvu_waste2": [0.0, 120.0], "seq_up": [0.05, 5.0], "seq_down": [0.05, 5.0], "feed_rate": [1.0, 30.0], "prod_nom": [1.0, 40.0], "pit_load": [10.0, 100.0]};
  const roles = ["Оператор", "Наладчик", "Администратор"];
  function readNumber(inp) {
    const v = inp.value.trim() === "" ? NaN : Number(inp.value);
    const min = inp.min === "" ? 0 : Number(inp.min);
    const max = inp.max === "" ? Number.MAX_SAFE_INTEGER : Number(inp.max);
    if (!Number.isFinite(v) || v < min || v > max) {
      inp.setAttribute("aria-invalid", "true");
      toast("Введите число в допустимом диапазоне: " + min + " — " + max, true);
      inp.focus(); return null;
    }
    inp.removeAttribute("aria-invalid"); return v;
  }
  function persistSettings() {
    try {
      localStorage.setItem("lpzs_settings", JSON.stringify({s:S.settings, u:S.user, v:viewOpt, o:S.opt}));
      return true;
    } catch (e) {
      toast("Изменения применены только в этой сессии: сохранение недоступно", true);
      return false;
    }
  }
  function rebuildSettingsDraft() {
    const draft = Array.from($("view-settings").querySelectorAll("input, select"))
      .map(el => [el.id ? "#" + el.id : '[data-s="' + el.dataset.s + '"]', el.value]);
    buildSettings();
    draft.forEach(([sel, val]) => { const el = $("view-settings").querySelector(sel); if (el) el.value = val; });
  }

  function toast(msg, bad) {
    const t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = msg;
    t.setAttribute("role", bad ? "alert" : "status");
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2800);
  }

  /* ------------------------------------------------------------- диалоги */
  function closeDlg() {
    openDlgId = null;
    openDiverterId = null;
    const r = $("modal-root");
    r.className = "modal-root";
    r.innerHTML = "";
    document.querySelector(".app").inert = false;
    if (dialogReturnFocus && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
    dialogReturnFocus = null;
  }

  function dlgShell(title, body, wide) {
    openDiverterId = null;
    const r = $("modal-root");
    if (!r.classList.contains("open")) dialogReturnFocus = document.activeElement;
    document.querySelector(".app").inert = true;
    r.className = "modal-root open";
    r.innerHTML = `
      <div class="dlg ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <div class="dlg-h">
          <button type="button" class="dlg-x" id="dlg-x" aria-label="Закрыть окно">✕</button>
          <span class="dlg-title" id="dlg-title">${esc(title)}</span>
        </div>
        <div class="dlg-b">${body}</div>
      </div>`;
    $("dlg-x").onclick = closeDlg;
    r.querySelectorAll("input, select, .toggle").forEach(el => {
      const row = el.closest(".row, .srow");
      if (row) el.setAttribute("aria-label", row.textContent.trim());
    });
    r.querySelectorAll(".row.link, .menu-item").forEach(el => {
      el.tabIndex = 0; el.setAttribute("role", "button");
      el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } };
    });
    r.querySelectorAll(".toggle").forEach(el => {
      el.setAttribute("role", "switch");
      el.setAttribute("aria-checked", String(el.classList.contains("on")));
    });
    $("dlg-x").focus();
    r.onclick = (e) => { if (e.target === r) closeDlg(); };
  }

  function rowToggle(cls, on, dataAttr, label) {
    return `<div class="row ${cls}"><span>${label}</span>
      <button type="button" class="toggle ${on ? "on" : ""}" ${dataAttr}><i></i></button></div>`;
  }
  function rowNum(key, val, label, unit) {
    return `<div class="row"><span>${label}</span>
      <span><input type="number" step="0.1" min="0" data-n="${key}" value="${val}"> <span class="unit">${unit}</span></span></div>`;
  }
  function rowVal(label, val, unit, id) {
    return `<div class="row"><span>${label}</span><span class="val" ${id ? `id="${id}"` : ""}>${val}${unit ? ' <span class="unit">' + unit + "</span>" : ""}</span></div>`;
  }

  /* Окно механизма — как на пульте: тумблеры «Выкл. ДКС», задержки, ТО, ПУСК/СТОП */
  function machineDlg(m) {
    openDlgId = m.id;
    const sensorRows = m.sensorList.filter((k) => k !== "prot").map((k) => {
      const active = m.sens[k] && !m.byp[k];
      return `<div class="row ${active ? "row-alarm" : ""}">
        <span>Выкл. ${SENSOR_NAMES[k]}${m.sens[k] ? (m.byp[k] ? ' <i class="note">(сработал, контроль снят)</i>' : ' <i class="note bad">(СРАБОТАЛ)</i>') : ""}</span>
        <button type="button" class="toggle ${m.byp[k] ? "on" : ""}" data-byp="${k}"><i></i></button></div>`;
    }).join("");

    // защита двигателя: обойти нельзя, только снять после устранения
    const protRow = m.sensorList.includes("prot")
      ? `<div class="row ${m.sens.prot ? "row-alarm" : ""}">
           <span>Защита двигателя${m.sens.prot ? ' <i class="note bad">(СРАБОТАЛА)</i>' : " · норма"}</span>
           ${m.sens.prot ? '<button type="button" class="btn-sw" id="prot-clear">Снять</button>' : ""}
         </div>`
      : "";

    const links = [];
    if (m.id === "bt_14_1") links.push(`<div class="row link" data-go="bt_14_2">Триерный блок 2.1 <span>≫</span></div>`);
    if (m.id === "bt_14_2") links.push(`<div class="row link" data-go="bt_14_1">Триерный блок 1.1 <span>≫</span></div>`);
    if (m.id === "sp_18") links.push(S.machines.sp_fan
      ? `<div class="row link" data-go="sp_fan">Вентилятор пневмостола <span>→</span></div>`
      : `<div class="row unavailable"><span>Вентилятор пневмостола<small>Отдельный привод отсутствует в текущей frontend-модели.</small></span><button type="button" class="btn-sw" disabled>Недоступно</button></div>`);
    if (m.id === "as_1") links.push(`<div class="row link" data-go="sluice_1">Окно шлюз аспирации <span>≫</span></div>`);
    if (m.id === "as_2") links.push(`<div class="row link" data-go="sluice_2">Окно шлюз аспирации <span>≫</span></div>`);
    if (m.id === "as_3") links.push(`<div class="row link" data-go="sluice_3">Окно шлюз аспирации <span>≫</span></div>`);
    if (m.id === "muz_6") links.push(`<div class="row link" data-go="beater_6">МУЗ-8М битер <span>≫</span></div>`);
    if (m.id === "tor_10") links.push(`<div class="row link" data-go="beater_10">ТОР-18 битер <span>≫</span></div>`);
    if (m.id === "beater_6") links.push(`<div class="row link" data-go="muz_6">МУЗ-8М <span>≪</span></div>`);
    if (m.id === "beater_10") links.push(`<div class="row link" data-go="tor_10">ТОР-18 <span>≪</span></div>`);

    const next = P.nextOf(m.id);
    const nextName = next ? S.machines[next].name : "—";

    dlgShell(m.name + (m.poz ? "  " + m.poz : ""), `
      ${links.join("")}
      <div class="hmi-section">Защита и контроль</div>
      ${protRow}
      ${sensorRows}
      <div class="hmi-section">Временные параметры</div>
      ${rowNum("delay_start", m.delay_start, "Задержка перед запуском", "с.")}
      ${rowNum("delay_stop", m.delay_stop, "Задержка перед остановом", "с.")}
      <div class="hmi-section">Наработка и обслуживание</div>
      ${rowNum("hours_to", m.hours_to, "Интервал ТО", "ч.")}
      ${rowVal("Текущее время работы", m.hours_cur.toFixed(3), "ч.", "dlg-hcur")}
      ${rowVal("Общее время работы", m.hours_total.toFixed(1), "ч.", "dlg-htot")}
      <div class="row">Сброс часов ТО <button type="button" class="btn-sw" id="dlg-reset">Сброс</button></div>
      <div class="hmi-section">Управление механизмом</div>
      ${rowToggle("", m.ignore_next, 'data-flag="ignore_next"', "Не контролировать следующий механизм")}
      <div class="row sub"><span>следующий по потоку: ${esc(nextName)}</span></div>
      ${rowToggle("", m.manual, 'data-flag="manual"', "Ручной режим")}
      ${m.id === "intake" ? `<div class="row"><span>Заполнение ямы: ${(S.piles.pit*100).toFixed(0)} %</span>
        <button type="button" class="btn-sw" id="pit-load">Засыпать</button></div>` : ""}
      <div class="row status-row" id="dlg-status">${statusText(m)}</div>
      <div class="btn-row">
        <button type="button" class="btn-go" id="dlg-go">ПУСК</button>
        <button type="button" class="btn-stop" id="dlg-stop">СТОП</button>
      </div>`);
    bindMachineDlg(m);
  }

  function statusText(m) {
    if (m.fault) return "⚠ " + m.fault_text;
    if (m.starting) return "Запуск… " + m.t_start.toFixed(1) + " с";
    if (m.stopping) return "Останов… " + m.t_stop.toFixed(1) + " с";
    if (m.running) return "Работает · " + m.rpm.toFixed(0) + " об/мин · " + m.amps.toFixed(1) + " A";
    return "Остановлен";
  }

  function bindMachineDlg(m) {
    const r = $("modal-root");
    r.querySelectorAll("[data-byp]").forEach((t) => {
      t.onclick = () => {
        const k = t.dataset.byp;
        P.setBypass(m.id, k, !m.byp[k]);
        machineDlg(m); // перерисовать окно — состояние аварии могло измениться
      };
    });
    r.querySelectorAll("[data-flag]").forEach((t) => {
      t.onclick = () => {
        const k = t.dataset.flag;
        m[k] = !m[k];
        t.classList.toggle("on", m[k]);
        t.setAttribute("aria-checked", String(m[k]));
      };
    });
    r.querySelectorAll("input[data-n]").forEach((inp) => {
      inp.onchange = () => { const v = readNumber(inp); if (v !== null) m[inp.dataset.n] = v; else inp.value = m[inp.dataset.n]; };
    });
    const pl = $("pit-load");
    if (pl) pl.onclick = () => { S.piles.pit = 0.9; toast("Завальная яма засыпана"); machineDlg(m); };
    const pc = $("prot-clear");
    if (pc) pc.onclick = () => { P.clearSensor(m.id, "prot"); toast("Защита двигателя снята"); machineDlg(m); };
    const go = $("dlg-go"), st = $("dlg-stop"), rs = $("dlg-reset");
    if (go) go.onclick = () => {
      const res = P.startMachine(m.id);
      if (!res.ok) toast(res.error, true);
      else machineDlg(m);
    };
    if (st) st.onclick = () => { P.stopMachine(m.id); machineDlg(m); };
    if (rs) rs.onclick = () => { m.hours_cur = 0; m.to_warned = false; toast("Часы ТО сброшены"); machineDlg(m); };
    r.querySelectorAll("[data-go]").forEach((el) => {
      el.onclick = () => { const t = S.machines[el.dataset.go]; if (t) machineDlg(t); };
    });
  }

  /* живое обновление открытого окна (часы, статус) — раз в секунду */
  function refreshDlg() {
    if (openDiverterId) {
      const d = S.diverters[openDiverterId];
      const st = $("div-status");
      if (d && st) {
        st.textContent = d.busy > 0 ? "Идёт переключение · " + d.busy.toFixed(1) + " с" : "Переключение завершено";
        $("modal-root").querySelectorAll("[data-pos]").forEach(b => {
          const current = !d.busy && d.pos === b.dataset.pos;
          b.textContent = current ? "Выбрано" : "Переключить";
          b.setAttribute("aria-pressed", String(current));
          b.disabled = d.busy > 0;
          b.closest(".row").classList.toggle("direction-active", current);
        });
      }
      return;
    }
    if (!openDlgId) return;
    const m = S.machines[openDlgId];
    if (!m) return;
    const hc = $("dlg-hcur"), ht = $("dlg-htot"), st = $("dlg-status");
    if (hc) hc.innerHTML = m.hours_cur.toFixed(3) + ' <span class="unit">ч.</span>';
    if (ht) ht.innerHTML = m.hours_total.toFixed(1) + ' <span class="unit">ч.</span>';
    if (st) st.textContent = statusText(m);
  }

  function diverterDlg(id) {
    const d = S.diverters[id];
    const m = S.machines[id];
    // Legacy IDs/position tokens stay unchanged: the model uses them internally.
    const label = id === "div_10_1"
      ? {title: "Переключатель потока 13.1", a: "На БТ · триерные блоки", b: "На норию 15"}
      : {title: "Переключатель потока 13.2", a: "В бункер 16 · СП", b: "На норию 20"};
    openDlgId = null;
    dlgShell(label.title, `
      <div class="hmi-section">Направление продукта</div>
      <div class="row"><span>${label.a}</span>
        <button type="button" class="btn-sw" data-pos="${d.a}">Переключить</button></div>
      <div class="row"><span>${label.b}</span>
        <button type="button" class="btn-sw" data-pos="${d.b}">Переключить</button></div>
      <div class="row"><span>Время переключения</span>
        <span><input type="number" id="div-sw" step="0.5" min="0.5" value="${d.sw}"> <span class="unit">сек</span></span></div>
      ${rowToggle("", d.manual, 'data-dm="1"', "Ручной режим")}
      <div class="row status-row" id="div-status" role="status"></div>`);
    openDiverterId = id;
    refreshDlg();
    const r = $("modal-root");
    r.querySelectorAll("[data-pos]").forEach((b) => {
      b.onclick = () => {
        const res = P.switchDiverter(id, b.dataset.pos);
        if (!res.ok) toast(res.error, true);
        else diverterDlg(id);
      };
    });
    $("div-sw").onchange = (e) => { const v = readNumber(e.target); if (v !== null) d.sw = Math.max(0.5, v); e.target.value = d.sw; };
    r.querySelectorAll("[data-dm]").forEach((t) => {
      t.onclick = () => { d.manual = !d.manual; t.classList.toggle("on", d.manual); t.setAttribute("aria-checked", String(d.manual)); };
    });
  }

  function bunkerDlg(id) {
    const m = S.machines[id];
    const key = id === "bun_21" ? "V" : id === "bun_A" ? "A" : id === "bun_B" ? "B"
      : id === "bun_61" ? "b61" : id === "bun_9" ? "b9" : "b16";
    const f = S.piles[key] || 0;
    const dvuKey = { b61: "dvu_bo61", b9: "dvu_bo9", b16: "dvu_bo16", A: "dvu_waste1", B: "dvu_waste2", V: "dvu_a" }[key];
    dlgShell(m.name, `
      ${rowVal("Заполнение", (f * 100).toFixed(1), "%")}
      ${rowVal("ДВУ (верхний уровень)", f >= 0.95 ? "сработал" : "норма")}
      ${rowVal("Задержка ДВУ", S.settings[dvuKey], "с.")}
      <div class="row"><span>Задать уровень</span>
        <span><input type="number" id="bk-fill" min="0" max="100" value="${Math.round(f * 100)}"> <span class="unit">%</span></span></div>
      <div class="btn-row"><button type="button" class="btn-go" id="bk-go">OK</button></div>`);
    $("bk-go").onclick = () => {
      const value = readNumber($("bk-fill")); if (value === null) return;
      S.piles[key] = Math.max(0, Math.min(1, value / 100));
      closeDlg();
    };
  }

  function openMachine(id) {
    if (!id) return;
    selected = id;
    const m = S.machines[id];
    if (!m) return;
    if (m.kind === "diverter") diverterDlg(id);
    else if (m.kind === "silo" || m.kind === "hopper") bunkerDlg(id);
    else if (m.kind === "truck" || m.kind === "magnet" || m.kind === "cyclone") {
      openDlgId = null;
      dlgShell(m.name, `<div class="row"><span>${m.kind === "cyclone" ? "Пассивный узел: работает совместно с вентилятором и шлюзом аспирации." : "Пассивный узел технологической схемы. Отдельный электропривод отсутствует."}</span></div><div class="row sub"><span>Управление приводами — через соответствующие окна механизмов.</span></div>`);
      return;
    } else machineDlg(m);
    document.querySelectorAll('[data-machine]').forEach(b => {
      const m = S.machines[b.dataset.machine];
      b.classList.toggle('is-running', !!m.running);
      b.classList.toggle('is-fault', !!m.fault);
      b.title = m.fault ? 'Авария' : m.running ? 'Работает' : 'Остановлен';
    });
    renderSelected();
  }

  /* ------------------------------------------------------- меню управления */
  function menuDlg() {
    openDlgId = null;
    dlgShell("Меню управления", `
      <div class="menu-item primary" id="mi-clean"><span>Режим очистки</span><span>→</span></div>
      <div class="menu-item primary" id="mi-settings"><span>Настройки</span><span>→</span></div>
      <div class="menu-item primary" id="mi-user"><span>Учётная запись</span><span>→</span></div>
      <details class="hmi-more"><summary>Дополнительные действия</summary>
        <div class="menu-item" data-go="equip">Оборудование линии</div>
        <div class="menu-item" data-go="params">Технологические параметры</div>
        <div class="menu-item" data-go="alarms">Аварии и сообщения</div>
        <div class="menu-item" data-go="settings">Расширенные настройки</div>
        <div class="menu-item" id="mi-feed">${S.feed ? "Закрыть подачу зерна" : "Открыть подачу зерна"}</div>
        <div class="menu-item" id="mi-refill">Загрузить завальную яму</div>
      </details>`);
    $("mi-settings").onclick = settingsDlg;
    $("modal-root").querySelectorAll("[data-go]").forEach((el) => {
      el.onclick = () => { switchView(el.dataset.go); closeDlg(); };
    });
    $("mi-clean").onclick = cleanDlg;
    $("mi-feed").onclick = () => {
      const r = P.setFeed(!S.feed);
      if (!r.ok) toast(r.error, true);
      closeDlg();
    };
    $("mi-refill").onclick = () => { P.refillPit(); closeDlg(); };
    $("mi-user").onclick = userDlg;
  }

  /* --------------------------------------------------------- переключение вида */
  let view = "mimic";
  function switchView(tab) {
    view = tab;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + tab));
    if (tab === "equip") renderEquip();
    if (tab === "params") renderParams();
    if (tab === "alarms") renderAlarmsView();
    if (tab === "settings" && !$("su-login")) buildSettings();
  }

  function cleanDlg() {
    const o = S.opt;
    openDlgId = null;
    dlgShell("Режим очистки", `
      <div class="row"><span>Через триеры</span><button type="button" class="toggle ${o.triers ? "on" : ""}" data-o="triers"><i></i></button></div>
      <div class="row-2">
        <div class="row"><span>Триер 1</span><button type="button" class="toggle ${o.trier1 ? "on" : ""}" data-o="trier1"><i></i></button></div>
        <div class="row"><span>Триер 2</span><button type="button" class="toggle ${o.trier2 ? "on" : ""}" data-o="trier2"><i></i></button></div>
      </div>
      <div class="row"><span>Через пневмостол</span><button type="button" class="toggle ${o.pneumo ? "on" : ""}" data-o="pneumo"><i></i></button></div>
      <div class="row"><span>ОП · остеобрушиватель</span><button type="button" class="toggle ${o.op ? "on" : ""}" data-o="op"><i></i></button></div>
      <div class="row unavailable"><span>Ворошитель<small>Не реализован в используемой frontend-модели.</small></span><button type="button" class="toggle" disabled aria-label="Ворошитель недоступен"><i></i></button></div>
      <div class="row sub"><span>${esc(P.routeName())}</span></div>
      <div class="btn-row">
        <button type="button" class="btn-go" id="mode-go">ПУСК</button>
        <button type="button" class="btn-stop" id="mode-stop">СТОП</button>
      </div>`);
    $("modal-root").querySelectorAll("[data-o]").forEach((t) => {
      t.onclick = () => {
        const k = t.dataset.o;
        if (!changeRouteOption(k, !S.opt[k])) return;
        if (k === "triers" && !S.opt[k]) { S.opt.trier1 = S.opt.trier2 = false; }
        if ((k === "trier1" || k === "trier2") && S.opt[k]) S.opt.triers = true;
        t.classList.toggle("on", S.opt[k]);
        syncOpts();
        cleanDlg();
      };
    });
    $("mode-go").onclick = () => {
      const r = P.startMode();
      if (!r.ok) toast(r.error, true);
      else closeDlg();
    };
    $("mode-stop").onclick = () => { P.stopMode(); closeDlg(); };
  }

  function settingsDlg() {
    const s = S.settings;
    openDlgId = null;
    const row = (k, lab) => `<div class="row"><span>${lab}</span>
      <span><input type="number" step="0.5" min="0" max="120" data-s="${k}" value="${s[k]}"> <span class="unit">с.</span></span></div>`;
    dlgShell("Настройки", `
      ${row("dvu_bo61", "Задержка ДВУ бункера 6.1")}
      ${row("dvu_bo9", "Задержка ДВУ бункера 9")}
      ${row("dvu_bo16", "Задержка ДВУ бункера 16")}
      ${row("dvu_a", "Задержка ДВУ бункера В")}
      ${row("dvu_waste1", "Задержка ДВУ бункера отходов А")}
      ${row("dvu_waste2", "Задержка ДВУ бункера отходов Б")}`);
    $("modal-root").querySelectorAll("input[data-s]").forEach((inp) => {
      inp.onchange = () => { const v = readNumber(inp); if (v !== null) { S.settings[inp.dataset.s] = Math.min(120, v); persistSettings(); } else inp.value = S.settings[inp.dataset.s]; };
    });
  }

  function userDlg() {
    openDlgId = null;
    dlgShell("Учетная запись", `
      <div class="row sub">Локальный профиль эмулятора. Роль не является серверной авторизацией.</div>
      <div class="row"><span>Логин</span><input type="text" id="u-login" value="${esc(S.user.login)}"></div>
      <div class="row"><span>Роль</span>
        <select id="u-role">
          <option>Оператор</option><option>Наладчик</option><option>Администратор</option>
        </select></div>
      <div class="btn-row"><button type="button" class="btn-go" id="u-ok">OK</button></div>`);
    $("u-role").value = S.user.role;
    $("u-ok").onclick = () => {
      S.user.login = $("u-login").value.trim() || "operator";
      S.user.role = $("u-role").value;
      persistSettings();
      if ($("su-login")) { $("su-login").value = S.user.login; $("su-role").value = S.user.role; }
      P.raise("Оператор " + S.user.login + " (" + S.user.role + ") вошёл в систему", "ok");
      closeDlg();
    };
  }

  function alarmsDlg(archive) {
    openDlgId = null;
    const list = archive ? S.archive : S.alarms;
    const rows = list.slice(0, 60).map((a, i) =>
      `<tr class="${i === 0 && !archive ? "fresh" : ""}"><td>${a.ts}</td><td>${esc(a.message)}</td></tr>`).join("");
    dlgShell(archive ? "Архив сообщений" : "Журнал аварий", `
      <div class="table-wrap">
        <table class="alarm-table">
          <thead><tr><th>Время запуска</th><th>Сообщение</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2">Нет сообщений</td></tr>'}</tbody>
        </table>
      </div>
      ${archive ? '<button type="button" class="archive-btn" id="journal">← Вернуться в журнал</button>' : '<button type="button" class="archive-btn" id="arch">Открыть архив сообщений →</button>'}`, true);
    if (!archive) $("arch").onclick = () => alarmsDlg(true);
    else $("journal").onclick = () => alarmsDlg(false);
  }

  /* ═══════════════════════════════════ страница «Оборудование» */
  function stateChip(m) {
    if (m.fault) return '<span class="chip-st bad">Авария</span>';
    if (m.starting) return '<span class="chip-st warn">Запуск</span>';
    if (m.stopping) return '<span class="chip-st warn">Останов</span>';
    if (m.running) return '<span class="chip-st ok">Работает</span>';
    return '<span class="chip-st off">Остановлен</span>';
  }

  function matBar(m) {
    const v = Math.round((m.mat || 0) * 100);
    return `<div class="mini-bar" title="Наполнение продуктом ${v} %"><i style="width:${v}%"></i></div>`;
  }

  function renderEquip() {
    const host = $("eq-rows");
    if (!host) return;
    const q = ($("eq-search").value || "").trim().toLowerCase();
    const f = $("eq-filter").value;
    const rows = [];
    for (const [id, m] of Object.entries(S.machines)) {
      if (f === "run" && !m.running) continue;
      if (f === "stop" && m.running) continue;
      if (f === "fault" && !m.fault) continue;
      if (f === "to" && !(m.hours_to > 0 && m.hours_cur >= m.hours_to)) continue;
      const poz = (S.ND[id] && S.ND[id].poz) || "—";
      if (q && !(m.name.toLowerCase().includes(q) || String(poz).toLowerCase().includes(q))) continue;
      const left = m.hours_to > 0 ? Math.max(0, m.hours_to - m.hours_cur) : 0;
      rows.push(`<tr data-id="${id}" class="${m.fault ? "row-bad" : ""}">
        <td class="c-poz">${esc(poz)}</td>
        <td class="c-name">${esc(m.name)}</td>
        <td>${stateChip(m)}</td>
        <td>${matBar(m)}</td>
        <td>${m.amps.toFixed(1)}</td>
        <td>${Math.round(m.rpm)}</td>
        <td>${Math.round(m.load)} %</td>
        <td>${m.temp.toFixed(0)}</td>
        <td>${m.hours_total.toFixed(1)}</td>
        <td class="${m.hours_to > 0 && left <= 0 ? "due" : ""}">${m.hours_to > 0 ? left.toFixed(1) : "—"}</td>
        <td class="c-act">
          <button type="button" class="btn-xs go" data-run="${id}">Пуск</button>
          <button type="button" class="btn-xs stop" data-halt="${id}">Стоп</button>
          <button type="button" class="btn-xs" data-open="${id}">Окно</button>
        </td></tr>`);
    }
    host.innerHTML = rows.join("") || '<tr><td colspan="11" class="muted">Ничего не найдено</td></tr>';
    host.querySelectorAll("[data-run]").forEach((b) => {
      b.onclick = () => { const r = P.startMachine(b.dataset.run); if (r && !r.ok) toast(r.error, true); renderEquip(); };
    });
    host.querySelectorAll("[data-halt]").forEach((b) => {
      b.onclick = () => { P.stopMachine(b.dataset.halt); renderEquip(); };
    });
    host.querySelectorAll("[data-open]").forEach((b) => {
      b.onclick = () => openMachine(b.dataset.open);
    });
  }

  /* ═══════════════════════════════════ страница «Параметры» */
  const LEVEL_DEFS = [
    ["pit", "Завальная яма", "Приём зерна с автотранспорта"],
    ["b61", "Бункер оперативный 6.1", "Перед МУЗ-8М"],
    ["b9", "Бункер оперативный 9", "Перед ТОР-18"],
    ["b16", "Бункер оперативный 16", "Перед пневмостолом"],
    ["V", "Бункер В — чистое зерно", "Готовый продукт"],
    ["A", "Бункер отходов А", "Аспирационные относы"],
    ["B", "Бункер отходов Б", "Сход с решёт и триеров"],
  ];

  function renderParams() {
    const cards = $("param-cards");
    if (!cards) return;
    const need = P.need();
    const ready = need.filter((id) => S.machines[id] && S.machines[id].running).length;
    const items = [
      ["Производительность", S.prod.toFixed(1), "т/ч", S.prod > 1 ? "ok" : "off"],
      ["Влажность на входе", "18.6", "%", "off"],
      ["Влажность на выходе", S.humOut.toFixed(1), "%", "ok"],
      ["Температура агента", S.agent.toFixed(1), "°C", S.agent > 70 ? "warn" : "ok"],
      ["Механизмов тракта", ready + " / " + need.length, "", ready === need.length ? "ok" : "warn"],
      ["Зерна в потоке", String(S.grain.length), "частиц", "off"],
      ["Маршрут очистки", P.routeName(), "", "ok"],
      ["Подача", S.feed ? "Открыта" : "Закрыта", "", S.feed ? "ok" : "off"],
    ];
    cards.innerHTML = items.map(([t, v, u, k]) =>
      `<div class="pcard ${k}"><span class="pc-t">${esc(t)}</span>
       <b class="pc-v">${esc(v)}<small>${esc(u)}</small></b></div>`).join("");

    $("param-levels").innerHTML = LEVEL_DEFS.map(([key, name, note]) => {
      const v = (S.piles[key] || 0) * 100;
      const cls = v >= 99 ? "bad" : v >= 85 ? "warn" : "";
      return `<div class="lvl">
        <div class="lvl-top"><span>${esc(name)}</span><b>${v.toFixed(0)} %</b></div>
        <div class="lvl-bar ${cls}"><i style="width:${Math.min(100, v)}%"></i></div>
        <div class="lvl-note">${esc(note)}</div></div>`;
    }).join("");

    $("param-flow").innerHTML = P.flowList().map((id) => {
      const m = S.machines[id];
      if (!m) return "";
      const v = Math.round((m.mat || 0) * 100);
      const cls = m.fault ? "bad" : m.running ? (v > 5 ? "ok" : "idle") : "off";
      return `<div class="fnode ${cls}" title="${esc(m.name)} — продукт ${v} %">
        <span class="fn-p">${esc((S.ND[id] && S.ND[id].poz) || "")}</span>
        <div class="fn-bar"><i style="height:${v}%"></i></div>
        <span class="fn-v">${v}%</span></div>`;
    }).join('<span class="farrow">→</span>');

    drawChartOn($("chart-big"), chartKey2);
  }

  /* ═══════════════════════════════════ страница «Аварии» */
  const AL_KIND = { err: ["Авария", "bad"], warn: ["Предупреждение", "warn"],
                    ok: ["Событие", "ok"], info: ["Сообщение", "off"] };
  function alarmSource(msg) {
    for (const m of Object.values(S.machines)) if (msg.includes(m.name)) return m.name;
    return "—";
  }

  function renderAlarmsView() {
    const host = $("al-rows");
    if (!host) return;
    const archive = $("al-scope").value === "archive";
    const list = archive ? S.archive : S.alarms;
    const act = S.alarms.filter((a) => a.active).length;
    $("al-summary").innerHTML = `
      <div class="asum ${act ? "bad" : "ok"}"><span>Активных аварий</span><b>${act}</b></div>
      <div class="asum"><span>Всего в журнале</span><b>${S.alarms.length}</b></div>
      <div class="asum"><span>В архиве</span><b>${S.archive.length}</b></div>
      <div class="asum ${S.estop ? "bad" : "ok"}"><span>Аварийный стоп</span><b>${S.estop ? "НАЖАТ" : "снят"}</b></div>`;

    // сработавшие датчики: пока причина не снята, квитирование невозможно
    const trip = [];
    for (const [id, m] of Object.entries(S.machines)) {
      m.sensorList.forEach((k) => { if (m.sens[k] && !m.byp[k]) trip.push([id, k, m.name]); });
    }
    const box = $("al-causes");
    if (trip.length) {
      box.style.display = "";
      box.innerHTML = '<div class="cause-head">Причины, которые нужно снять перед квитированием</div>' +
        trip.map(([id, k, name]) => `<div class="cause">
          <span><b>${esc(name)}</b> · ${SENSOR_NAMES[k] || k}</span>
          <span><button type="button" class="btn-xs" data-byp="${id}:${k}">Снять с контроля</button>
          <button type="button" class="btn-xs go" data-clr="${id}:${k}">Устранить</button></span></div>`).join("");
      box.querySelectorAll("[data-clr]").forEach((b) => {
        b.onclick = () => {
          const [id, k] = b.dataset.clr.split(":");
          P.clearSensor(id, k);
          P.raise(S.machines[id].name + ": причина срабатывания " + (SENSOR_NAMES[k] || k) + " устранена", "ok");
          renderAlarmsView();
        };
      });
      box.querySelectorAll("[data-byp]").forEach((b) => {
        b.onclick = () => {
          const [id, k] = b.dataset.byp.split(":");
          if (S.user.role === "Оператор") { toast("Снятие с контроля доступно наладчику и администратору", true); return; }
          P.setBypass(id, k, true);
          renderAlarmsView();
        };
      });
    } else {
      box.style.display = "none";
      box.innerHTML = "";
    }
    host.innerHTML = list.slice(0, 200).map((a) => {
      const [label, cls] = AL_KIND[a.lvl] || AL_KIND.info;
      const mn = alarmSource(a.message);
      return `<tr class="${a.active ? "row-bad" : ""}">
        <td class="c-ts">${esc(a.ts)}</td>
        <td><span class="chip-st ${cls}">${label}</span></td>
        <td>${esc(mn)}</td>
        <td>${esc(a.message)}</td>
        <td>${a.active ? '<b class="due">не квитирована</b>' : "квитирована"}</td></tr>`;
    }).join("") || '<tr><td colspan="5" class="muted">Сообщений нет</td></tr>';
  }

  /* ═══════════════════════════════════ страница «Настройки» */
  function numRow(key, label, unit, step, min, max, hint) {
    return `<div class="srow"><div><span>${esc(label)}</span>${hint ? `<em>${esc(hint)}</em>` : ""}</div>
      <span class="sinp"><input type="number" data-s="${key}" value="${S.settings[key]}"
        step="${step}" min="${min}" max="${max}"><i>${esc(unit)}</i></span></div>`;
  }

  function buildSettings() {
    if (!$("set-dvu")) return;
    $("set-dvu").innerHTML =
      numRow("dvu_bo61", "Бункер оперативный 6.1", "с", 0.5, 0, 120, "Останов подачи при заполнении") +
      numRow("dvu_bo9", "Бункер оперативный 9", "с", 0.5, 0, 120, "Останов подачи при заполнении") +
      numRow("dvu_bo16", "Бункер оперативный 16", "с", 0.5, 0, 120, "Останов подачи при заполнении") +
      numRow("dvu_a", "Бункер В (чистое зерно)", "с", 0.5, 0, 120, "Останов подачи при заполнении") +
      numRow("dvu_waste1", "Бункер отходов А", "с", 0.5, 0, 120, "Останов нории 23") +
      numRow("dvu_waste2", "Бункер отходов Б", "с", 0.5, 0, 120, "Останов нории 24");

    $("set-seq").innerHTML =
      numRow("seq_up", "Шаг каскадного пуска", "с", 0.05, 0.05, 5, "Пуск идёт с хвоста линии к голове") +
      numRow("seq_down", "Шаг каскадного останова", "с", 0.05, 0.05, 5, "Останов идёт с головы линии к хвосту");

    $("set-sim").innerHTML =
      numRow("feed_rate", "Интенсивность подачи", "част./с", 1, 1, 30, "Плотность потока зерна на схеме") +
      numRow("prod_nom", "Номинальная производительность", "т/ч", 0.1, 1, 40, "Паспортное значение линии") +
      numRow("pit_load", "Загрузка ямы автотранспортом", "%", 5, 10, 100, "Сколько насыпают за один самосвал");

    const o = S.opt;
    $("set-route").innerHTML = `
      <div class="srow"><div><span>Через триеры</span><em>БТ 14.1 / 14.2</em></div>
        <button type="button" class="toggle ${o.triers ? "on" : ""}" data-o="triers"><i></i></button></div>
      <div class="srow"><div><span>Триер 1</span></div>
        <button type="button" class="toggle ${o.trier1 ? "on" : ""}" data-o="trier1"><i></i></button></div>
      <div class="srow"><div><span>Триер 2</span></div>
        <button type="button" class="toggle ${o.trier2 ? "on" : ""}" data-o="trier2"><i></i></button></div>
      <div class="srow"><div><span>Через пневмостол</span><em>СП-200</em></div>
        <button type="button" class="toggle ${o.pneumo ? "on" : ""}" data-o="pneumo"><i></i></button></div>
      <div class="srow"><div><span>Остеобрушиватель</span><em>ОП поз. 5</em></div>
        <button type="button" class="toggle ${o.op ? "on" : ""}" data-o="op"><i></i></button></div>
      <div class="srow"><div><span>Текущий маршрут</span><em>Пересчитывается при пуске режима</em></div>
        <b>${esc(P.routeName())}</b></div>`;

    $("set-user").innerHTML = `
      <div class="srow"><div><span>Логин</span></div><input type="text" id="su-login" value="${esc(S.user.login)}"></div>
      <div class="srow"><div><span>Роль</span></div>
        <select id="su-role"><option>Оператор</option><option>Наладчик</option><option>Администратор</option></select></div>
      <div class="srow"><div><span>Права</span><em>Наладчик и выше могут снимать датчики с контроля</em></div>
        <b>${S.user.role === "Оператор" ? "базовые" : "расширенные"}</b></div>`;
    $("su-role").value = S.user.role;

    $("set-view").innerHTML = `
      <div class="srow"><div><span>Подписи механизмов</span></div>
        <button type="button" class="toggle ${viewOpt.labels ? "on" : ""}" data-v="labels"><i></i></button></div>
      <div class="srow"><div><span>Технологические трассы</span></div>
        <button type="button" class="toggle ${viewOpt.pipes ? "on" : ""}" data-v="pipes"><i></i></button></div>
      <div class="srow"><div><span>Воздуховоды аспирации</span></div>
        <button type="button" class="toggle ${viewOpt.ducts ? "on" : ""}" data-v="ducts"><i></i></button></div>
      `;

    const host = $("view-settings");
    host.querySelectorAll("[data-o]").forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.o;
        if (!changeRouteOption(k, !S.opt[k])) return;
        if (k === "triers" && !S.opt.triers) { S.opt.trier1 = S.opt.trier2 = false; }
        if ((k === "trier1" || k === "trier2") && S.opt[k]) S.opt.triers = true;
        if (!S.opt.trier1 && !S.opt.trier2) S.opt.triers = false;
        syncOpts(); rebuildSettingsDraft();
      };
    });
    host.querySelectorAll("[data-v]").forEach((b) => {
      b.onclick = () => { viewOpt[b.dataset.v] = !viewOpt[b.dataset.v]; global.RENDER.setViewOpt(viewOpt); rebuildSettingsDraft(); };
    });
  }

  function saveSettings() {
    const host = $("view-settings");
    const values = {};
    for (const inp of host.querySelectorAll("input[data-s]")) {
      const v = readNumber(inp); if (v === null) return;
      values[inp.dataset.s] = v;
    }
    Object.assign(S.settings, values);
    S.user.login = $("su-login").value.trim() || "operator";
    S.user.role = roles.includes($("su-role").value) ? $("su-role").value : roles[0];
    global.RENDER.setViewOpt(viewOpt);
    if (persistSettings()) {
      P.raise("Настройки сохранены оператором " + S.user.login, "ok");
      toast("Настройки сохранены");
    }
    buildSettings();
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem("lpzs_settings");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || typeof d !== "object") return;
      if (d.s && typeof d.s === "object") Object.entries(settingLimits).forEach(([k, [min, max]]) => {
        const v = d.s[k];
        if (typeof v === "number" && Number.isFinite(v)) S.settings[k] = Math.max(min, Math.min(max, v));
      });
      if (d.u && typeof d.u === "object") {
        if (typeof d.u.login === "string") S.user.login = d.u.login.trim() || "operator";
        if (roles.includes(d.u.role)) S.user.role = d.u.role;
      }
      if (d.v && typeof d.v === "object") Object.keys(viewOpt).forEach(k => {
        if (typeof d.v[k] === "boolean") viewOpt[k] = d.v[k];
      });
      if (d.o && typeof d.o === "object") {
        const options = {};
        Object.keys(S.opt).forEach(k => { if (typeof d.o[k] === "boolean") options[k] = d.o[k]; });
        P.setOptions(options);
      }
    } catch (e) { /* повреждённые данные — игнорируем */ }
  }

  /* ------------------------------------------------------ выбранный узел */
  function renderSelected() {
    const box = $("sel-body");
    if (!selected || !S.machines[selected]) {
      box.innerHTML = '<div class="muted">Кликните по механизму на схеме.</div>';
      return;
    }
    const m = S.machines[selected];
    const st = m.fault ? '<b class="st-bad">авария</b>'
      : m.running ? '<b class="st-ok">работает</b>'
      : m.starting ? '<b class="st-warn">запуск</b>'
      : m.stopping ? '<b class="st-warn">останов</b>' : '<b>стоп</b>';
    box.innerHTML = `
      <div class="sel-head">
        <div class="sel-ico">${iconFor(m.kind)}</div>
        <div>
          <div class="sel-name">${esc(m.name)}</div>
          <div class="sel-sub">${m.poz ? "поз. " + m.poz + " · " : ""}${st}</div>
        </div>
      </div>
      <div class="sel-kv">
        <span>Скорость</span><b>${m.rpm.toFixed(0)} об/мин</b>
        <span>Ток двигателя</span><b>${m.amps.toFixed(1)} A</b>
        <span>Температура</span><b>${m.temp.toFixed(1)} °C</b>
        <span>Нагрузка</span><b>${m.load.toFixed(0)} %</b>
        <span>Наработка</span><b>${m.hours_cur.toFixed(1)} / ${m.hours_to} ч</b>
      </div>
      <div class="sel-actions">
        <button type="button" class="btn-go sm" id="sel-go">ПУСК</button>
        <button type="button" class="btn-stop sm" id="sel-stop">СТОП</button>
        <button type="button" class="btn-mini" id="sel-more">Окно механизма…</button>
      </div>`;
    $("sel-go").onclick = () => {
      const r = P.startMachine(selected);
      if (!r.ok) toast(r.error, true);
    };
    $("sel-stop").onclick = () => P.stopMachine(selected);
    $("sel-more").onclick = () => openMachine(selected);
  }

  function iconFor(kind) {
    return { noria: "🛗", belt: "➖", screw: "🌀", fan: "🌪", trier: "🥁", muz: "⚙", tor: "⚙",
      sp: "🌬", silo: "🛢", hopper: "🛢", pit: "🕳", cyclone: "🌪", diverter: "🔀", op: "⚙", gate: "🚪" }[kind] || "⚙";
  }

  /* ------------------------------------------------------------- график */
  function drawChart() { drawChartOn($("chart"), chartKey); }

  function drawChartOn(c, chartKey) {
    if (!c) return;
    const ctx = c.getContext("2d");
    const r = c.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    const data = S.trend[chartKey] && S.trend[chartKey].filter(Number.isFinite);
    if (!data) return;
    const max = chartKey === "temp" ? 100 : chartKey === "hum" ? 25 : 20;
    ctx.strokeStyle = "#d4dae2"; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, (H * i) / 4); ctx.lineTo(W, (H * i) / 4); ctx.stroke();
    }
    if (data.length < 2) {
      ctx.fillStyle = "#8b97a6"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Накопление данных…", W / 2, H / 2);
      return;
    }
    const col = chartKey === "temp" ? "#d99a17" : chartKey === "hum" ? "#3d9cf0" : "#1f9d4d";
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - (v / max) * (H - 12) - 6;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col + "33"); g.addColorStop(1, col + "00");
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "#5a6673"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(data[data.length - 1].toFixed(1) + (chartKey === "temp" ? " °C" : chartKey === "hum" ? " %" : " т/ч"), 6, 14);
  }

  /* --------------------------------------------------------------- панель */
  function changeRouteOption(key, value) {
    const patch = { [key]: value };
    if (key === "triers") {
      patch.trier1 = value;
      patch.trier2 = value;
    }
    if ((key === "trier1" || key === "trier2") && value) patch.triers = true;
    const result = P.setOptions(patch);
    if (!result.ok) toast(result.error, true);
    syncOpts();
    return result.ok;
  }

  function syncOpts() {
    $("opt-trier").checked = S.opt.triers;
    $("opt-t1").checked = S.opt.trier1;
    $("opt-t2").checked = S.opt.trier2;
    $("opt-sp").checked = S.opt.pneumo;
    $("opt-op").checked = S.opt.op;
  }

  function renderPanel() {
    $("clock").textContent = P.ts();
    const d = new Date();
    $("date").textContent = [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((n) => String(n).padStart(2, "0")).join(".");

    const dot = $("mode-dot"), txt = $("mode-text");
    dot.className = "dot";
    if (S.estop) txt.textContent = "Аварийный стоп";
    else if (S.mode_starting) { txt.textContent = "Запуск линии"; dot.classList.add("start"); }
    else if (S.mode_stopping) { txt.textContent = "Останов линии"; dot.classList.add("start"); }
    else if (S.mode_run) { txt.textContent = "Симуляция · работа"; dot.classList.add("run"); }
    else txt.textContent = "Симуляция · стоп";

    $("btn-estop").classList.toggle("off", !S.estop);
    $("alarm-line").textContent = P.statusLine();
    $("route-line").textContent = P.routeName();

    const big = $("big-status");
    big.innerHTML = `<span class="dot ${S.estop ? "" : S.mode_run ? "run" : S.mode_starting || S.mode_stopping ? "start" : ""}"></span>${esc(P.statusLine())}`;

    $("kv-prod").textContent = S.prod.toFixed(1) + " т/ч";
    $("kv-hum-in").textContent = S.humIn.toFixed(1) + " %";
    $("kv-hum-out").textContent = S.humOut.toFixed(1) + " %";
    $("kv-temp").textContent = S.agent.toFixed(1) + " °C";

    $("bunker-meters").innerHTML = [["A", "Бункер А (отходы)"], ["B", "Бункер Б (фураж)"], ["V", "Бункер В (зерно)"]].map(([k, name]) => {
      const f = (S.piles[k] || 0) * 100;
      return `<div class="meter"><span>${name}</span>
        <div class="bar ${f >= 95 ? "full" : ""}"><i style="width:${f}%"></i></div>
        <span>${f.toFixed(0)}%</span></div>`;
    }).join("");

    const quick = [["as_1", "АС-1"], ["as_2", "АС-2"], ["as_3", "АС-3"],
      ["intake", "Завальная яма"], ["noria_4", "Нория 4"], ["noria_20", "Нория 20"]];
    $("quick").innerHTML = quick.map(([id, name]) => {
      const m = S.machines[id];
      const on = m.running || m.starting;
      return `<div class="quick-row"><span>${name}</span>
        <span class="st">${m.fault ? "авария" : on ? "вкл" : "выкл"}</span>
        <button type="button" class="qtoggle ${on ? "on" : ""}" data-q="${id}"><i></i></button></div>`;
    }).join("");
    $("quick").querySelectorAll("[data-q]").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.q;
        const m = S.machines[id];
        if (m.running || m.starting) P.stopMachine(id);
        else {
          const r = P.startMachine(id);
          if (!r.ok) toast(r.error, true); else m.manual = true;
        }
      };
    });

    $("log").innerHTML = S.alarms.slice(0, 14).map((a) =>
      `<div><span class="dot-mini" style="background:${a.lvl === "err" ? "#d43a2e" : a.lvl === "ok" ? "#1f9d4d" : "#d99a17"}"></span>
       <span class="ts">${a.ts}</span><span>${esc(a.message)}</span></div>`).join("");

    // подача зерна и остаток в завальной яме
    const pit = (S.piles.pit || 0) * 100;
    $("kv-pit").textContent = pit.toFixed(0) + " %";
    const pf = $("pit-fill");
    pf.style.width = Math.max(0, Math.min(100, pit)) + "%";
    pf.className = pit <= 5 ? "empty" : pit <= 20 ? "low" : "";
    const fb = $("btn-feed");
    fb.textContent = S.feed ? "Закрыть подачу" : "Открыть подачу";
    fb.classList.toggle("act", S.feed);

    // счётчик активных аварий на вкладке
    const act = S.alarms.filter((a) => a.active).length;
    const badge = $("tab-alarm-count");
    badge.textContent = act ? String(act) : "";
    badge.style.display = act ? "inline-block" : "none";

    document.querySelectorAll('[data-machine]').forEach(b => {
      const m = S.machines[b.dataset.machine];
      b.classList.toggle('is-running', !!m.running);
      b.classList.toggle('is-fault', !!m.fault);
      b.title = m.fault ? 'Авария' : m.running ? 'Работает' : 'Остановлен';
    });
    renderSelected();
    drawChart();
    refreshDlg();

    // живое обновление открытой страницы
    if (view === "equip") renderEquip();
    else if (view === "params") renderParams();
    else if (view === "alarms") renderAlarmsView();
  }

  /* ---------------------------------------------------------------- ввод */
  function bindCanvas() {
    const cv = $("plant-canvas");
    cv.addEventListener("click", (e) => {
      const [wx, wy] = global.RENDER.toWorld(e.clientX, e.clientY);
      const id = global.RENDER.hitAt(wx, wy);
      if (id) openMachine(id);
    });
    cv.addEventListener("mousemove", (e) => {
      const [wx, wy] = global.RENDER.toWorld(e.clientX, e.clientY);
      const id = global.RENDER.hitAt(wx, wy);
      global.RENDER.setHover(id);
      cv.style.cursor = id ? "pointer" : "default";
      const tip = $("tooltip");
      if (id && S.machines[id]) {
        const m = S.machines[id];
        tip.style.display = "block";
        tip.style.left = e.clientX + 14 + "px";
        tip.style.top = e.clientY + 10 + "px";
        tip.innerHTML = `<b>${esc(m.name)}</b><br>${m.fault ? "АВАРИЯ" : m.running ? "работает" : m.starting ? "запуск" : "стоп"}`;
      } else tip.style.display = "none";
    });
    cv.addEventListener("mouseleave", () => { $("tooltip").style.display = "none"; });
  }

  function bindOperatorRail() {
    $("rail-clean").onclick = cleanDlg;
    $("rail-settings").onclick = settingsDlg;
    $("rail-alarms").onclick = () => alarmsDlg(false);
    const inventory = Object.values(S.machines);
    const draw = () => {
      const q = $("rail-search").value.trim().toLowerCase();
      $("rail-machines").innerHTML = inventory.filter(m => (m.name + " " + (m.poz || "")).toLowerCase().includes(q)).map(m =>
        `<button type="button" class="rail-machine" data-machine="${esc(m.id)}"><span class="rail-led" aria-hidden="true"></span><span>${esc(m.name)}${m.poz && !m.name.endsWith(' ' + m.poz) && !m.name.endsWith('(' + m.poz + ')') ? ' · ' + esc(m.poz) : ''}</span><span>›</span></button>`).join("") || '<p class="muted">Не найдено</p>';
      $("rail-machines").querySelectorAll("[data-machine]").forEach(b => b.onclick = () => openMachine(b.dataset.machine));
    };
    $("rail-search").oninput = draw;
    draw();
    // Use keyboard semantics for legacy clickable HMI rows.
    new MutationObserver(() => {
      $("modal-root").querySelectorAll('.menu-item, .row.link').forEach(el => {
        if (el.tagName === 'BUTTON' || el.hasAttribute('tabindex')) return;
        el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
        el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
      });
    }).observe($("modal-root"), {childList:true, subtree:true});
  }

  function bindUI() {
    bindOperatorRail();
    $("btn-estop").onclick = () => P.setEstop(!S.estop);
    const ack = () => {
      const r = P.ackAlarms();
      if (!r.ok) toast(r.error, true);
      else toast("Аварии квитированы");
    };
    $("btn-ack").onclick = ack;
    $("btn-ack2").onclick = ack;

    $("btn-start").onclick = () => {
      syncOpts();
      const r = P.startMode();
      if (!r.ok) toast(r.error, true);
    };
    $("btn-stop").onclick = () => P.stopMode();

    $("opt-trier").onchange = (e) => changeRouteOption("triers", e.target.checked);
    $("opt-t1").onchange = (e) => changeRouteOption("trier1", e.target.checked);
    $("opt-t2").onchange = (e) => changeRouteOption("trier2", e.target.checked);
    $("opt-sp").onchange = (e) => changeRouteOption("pneumo", e.target.checked);
    $("opt-op").onchange = (e) => changeRouteOption("op", e.target.checked);

    document.querySelectorAll("[data-fault]").forEach((b) => {
      b.onclick = () => {
        const [mid, sensor] = b.dataset.fault.split(":");
        const r = P.injectSensor(mid, sensor);
        if (!r.ok) toast(r.error || "Ошибка", true);
        else toast("Имитация: " + (S.machines[mid].fault_text || "датчик сработал"), true);
      };
    });

    document.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => switchView(t.dataset.tab);
    });

    $("eq-search").oninput = () => renderEquip();
    $("eq-filter").onchange = () => renderEquip();
    $("al-scope").onchange = () => renderAlarmsView();
    $("al-ack").onclick = ack;
    $("set-save").onclick = saveSettings;
    $("set-reset").onclick = () => { P.resetSettings(); buildSettings(); if (persistSettings()) toast("Настройки сброшены и сохранены"); };

    $("btn-feed").onclick = () => {
      const r = P.setFeed(!S.feed);
      if (!r.ok) toast(r.error, true);
    };
    $("btn-refill").onclick = () => { P.refillPit(); toast("Завальная яма загружена"); };

    document.querySelectorAll("[data-chart2]").forEach((c) => {
      c.onclick = () => {
        document.querySelectorAll("[data-chart2]").forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        chartKey2 = c.dataset.chart2;
      };
    });

    document.querySelectorAll(".chip[data-chart]").forEach((c) => {
      c.onclick = () => {
        document.querySelectorAll(".chip[data-chart]").forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        chartKey = c.dataset.chart;
      };
    });

    $("btn-menu").onclick = menuDlg;
    document.addEventListener("keydown", (e) => {
      const modal = $("modal-root");
      if (!modal.classList.contains("open")) return;
      if (e.key === "Escape") { e.preventDefault(); closeDlg(); }
      if (e.key === "Tab") {
        const items = Array.from(modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------------------------------------------------------------- цикл */
  let panelAcc = 1;
  function init() {
    loadSettings();
    global.RENDER.init($("plant-canvas"), () => renderPanel());
    global.RENDER.setViewOpt(viewOpt);
    bindCanvas();
    bindUI();
    syncOpts();
    switchView("mimic");
    let last = performance.now();
    function loop(t) {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      P.tick(dt);
      global.RENDER.render();
      panelAcc += dt;
      if (panelAcc >= 0.25) {
        panelAcc = 0;
        renderPanel();
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
