'use strict';
// Браузерная проверка интерфейса. Нужен пакет playwright с Chromium:
//   npm i -D playwright && npx playwright install chromium
//   node tests/test_ui.js
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('playwright не установлен — проверка интерфейса пропущена'); process.exit(0);
}

const URL = 'file://' + path.join(__dirname, '..', 'frontend', 'index.html');
const results = [];
const check = (ok, name) => { results.push([!!ok, name]); console.log(ok ? 'ok  ' : 'FAIL', name); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(1200);

  check(await page.evaluate(() => PLANT.V.avar_stop && PLANT.V.gemer), 'После загрузки нажат аварийный стоп (как на панели)');
  check(await page.locator('#btn-start').isDisabled(), 'Пуск режима недоступен при общей аварии');
  check(await page.locator('.site-header, .site-nav').count() === 0, 'Шапки сайта с меню нет');
  const bar = await page.locator('#gemer-bar').boundingBox();
  const stage = await page.locator('#stage').boundingBox();
  check(bar && stage && bar.y + bar.height <= stage.y + 0.5, 'Полоса общей аварии над схемой, а не поверх механизмов');
  check(await page.evaluate(() => ['truck_in', 'truck_out', 'truck_A', 'truck_B'].every((id) => {
    const n = PLANT.ND[id]; return PLANT.S.trucks[id].phase === 'park' && RENDER.hitAt(n.x + n.w / 2, n.y + n.h / 2) === id;
  })), 'Автомобили стоят у ямы и под бункерами В, А, Б');
  // холст с file:// «испачкан» спрайтами — пиксель берём со скриншота (PNG 1×1)
  const png = await page.screenshot({ clip: { x: stage.x + stage.width - 30, y: stage.y + stage.height / 2, width: 1, height: 1 } });
  const chunks = [];
  for (let o = 8; o < png.length; o += 12 + png.readUInt32BE(o)) {
    if (png.toString('ascii', o + 4, o + 8) === 'IDAT') chunks.push(png.subarray(o + 8, o + 8 + png.readUInt32BE(o)));
  }
  const px = require('node:zlib').inflateSync(Buffer.concat(chunks));
  const bg = (px[1] + px[2] + px[3]) / 3;
  check(bg > 170, 'Светлый фон мнемосхемы (яркость ' + Math.round(bg) + ')');
  await page.click('#btn-estop');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !PLANT.V.gemer), 'Кнопка аварийного стопа отжимается');
  check(await page.locator('#gemer-bar').isHidden(), 'Полоса аварии скрыта после отжатия стопа');

  const ids = await page.locator('[data-machine]').evaluateAll((els) => els.map((e) => e.dataset.machine));
  check(ids.length === 33, 'В списке 33 привода и переключателя ПЛК');
  let opened = 0;
  for (const id of ids) {
    await page.click(`[data-machine="${id}"]`);
    if (await page.locator('.dlg').isVisible()) opened++;
    await page.keyboard.press('Escape');
  }
  check(opened === ids.length, 'Окно открывается для каждого механизма');

  // щелчок по схеме
  const [x, y] = await page.evaluate(() => { const n = PLANT.ND.noria_4; return RENDER.toClient(n.x + n.w / 2, n.y + n.h / 2); });
  await page.mouse.click(x, y);
  check((await page.locator('#dlg-title').textContent()).includes('Нория НС-В.10.10'), 'Щелчок по нории 4 на схеме открывает её окно');
  await page.keyboard.press('Escape');

  // режим очистки из окна HMI
  await page.click('#rail-clean');
  check(await page.locator('.dlg .toggle').count() === 6, 'Окно «Режим очистки»: шесть переключателей');
  await page.click('.dlg .big-go');
  await page.keyboard.press('Escape');
  await page.selectOption('#speed', '20');
  await page.waitForTimeout(3500);
  const runningCount = await page.evaluate(() => Object.values(PLANT.S.machines).filter((m) => m.running).length);
  check(runningCount >= 28, 'Каскадный пуск: в работе ' + runningCount + ' приводов');
  check(await page.locator('#lamp-mode.on-ok').count() === 1, 'Лампа «Режим» горит');
  check(await page.evaluate(() => RENDER.stats().particles) > 20, 'Зерно сыплется по самотёчным трубам (частицы)');
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  check(fps >= 20, 'Анимация не тормозит: ' + Math.round(fps) + ' кадр/с');

  // аварийный стоп останавливает всё
  await page.click('#btn-estop');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !PLANT.V.mode_och && Object.values(PLANT.S.machines).every((m) => !m.cmd)), 'Аварийный стоп снимает режим и все выходы');

  for (const tab of ['equip', 'alarms', 'signals', 'settings', 'mimic']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(350);
    check(await page.locator('#view-' + tab).isVisible(), 'Вкладка ' + tab);
  }
  await page.click('[data-tab="equip"]'); await page.waitForTimeout(400);
  check(await page.locator('#eq-rows tr').count() === 33, 'Таблица оборудования: 33 строки');
  await page.click('[data-tab="settings"]'); await page.waitForTimeout(200);
  check(await page.locator('.timer-table tbody tr').count() === 31, 'Таблица задержек: 31 привод');
  await page.click('[data-tab="mimic"]');

  for (const [w, h] of [[1920, 1080], [1366, 768], [768, 1024], [400, 800]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Без горизонтальной прокрутки ' + w + '×' + h);
    await page.click('#rail-clean');
    check(await page.locator('.dlg').evaluate((el) => el.getBoundingClientRect().right <= innerWidth + 1), 'Окно помещается ' + w + '×' + h);
    await page.keyboard.press('Escape');
  }

  await page.click('#rail-clean');
  const pnev = await page.evaluate(() => PLANT.V.with_pnev);
  await page.locator('.dlg .toggle').nth(3).click();
  await page.waitForTimeout(400);
  await page.reload();
  check(await page.evaluate(() => PLANT.V.with_pnev) === !pnev, 'Маршрут очистки сохраняется после перезагрузки');
  await page.evaluate(() => localStorage.removeItem('lpzs-rodina-retain-v2'));

  check(errors.length === 0, 'Нет ошибок JavaScript' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  const failed = results.filter((r) => !r[0]).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
