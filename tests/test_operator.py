from playwright.sync_api import sync_playwright
import json
from pathlib import Path
out=Path(__file__).resolve().parent / 'output';out.mkdir(exist_ok=True)
results=[]; errors=[]
def check(v,name):
 results.append({'test':name,'passed':bool(v)});print('PASS' if v else 'FAIL',name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':900})
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto((Path(__file__).resolve().parents[1] / 'frontend/index.html').as_uri());page.wait_for_timeout(1800)
 check(page.locator('#plant-canvas').bounding_box()['width']>1100,'Wide simulation canvas')
 check(not page.locator('.bottom-panels').is_visible(),'Secondary panels hidden by default')
 check(page.locator('#btn-estop').is_visible() and page.locator('#btn-stop').is_visible(),'Both stop controls visible')
 page.screenshot(path=str(out/'main.png'))
 page.click('#btn-menu');check(page.locator('#dlg-title').inner_text()=='Меню управления','Main blue menu')
 page.screenshot(path=str(out/'menu.png'));page.keyboard.press('Escape')
 page.click('#rail-clean');check(page.locator('[data-o]').count()==5,'Cleaning route toggles');page.screenshot(path=str(out/'clean.png'));page.keyboard.press('Escape')
 ids=page.locator('[data-machine]').evaluate_all('(els)=>els.map(e=>e.dataset.machine)')
 for id in ids:
  page.locator(f'[data-machine="{id}"]').click();check(page.locator('[role=dialog]').is_visible(),'Dialog '+id);page.keyboard.press('Escape')
 page.fill('#rail-search','22.1');check(page.locator('[data-machine]').count()==1,'Machine search');page.locator('[data-machine]').click();page.screenshot(path=str(out/'machine.png'));page.keyboard.press('Escape');page.fill('#rail-search','')
 for tab in ['params','equip','settings','alarms','diagnostics','mimic']:
  page.click(f'[data-tab="{tab}"]');page.wait_for_timeout(300);check(page.locator('#view-'+tab).is_visible(),'Tab '+tab)
 for width,height in [(400,800),(768,1024),(1366,768),(1920,1080)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(200)
  check(page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'No page overflow '+str(width))
  page.click('#rail-settings');check(page.locator('#modal-root [data-s]').count()==6,'Six DVU fields '+str(width))
  check(page.locator('.dlg').evaluate('(el)=>el.scrollWidth<=el.clientWidth'),'Dialog fits '+str(width))
  page.screenshot(path=str(out/f'settings-{width}.png'));page.keyboard.press('Escape')
 page.set_viewport_size({'width':1440,'height':900})
 for triers in [True,False]:
  for pneumo in [True,False]:
   page.reload();page.wait_for_timeout(300)
   r=page.evaluate('''o=>{PLANT.setEstop(false);PLANT.ackAlarms();PLANT.setOptions(o);let r=PLANT.startMode(); for(let i=0;i<6000 && !PLANT.S.mode_run;i++) PLANT.tick(.05);return {r, running:PLANT.S.mode_run,chain:PLANT.chain(), faults:Object.values(PLANT.S.machines).filter(m=>m.fault).map(m=>m.id)};}''',{'triers':triers,'trier1':triers,'trier2':triers,'pneumo':pneumo,'op':True})
   check(r['r']['ok'] and r['running'] and not r['faults'],f'Route BT={triers} SP={pneumo}')
   print(json.dumps(r,ensure_ascii=False))
   page.evaluate('PLANT.setEstop(true)');check(page.evaluate('Object.values(PLANT.S.machines).every(m=>!m.running && !m.starting)'), 'Emergency stop all drives')
 check(not errors,'No JavaScript errors');print(errors)
 b.close()
(out/'results.json').write_text(json.dumps({'results':results,'errors':errors},ensure_ascii=False,indent=2))
