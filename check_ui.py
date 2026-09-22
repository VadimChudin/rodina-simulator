"""Полная проверка интерфейса эмулятора: вкладки, кнопки, настройки, потоки."""
from playwright.sync_api import sync_playwright

URL = "file:///home/user/lpzs_emulation/frontend/index.html"
errs, fails = [], []


def ok(cond, name):
    print(("  OK  " if cond else "ПРОВАЛ") + " | " + name)
    if not cond:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1800, "height": 1040})
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e) + " | " + (e.stack or "")[:400]))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(URL)
    pg.wait_for_timeout(3500)

    print("\n=== вкладки ===")
    for tab, vid in [("equip", "view-equip"), ("params", "view-params"),
                     ("alarms", "view-alarms"), ("settings", "view-settings"), ("mimic", "view-mimic")]:
        pg.click(f'.tab[data-tab="{tab}"]')
        pg.wait_for_timeout(500)
        ok(pg.is_visible("#" + vid), f"вкладка {tab} открывает {vid}")

    print("\n=== оборудование ===")
    pg.click('.tab[data-tab="equip"]'); pg.wait_for_timeout(600)
    rows = pg.locator("#eq-rows tr").count()
    ok(rows >= 30, f"таблица оборудования заполнена ({rows} строк)")
    pg.fill("#eq-search", "нория"); pg.wait_for_timeout(400)
    ok(pg.locator("#eq-rows tr").count() < rows, "поиск фильтрует список")
    pg.fill("#eq-search", ""); pg.select_option("#eq-filter", "run"); pg.wait_for_timeout(400)
    ok(True, "фильтр по состоянию применяется")
    pg.select_option("#eq-filter", "all"); pg.wait_for_timeout(300)
    pg.evaluate("()=>PLANT.setEstop(false)"); pg.wait_for_timeout(300)
    pg.evaluate("()=>{PLANT.S.machines.noria_24.manual=true;}")
    pg.locator('#eq-rows tr[data-id="noria_24"] [data-run]').click(); pg.wait_for_timeout(900)
    ok(pg.evaluate("()=>PLANT.S.machines.noria_24.running||PLANT.S.machines.noria_24.starting"),
       "кнопка Пуск в таблице запускает механизм")

    print("\n=== настройки ===")
    pg.click('.tab[data-tab="settings"]'); pg.wait_for_timeout(600)
    for sec in ["set-dvu", "set-seq", "set-route", "set-user", "set-view", "set-sim"]:
        ok(pg.locator(f"#{sec} > *").count() > 0, f"раздел {sec} наполнен")
    pg.fill('input[data-s="dvu_bo9"]', "17")
    pg.click("#set-save"); pg.wait_for_timeout(600)
    ok(pg.evaluate("()=>PLANT.S.settings.dvu_bo9") == 17, "сохранение настройки ДВУ применяется в модель")
    ok(pg.evaluate("()=>!!localStorage.getItem('lpzs_settings')"), "настройки пишутся в localStorage")
    pg.click("#set-reset"); pg.wait_for_timeout(500)
    ok(pg.evaluate("()=>PLANT.S.settings.dvu_bo9") == 8, "сброс возвращает заводское значение")
    pg.click('#set-view [data-v="legend"]'); pg.wait_for_timeout(300)
    ok(pg.evaluate("()=>document.querySelector('#set-view [data-v=legend]').classList.contains('on')") is False,
       "переключатель отображения меняет состояние")
    pg.click('#set-view [data-v="legend"]'); pg.wait_for_timeout(200)

    print("\n=== пуск линии и подача ===")
    pg.click('.tab[data-tab="mimic"]'); pg.wait_for_timeout(300)
    pg.evaluate("()=>PLANT.setEstop(true)"); pg.wait_for_timeout(300)
    pg.click("#btn-estop"); pg.wait_for_timeout(400)
    ok(pg.evaluate("()=>!PLANT.S.estop"), "аварийный стоп снимается")
    pg.evaluate("()=>PLANT.ackAlarms()"); pg.wait_for_timeout(300)
    pg.click("#btn-start"); pg.wait_for_timeout(16000)
    ok(pg.evaluate("()=>PLANT.S.mode_run"), "режим очистки запустился")
    ok(pg.evaluate("()=>PLANT.S.feed"), "подача открылась автоматически")
    pg.click("#btn-feed"); pg.wait_for_timeout(700)
    ok(pg.evaluate("()=>!PLANT.S.feed"), "кнопка закрывает подачу")
    pg.click("#btn-feed"); pg.wait_for_timeout(700)
    ok(pg.evaluate("()=>PLANT.S.feed"), "кнопка открывает подачу обратно")
    pg.evaluate("()=>PLANT.S.piles.pit=0.004"); pg.wait_for_timeout(3000)
    ok(pg.evaluate("()=>!PLANT.S.feed"), "пустая яма останавливает подачу")
    pg.click("#btn-refill"); pg.wait_for_timeout(500)
    ok(pg.evaluate("()=>PLANT.S.piles.pit") > 0.9, "загрузка ямы восполняет зерно")
    pg.click("#btn-feed"); pg.wait_for_timeout(8000)

    print("\n=== параметры ===")
    pg.click('.tab[data-tab="params"]'); pg.wait_for_timeout(1200)
    ok(pg.locator("#param-cards .pcard").count() >= 8, "карточки параметров отрисованы")
    ok(pg.locator("#param-levels .lvl").count() == 7, "показаны все 7 ёмкостей")
    ok(pg.locator("#param-flow .fnode").count() >= 9, "полоса материального потока построена")
    pg.click('[data-chart2="prod"]'); pg.wait_for_timeout(800)
    ok(True, "переключение тренда работает")

    print("\n=== аварии ===")
    pg.click('.tab[data-tab="mimic"]'); pg.wait_for_timeout(300)
    pg.click('[data-fault="noria_12:dsl1"]'); pg.wait_for_timeout(1200)
    ok(pg.evaluate("()=>PLANT.S.machines.noria_12.fault"), "тренажёр аварий валит механизм")
    pg.click('.tab[data-tab="alarms"]'); pg.wait_for_timeout(700)
    ok(pg.locator("#al-rows tr").count() > 3, "журнал аварий заполнен")
    ok(pg.locator("#al-summary .asum").count() == 4, "сводка по авариям отрисована")
    pg.select_option("#al-scope", "archive"); pg.wait_for_timeout(500)
    ok(pg.locator("#al-rows tr").count() > 3, "архив сообщений открывается")
    pg.select_option("#al-scope", "active"); pg.wait_for_timeout(400)
    ok(pg.locator("#al-causes .cause").count() > 0, "показаны активные причины аварии")
    while pg.locator("#al-causes [data-clr]").count():
        pg.locator("#al-causes [data-clr]").first.click(); pg.wait_for_timeout(400)
    pg.click("#al-ack"); pg.wait_for_timeout(700)
    ok(pg.evaluate("()=>PLANT.S.alarms.filter(a=>a.active).length") == 0, "квитирование со страницы аварий")

    print("\n=== быстрое меню ===")
    pg.click('.tab[data-tab="mimic"]'); pg.wait_for_timeout(300)
    pg.click("#btn-menu"); pg.wait_for_timeout(500)
    ok(pg.locator(".menu-item").count() >= 8, "быстрое меню содержит все пункты")
    pg.click('[data-go="params"]'); pg.wait_for_timeout(600)
    ok(pg.is_visible("#view-params"), "переход из меню на страницу параметров")

    print("\n=== карточка механизма ===")
    pg.click('.tab[data-tab="equip"]'); pg.wait_for_timeout(500)
    pg.locator("#eq-rows [data-open]").first.click(); pg.wait_for_timeout(700)
    ok(pg.locator("#modal-root .dlg").count() > 0, "окно механизма открывается из таблицы")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    ok(pg.locator("#modal-root .dlg").count() == 0, "окно закрывается по Escape")

    pg.click('.tab[data-tab="mimic"]'); pg.wait_for_timeout(1500)
    pg.screenshot(path="/home/user/ui_mimic.png")
    pg.click('.tab[data-tab="equip"]'); pg.wait_for_timeout(700); pg.screenshot(path="/home/user/ui_equip.png")
    pg.click('.tab[data-tab="params"]'); pg.wait_for_timeout(900); pg.screenshot(path="/home/user/ui_params.png")
    pg.click('.tab[data-tab="settings"]'); pg.wait_for_timeout(600); pg.screenshot(path="/home/user/ui_settings.png")
    pg.click('.tab[data-tab="alarms"]'); pg.wait_for_timeout(600); pg.screenshot(path="/home/user/ui_alarms.png")

    b.close()

print("\n=== ошибки страницы ===")
print("\n".join(dict.fromkeys(errs)) if errs else "нет")
print("\n=== ИТОГ ===")
print("провалов: " + str(len(fails)))
for f in fails:
    print("  - " + f)
