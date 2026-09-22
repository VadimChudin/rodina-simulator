"""
ЛПЗС «Родина» — HTTP + WebSocket API эмулятора.

Запуск из корня проекта:
    python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

Статика лежит в ../frontend. Состояние линии крутится в plant.py
в отдельном потоке; браузер либо дергает REST, либо сидит на /ws.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .plant import plant

ROOT = Path(__file__).resolve().parent.parent
FRONT = ROOT / "frontend"

app = FastAPI(title="ЛПЗС Родина — эмулятор", version="1.0.0")


class ModeOpts(BaseModel):
    through_triers: bool = True
    through_pneumo: bool = True
    enable_op: bool = True
    enable_agitator: bool = False
    trier_1: bool = True
    trier_2: bool = True


class MachinePatch(BaseModel):
    delay_start: float | None = None
    delay_stop: float | None = None
    hours_to: float | None = None
    manual: bool | None = None
    ignore_next: bool | None = None
    dks: bool | None = None
    dsl1: bool | None = None
    dsl2: bool | None = None
    dp: bool | None = None
    reset_to: bool | None = None


class DiverterCmd(BaseModel):
    pos: str


class SettingsPatch(BaseModel):
    values: dict[str, float] = Field(default_factory=dict)


class UserPatch(BaseModel):
    login: str = "operator"
    role: str = "Оператор"


class BunkerFill(BaseModel):
    value: float


class FaultCmd(BaseModel):
    machine_id: str
    sensor: str  # dks | dsl1 | dsl2 | dp | clear
    on: bool = True


class EstopCmd(BaseModel):
    pressed: bool = True
    source: str = "Нажат аварийный стоп на шкафу"


@app.get("/api/state")
def api_state():
    return plant.snapshot()


@app.post("/api/estop")
def api_estop(cmd: EstopCmd):
    plant.set_estop(cmd.pressed, cmd.source)
    return {"ok": True, "state": plant.snapshot()}


@app.post("/api/reset_alarms")
def api_reset():
    return {**plant.reset_alarms(), "state": plant.snapshot()}


@app.post("/api/mode/start")
def api_mode_start(opts: ModeOpts):
    r = plant.start_cleaning_mode(opts.model_dump())
    r["state"] = plant.snapshot()
    return r


@app.post("/api/mode/stop")
def api_mode_stop():
    r = plant.stop_cleaning_mode()
    r["state"] = plant.snapshot()
    return r


@app.post("/api/machine/{mid}/start")
def api_m_start(mid: str):
    r = plant.start_machine(mid)
    r["state"] = plant.snapshot()
    return r


@app.post("/api/machine/{mid}/stop")
def api_m_stop(mid: str):
    r = plant.stop_machine(mid)
    r["state"] = plant.snapshot()
    return r


@app.post("/api/machine/{mid}")
def api_m_patch(mid: str, patch: MachinePatch):
    r = plant.update_machine(mid, patch.model_dump(exclude_none=True))
    r["state"] = plant.snapshot()
    return r


@app.post("/api/diverter/{did}")
def api_div(did: str, cmd: DiverterCmd):
    r = plant.switch_diverter(did, cmd.pos)
    r["state"] = plant.snapshot()
    return r


@app.post("/api/settings")
def api_settings(p: SettingsPatch):
    r = plant.set_settings(p.values)
    r["state"] = plant.snapshot()
    return r


@app.post("/api/user")
def api_user(p: UserPatch):
    r = plant.set_user(p.login, p.role)
    r["state"] = plant.snapshot()
    return r


@app.post("/api/bunker/{name}")
def api_bunker(name: str, body: BunkerFill):
    r = plant.fill_bunker(name, body.value)
    r["state"] = plant.snapshot()
    return r


@app.post("/api/fault")
def api_fault(cmd: FaultCmd):
    if cmd.sensor == "clear":
        r = plant.update_machine(cmd.machine_id, {
            "dks": False, "dsl1": False, "dsl2": False, "dp": False,
        })
        m = plant.machines.get(cmd.machine_id)
        if m:
            m.fault = False
            m.fault_text = ""
        r["state"] = plant.snapshot()
        return r
    r = plant.update_machine(cmd.machine_id, {cmd.sensor: cmd.on})
    r["state"] = plant.snapshot()
    return r


@app.websocket("/ws")
async def ws_feed(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await ws.send_text(json.dumps(plant.snapshot(), ensure_ascii=False))
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        return


@app.get("/api/health")
def health():
    """Проба для балансировщика и docker healthcheck."""
    return {
        "status": "ok",
        "mode_running": plant.mode_running,
        "estop": plant.estop,
        "machines": len(plant.machines),
    }


@app.get("/")
def index():
    return FileResponse(FRONT / "index.html")


if FRONT.exists():
    app.mount("/static", StaticFiles(directory=str(FRONT)), name="static")
    # css/js relative paths from index.html
    app.mount("/css", StaticFiles(directory=str(FRONT / "css")), name="css")
    app.mount("/js", StaticFiles(directory=str(FRONT / "js")), name="js")
    app.mount("/assets", StaticFiles(directory=str(FRONT / "assets")), name="assets")
