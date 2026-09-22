"""Проверка, что подвижные детали каждого типа механизма действительно анимируются."""
import io
from PIL import Image
from playwright.sync_api import sync_playwright

KINDS = {
    "шнек": "conv_22_1", "вентилятор": "as_1", "шлюз": "sluice_1",
    "триер": "bt_14_1", "МУЗ": "muz_6", "ТОР": "tor_10", "пневмостол": "sp_18",
    "остеобр.": "op_5", "нория": "noria_4", "циклон": "cyc_1", "завал.яма": "intake",
}

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1760, "height": 1000})
    pg.goto("file:///home/user/lpzs_emulation/frontend/index.html")
    pg.wait_for_timeout(3200)
    pg.evaluate("()=>PLANT.setEstop(false)")
    pg.click("#btn-start")
    pg.wait_for_timeout(24000)

    # toWorld принимает координаты окна, поэтому обратное преобразование даёт их же
    conv = pg.evaluate("""()=>{const a=RENDER.toWorld(0,0), b=RENDER.toWorld(100,100);
        return {sx:100/(b[0]-a[0]), ax:a[0], ay:a[1]};}""")

    def clip(nid):
        n = pg.evaluate("(id)=>{const n=PLANT.S.ND[id];return [n.x,n.y,n.w,n.h];}", nid)
        s = conv["sx"]
        return {"x": (n[0] - conv["ax"]) * s, "y": (n[1] - conv["ay"]) * s,
                "width": max(10, n[2] * s), "height": max(10, n[3] * s)}

    def motion(nid, pause):
        c = clip(nid)
        a = Image.open(io.BytesIO(pg.screenshot(clip=c))).convert("L")
        pg.wait_for_timeout(pause)
        d = Image.open(io.BytesIO(pg.screenshot(clip=c))).convert("L")
        pa, pb = a.load(), d.load()
        w, h = a.size
        diff = tot = 0
        for yy in range(0, h, 2):
            for xx in range(0, w, 2):
                tot += 1
                if abs(pa[xx, yy] - pb[xx, yy]) > 8:
                    diff += 1
        return 100.0 * diff / max(1, tot)

    print("=== в работе ===")
    res_run = {}
    for name, nid in KINDS.items():
        res_run[name] = motion(nid, 240)
        print(f"  {name:<11} {nid:<11} {res_run[name]:5.1f}%  {'движется' if res_run[name] > 0.8 else 'СТОИТ'}")

    print("\n=== после останова линии (детали должны замереть) ===")
    pg.click("#btn-stop")
    pg.wait_for_timeout(26000)
    for name, nid in KINDS.items():
        v = motion(nid, 240)
        print(f"  {name:<11} {nid:<11} {v:5.1f}%  {'ещё крутится' if v > 0.8 else 'остановлено'}")

    b.close()
