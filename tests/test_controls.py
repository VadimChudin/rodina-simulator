from playwright.sync_api import sync_playwright
from pathlib import Path
import json
out=Path(__file__).resolve().parent / 'output'; results=[]
def ck(x,n):
 results.append({'test':n,'passed':bool(x)});print('PASS' if x else 'FAIL',n)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);pg=b.new_page(viewport={'width':1440,'height':900})
 pg.goto((Path(__file__).resolve().parents[1] / 'frontend/index.html').as_uri());pg.wait_for_timeout(500)
 pg.click('#rail-settings');pg.fill('[data-s="dvu_bo61"]','17.5');pg.locator('[data-s="dvu_bo61"]').press('Tab');pg.keyboard.press('Escape');pg.reload();pg.wait_for_timeout(300)
 ck(pg.evaluate('PLANT.S.settings.dvu_bo61')==17.5,'DVU saved after reload')
 pg.click('#rail-clean');before=pg.evaluate('PLANT.S.opt.pneumo');pg.click('[data-o="pneumo"]');ck(pg.evaluate('PLANT.S.opt.pneumo')!=before,'Route toggle changes model');pg.keyboard.press('Escape')
 pg.click('#btn-estop');pg.click('#btn-ack');pg.click('#rail-clean');pg.click('#mode-go');ck(pg.evaluate('PLANT.S.mode_starting'),'Start via blue menu')
 pg.evaluate('()=>{for(let i=0;i<6000 && !PLANT.S.mode_run;i++) PLANT.tick(.05)}');pg.wait_for_timeout(300)
 ck(pg.evaluate('PLANT.S.mode_run && PLANT.S.feed'),'Sequential startup opens feed')
 pg.click('#rail-clean');before=pg.evaluate('PLANT.S.opt.triers');pg.click('[data-o="triers"]');ck(pg.evaluate('PLANT.S.opt.triers')==before,'Route locked during operation');pg.keyboard.press('Escape')
 a=pg.locator('#plant-canvas').screenshot();pg.wait_for_timeout(700);c=pg.locator('#plant-canvas').screenshot();ck(a!=c,'Rendered simulation changes over time')
 pg.screenshot(path=str(out/'running.png'))
 pg.click('#btn-stop');ck(pg.evaluate('!PLANT.S.feed && PLANT.S.mode_stopping'),'Normal stop closes feed')
 pg.evaluate('()=>{for(let i=0;i<20000 && PLANT.S.mode_stopping;i++) PLANT.tick(.05)}');ck(pg.evaluate('!PLANT.S.mode_stopping && PLANT.chain().every(id=>!PLANT.S.machines[id].running)'),'Drain and normal stop complete')
 pg.click('#rail-alarms');ck(pg.locator('.alarm-table').is_visible(),'Blue alarm journal');pg.click('#arch');ck(pg.locator('#journal').is_visible(),'Alarm archive navigation');pg.keyboard.press('Escape')
 pg.evaluate('localStorage.clear()');pg.reload();pg.wait_for_timeout(500);pg.screenshot(path=str(out/'main.png'))
 b.close()
(out/'controls.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
