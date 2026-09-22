"""
Движок линии ЛПЗС «Родина».

Тик 100 мс. Каждая машина — отдельный объект со своими задержками,
датчиками, моточасами и блокировками. Зерно движется по рёбрам графа
только если узел запущен и переключатель потока стоит в нужную сторону.

Порядок ПУСК (очистка): с хвоста линии к голове, с паузами delay_start.
Порядок СТОП: с головы к хвосту, с паузами delay_stop.
Так продукт не заваливает остановленный узел.
"""
from __future__ import annotations

import threading
import time
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Callable, Optional


TICK_S = 0.1
GRAIN_SPEED = 55.0  # единиц пути в секунду
BUNKER_CAP = 100.0
FEED_RATE = 4.2  # % бункера в секунду при полном потоке


def now_str() -> str:
    return time.strftime("%H:%M:%S")


def today_str() -> str:
    return time.strftime("%d/%m/%y")


@dataclass
class Alarm:
    id: str
    ts: str
    message: str
    active: bool = True
    archived: bool = False


@dataclass
class GrainParticle:
    id: str
    edge: str
    t: float = 0.0  # 0..1 вдоль ребра
    alive: bool = True


@dataclass
class Machine:
    id: str
    name: str
    kind: str
    delay_start: float = 3.0
    delay_stop: float = 2.0
    hours_to: float = 200.0
    hours_current: float = 0.0
    hours_total: float = 0.0
    running: bool = False
    starting: bool = False
    stopping: bool = False
    start_in: float = 0.0
    stop_in: float = 0.0
    manual: bool = False
    ignore_next: bool = False
    dks: bool = False  # контроль скорости / схода ленты
    dsl1: bool = False
    dsl2: bool = False
    dp: bool = False  # подпор
    next_ids: list[str] = field(default_factory=list)
    fault: bool = False
    fault_text: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "delay_start": self.delay_start,
            "delay_stop": self.delay_stop,
            "hours_to": round(self.hours_to, 2),
            "hours_current": round(self.hours_current, 3),
            "hours_total": round(self.hours_total, 3),
            "running": self.running,
            "starting": self.starting,
            "stopping": self.stopping,
            "start_in": round(self.start_in, 1),
            "stop_in": round(self.stop_in, 1),
            "manual": self.manual,
            "ignore_next": self.ignore_next,
            "dks": self.dks,
            "dsl1": self.dsl1,
            "dsl2": self.dsl2,
            "dp": self.dp,
            "next_ids": list(self.next_ids),
            "fault": self.fault,
            "fault_text": self.fault_text,
            "extra": deepcopy(self.extra),
            "status": self.status_label(),
        }

    def status_label(self) -> str:
        if self.fault:
            return "авария"
        if self.starting:
            return "запуск"
        if self.stopping:
            return "останов"
        if self.running:
            return "работа"
        return "стоп"


class Plant:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.estop = True
        self.estop_source = "Нажат аварийный стоп на шкафу"
        self.mode_running = False
        self.mode_starting = False
        self.mode_stopping = False
        self.route = "bt_sp"
        self.through_triers = True
        self.through_pneumo = True
        self.enable_op = True
        self.enable_agitator = False
        self.feed_on = False
        self.clock = time.time()
        self.alarms: list[Alarm] = []
        self.archive: list[Alarm] = []
        self.particles: list[GrainParticle] = []
        self._spawn_acc = 0.0
        self.user = {"login": "operator", "role": "Оператор", "logged_in": True}
        self.settings = {
            "dvu_bunker_a": 8.0,
            "dvu_bunker_b": 8.0,
            "dvu_bunker_v": 8.0,
            "dvu_a": 5.0,
            "dvu_waste": 6.0,
            "dvu_waste_2": 6.0,
        }
        self.bunkers = {
            "A": {"fill": 92.0, "full": True, "mode": "остановлен"},
            "B": {"fill": 88.0, "full": True, "mode": "остановлен"},
            "V": {"fill": 18.0, "full": False, "mode": "остановлен"},
        }
        self.diverters = {
            "div_10_1": {
                "name": "Переключатель потока 10.1",
                "pos": "trier",
                "labels": {"trier": "На триер", "noria_12": "На норию 12"},
                "switch_time": 4.0,
                "busy": False,
                "busy_left": 0.0,
                "manual": False,
            },
            "div_10_2": {
                "name": "Переключатель потока 10.2",
                "pos": "pneumo",
                "labels": {"pneumo": "На пневмостол", "noria_17": "На норию 17"},
                "switch_time": 4.0,
                "busy": False,
                "busy_left": 0.0,
                "manual": False,
            },
        }
        self.machines: dict[str, Machine] = {}
        self._build_machines()
        self._raise("Нажат аварийный стоп на шкафу")
        self._raise("Нажат аварийный стоп на шкафу")
        self._raise("Нажат аварийный стоп на шкафу")

        self._listeners: list[Callable[[dict], None]] = []
        self._stop_evt = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    # ------------------------------------------------------------------ setup
    def _m(self, **kw) -> Machine:
        m = Machine(**kw)
        self.machines[m.id] = m
        return m

    def _build_machines(self) -> None:
        # Приём и транспортировка
        self._m(id="conv_2", name="Конвейер завальной ямы (2)", kind="screw",
                next_ids=["noria_4"], delay_start=4, delay_stop=3)
        self._m(id="noria_4", name="Нория 4", kind="noria",
                next_ids=["op_5"], delay_start=5, delay_stop=4)
        self._m(id="op_5", name="Остеобrusher", kind="op",
                next_ids=["muz_6"], delay_start=3, delay_stop=3)
        self.machines["op_5"].name = "Остеобрушиватель"
        self._m(id="muz_6", name="МУЗ-8М битер", kind="beater",
                next_ids=["noria_8"], delay_start=3, delay_stop=2)
        self._m(id="noria_8", name="Нория 8", kind="noria",
                next_ids=["tor_10"], delay_start=5, delay_stop=4)
        self._m(id="tor_10", name="ТОР-18 битер", kind="beater",
                next_ids=["noria_12"], delay_start=3, delay_stop=2)
        self._m(id="noria_12", name="Нория 12", kind="noria",
                next_ids=["bt_14_1", "noria_15"], delay_start=5, delay_stop=4)
        self._m(id="bt_14_1", name="Триерный блок 1.1", kind="trier",
                next_ids=["bt_14_2"], delay_start=4, delay_stop=3,
                extra={"peer": "bt_14_2"})
        self._m(id="bt_14_2", name="Триерный блок 2.1", kind="trier",
                next_ids=["noria_15"], delay_start=4, delay_stop=3,
                extra={"peer": "bt_14_1"})
        self._m(id="noria_15", name="Нория 15", kind="noria",
                next_ids=["sp_18", "noria_20"], delay_start=5, delay_stop=4)
        self._m(id="sp_18", name="Стол пневмосортировальный", kind="pneumo",
                next_ids=["noria_20"], delay_start=4, delay_stop=3)
        self._m(id="fan_sp", name="Вентилятор пневмостола", kind="fan",
                next_ids=[], delay_start=2, delay_stop=2)
        self._m(id="noria_20", name="Нория 20", kind="noria",
                next_ids=["bunker_v"], delay_start=5, delay_stop=4)
        self._m(id="noria_17", name="Нория 17", kind="noria",
                next_ids=["bunker_v"], delay_start=5, delay_stop=4)
        self._m(id="agitator", name="Ворошитель", kind="agitator",
                next_ids=[], delay_start=2, delay_stop=2)

        # Шнеки отходов / пересыпки
        for i in range(1, 5):
            self._m(id=f"conv_22_{i}", name=f"Конвейер шнековый 22.{i}",
                    kind="screw", next_ids=[], delay_start=3, delay_stop=2)

        # Аспирация
        self._m(id="as_1", name="Комплект аспирации АС-1", kind="aspir",
                next_ids=[], delay_start=4, delay_stop=3)
        self._m(id="as_2", name="Комплект аспирации АС-2", kind="aspir",
                next_ids=[], delay_start=4, delay_stop=3)
        self._m(id="as_3", name="Комплект аспирации АС-3", kind="aspir",
                next_ids=[], delay_start=4, delay_stop=3)
        self._m(id="sluice_as3", name="Шлюз аспирации АС-3", kind="sluice",
                next_ids=[], delay_start=2, delay_stop=2)
        self._m(id="sluice_as1", name="Шлюз аспирации АС-1", kind="sluice",
                next_ids=[], delay_start=2, delay_stop=2)
        self._m(id="sluice_as2", name="Шлюз аспирации АС-2", kind="sluice",
                next_ids=[], delay_start=2, delay_stop=2)

        # Циклоны / шнек под ними
        for n in (1, 2, 3):
            self._m(id=f"cyc_{n}", name=f"Циклон {n}", kind="cyclone",
                    next_ids=["conv_waste"], delay_start=1, delay_stop=1)
        self._m(id="conv_waste", name="Шнек отходов циклонов", kind="screw",
                next_ids=[], delay_start=3, delay_stop=2)

        self._m(id="bunker_v", name="Бункер В", kind="bunker",
                next_ids=[], delay_start=0, delay_stop=0)

        # Датчики по умолчанию «в норме» (выключатели «Выкл. ДКС» = выкл)
        for m in self.machines.values():
            m.dks = False
            m.dsl1 = False
            m.dsl2 = False
            m.dp = False

    # ---------------------------------------------------------------- alarms
    def _raise(self, message: str) -> None:
        a = Alarm(id=str(uuid.uuid4())[:8], ts=now_str(), message=message)
        self.alarms.insert(0, a)
        self.archive.insert(0, deepcopy(a))
        self.archive = self.archive[:400]

    def reset_alarms(self) -> dict:
        with self.lock:
            if self.estop:
                return {"ok": False, "error": "Сначала снимите аварийный стоп"}
            for a in self.alarms:
                a.active = False
            self.alarms = [a for a in self.alarms if a.active]
            for m in self.machines.values():
                if m.fault and not (m.dks or m.dsl1 or m.dsl2 or m.dp):
                    m.fault = False
                    m.fault_text = ""
            return {"ok": True}

    def set_estop(self, pressed: bool, source: str = "Нажат аварийный стоп на шкафу") -> None:
        with self.lock:
            self.estop = pressed
            if pressed:
                self.estop_source = source
                self.mode_running = False
                self.mode_starting = False
                self.mode_stopping = False
                self.feed_on = False
                for m in self.machines.values():
                    m.running = False
                    m.starting = False
                    m.stopping = False
                    m.start_in = 0
                    m.stop_in = 0
                self.particles.clear()
                self._raise(source)
                for k in self.bunkers:
                    self.bunkers[k]["mode"] = "остановлен"
            else:
                self.estop_source = ""
                self._raise("Аварийный стоп снят")

    # ----------------------------------------------------------- commands
    def start_machine(self, mid: str, from_mode: bool = False) -> dict:
        with self.lock:
            if self.estop:
                return {"ok": False, "error": "Аварийный стоп. Пуск запрещён"}
            m = self.machines.get(mid)
            if not m:
                return {"ok": False, "error": "Нет такого механизма"}
            if m.fault:
                return {"ok": False, "error": f"Авария: {m.fault_text or m.name}"}
            if m.dks:
                return {"ok": False, "error": f"{m.name}: сработал ДКС"}
            if m.dsl1 or m.dsl2:
                return {"ok": False, "error": f"{m.name}: сход ленты (ДСЛ)"}
            if m.dp:
                return {"ok": False, "error": f"{m.name}: подпор (ДП)"}
            if m.running or m.starting:
                return {"ok": True, "info": "уже в работе"}
            if not from_mode and not m.manual and not m.ignore_next:
                blocked = self._next_not_ready(m)
                if blocked:
                    return {
                        "ok": False,
                        "error": f"Нельзя пустить {m.name}: следующий механизм не в работе ({blocked})",
                    }
            m.stopping = False
            m.stop_in = 0
            m.starting = True
            m.start_in = max(0.2, m.delay_start)
            return {"ok": True}

    def stop_machine(self, mid: str) -> dict:
        with self.lock:
            m = self.machines.get(mid)
            if not m:
                return {"ok": False, "error": "Нет такого механизма"}
            if not m.running and not m.starting:
                m.starting = False
                return {"ok": True}
            m.starting = False
            m.start_in = 0
            m.stopping = True
            m.stop_in = max(0.2, m.delay_stop)
            return {"ok": True}

    def _next_not_ready(self, m: Machine) -> Optional[str]:
        for nid in m.next_ids:
            nxt = self.machines.get(nid)
            if nxt and not nxt.running and nxt.kind not in ("bunker",):
                # для развилок достаточно одного живого выхода
                others_ok = any(
                    (self.machines.get(x) and self.machines[x].running)
                    or x.startswith("bunker")
                    for x in m.next_ids
                    if x != nid
                )
                if others_ok:
                    continue
                return nxt.name
        return None

    def update_machine(self, mid: str, patch: dict) -> dict:
        with self.lock:
            m = self.machines.get(mid)
            if not m:
                return {"ok": False, "error": "Нет такого механизма"}
            for key in ("delay_start", "delay_stop", "hours_to"):
                if key in patch and patch[key] is not None:
                    try:
                        setattr(m, key, max(0.0, float(patch[key])))
                    except (TypeError, ValueError):
                        pass
            for key in ("manual", "ignore_next", "dks", "dsl1", "dsl2", "dp"):
                if key in patch and patch[key] is not None:
                    setattr(m, key, bool(patch[key]))
                    if key in ("dks", "dsl1", "dsl2", "dp") and getattr(m, key):
                        m.fault = True
                        names = {
                            "dks": "ДКС",
                            "dsl1": "ДСЛ 1",
                            "dsl2": "ДСЛ 2",
                            "dp": "ДП",
                        }
                        m.fault_text = f"{m.name}: сработал {names[key]}"
                        self._raise(m.fault_text)
                        if m.running or m.starting:
                            m.running = False
                            m.starting = False
                            m.stopping = False
                            if self.mode_running:
                                self._cascade_fault(m.id)
            if patch.get("reset_to"):
                m.hours_current = 0.0
            return {"ok": True, "machine": m.to_dict()}

    def _cascade_fault(self, failed_id: str) -> None:
        self.feed_on = False
        self.mode_running = False
        self.mode_starting = False
        # останавливаем всё, что отдаёт продукт в аварийный узел
        self._raise(f"Аварийный останов линии из-за {self.machines[failed_id].name}")
        for m in self.machines.values():
            if m.running or m.starting:
                m.starting = False
                m.running = False
                m.stopping = False

    def switch_diverter(self, did: str, pos: str) -> dict:
        with self.lock:
            d = self.diverters.get(did)
            if not d:
                return {"ok": False, "error": "Нет переключателя"}
            if pos not in d["labels"]:
                return {"ok": False, "error": "Нет такой позиции"}
            if d["busy"]:
                return {"ok": False, "error": "Идёт переключение"}
            if pos == d["pos"]:
                return {"ok": True, "info": "уже в этом положении"}
            d["busy"] = True
            d["busy_left"] = float(d["switch_time"])
            d["extra_target"] = pos
            return {"ok": True}

    def start_cleaning_mode(self, opts: dict) -> dict:
        with self.lock:
            if self.estop:
                return {"ok": False, "error": "Аварийный стоп. Пуск режима запрещён"}
            if any(a.active for a in self.alarms):
                return {"ok": False, "error": "Есть неквитированные аварии. Нажмите «Сброс аварии»"}
            self.through_triers = bool(opts.get("through_triers", True))
            self.through_pneumo = bool(opts.get("through_pneumo", True))
            self.enable_op = bool(opts.get("enable_op", True))
            self.enable_agitator = bool(opts.get("enable_agitator", False))
            t1 = bool(opts.get("trier_1", self.through_triers))
            t2 = bool(opts.get("trier_2", self.through_triers))
            if self.through_triers and not (t1 or t2):
                t1 = t2 = True

            # маршрут
            if self.through_triers and self.through_pneumo:
                self.route = "bt_sp"
            elif self.through_triers:
                self.route = "bt_only"
            elif self.through_pneumo:
                self.route = "sp_only"
            else:
                self.route = "bypass"

            self.diverters["div_10_1"]["pos"] = "trier" if self.through_triers else "noria_12"
            self.diverters["div_10_2"]["pos"] = "pneumo" if self.through_pneumo else "noria_17"

            chain = self._route_chain()
            # пуск с хвоста
            self.mode_starting = True
            self.mode_stopping = False
            self.mode_running = False
            self._start_seq = list(reversed(chain))
            self._start_idx = 0
            self._start_wait = 0.3
            for k in self.bunkers:
                self.bunkers[k]["mode"] = "запуск"
            self._raise("Запущен режим очистки")
            return {"ok": True, "route": self.route, "chain": chain}

    def stop_cleaning_mode(self) -> dict:
        with self.lock:
            self.feed_on = False
            self.mode_starting = False
            self.mode_stopping = True
            self.mode_running = False
            chain = self._route_chain()
            self._stop_seq = list(chain)
            self._stop_idx = 0
            self._stop_wait = 0.2
            for k in self.bunkers:
                self.bunkers[k]["mode"] = "останов"
            self._raise("Останов режима очистки")
            return {"ok": True}

    def _route_chain(self) -> list[str]:
        # обязательная голова
        head = ["as_1", "as_2", "as_3", "sluice_as1", "sluice_as2", "sluice_as3",
                "conv_waste", "cyc_1", "cyc_2", "cyc_3"]
        body = ["noria_20"]
        if self.through_pneumo:
            body = ["fan_sp", "sp_18"] + body
        body = ["noria_15"] + body
        if self.through_triers:
            body = ["bt_14_1", "bt_14_2"] + body
        body = ["noria_12", "tor_10", "noria_8"] + body
        if self.enable_op:
            body = ["op_5"] + body
        body = ["muz_6"] + body
        body = ["noria_4", "conv_2"] + body
        if self.enable_agitator:
            body = ["agitator"] + body
        # шнеки отходов крутятся вместе с режимом
        body += ["conv_22_1", "conv_22_2", "conv_22_3", "conv_22_4"]
        # уникальные, хвост (bunker) не крутится как мотор
        seen = []
        for x in head + body:
            if x not in seen and x in self.machines:
                seen.append(x)
        return seen

    # --------------------------------------------------------------- tick
    def _loop(self) -> None:
        while not self._stop_evt.is_set():
            t0 = time.time()
            try:
                self.tick(TICK_S)
            except Exception:
                pass
            dt = time.time() - t0
            time.sleep(max(0.01, TICK_S - dt))

    def tick(self, dt: float) -> None:
        with self.lock:
            self.clock = time.time()
            if self.estop:
                return
            self._tick_diverters(dt)
            self._tick_mode_sequences(dt)
            self._tick_machines(dt)
            self._tick_grain(dt)
            self._tick_bunkers(dt)

    def _tick_diverters(self, dt: float) -> None:
        for d in self.diverters.values():
            if d["busy"]:
                d["busy_left"] -= dt
                if d["busy_left"] <= 0:
                    d["busy"] = False
                    d["pos"] = d.get("extra_target", d["pos"])
                    d["busy_left"] = 0

    def _tick_mode_sequences(self, dt: float) -> None:
        if self.mode_starting and hasattr(self, "_start_seq"):
            self._start_wait -= dt
            if self._start_wait <= 0 and self._start_idx < len(self._start_seq):
                mid = self._start_seq[self._start_idx]
                self.start_machine(mid, from_mode=True)
                m = self.machines[mid]
                self._start_wait = max(0.4, m.delay_start * 0.35)
                self._start_idx += 1
            if self._start_idx >= len(self._start_seq):
                # ждём пока все стартующие докрутятся
                if not any(self.machines[i].starting for i in self._start_seq if i in self.machines):
                    self.mode_starting = False
                    self.mode_running = True
                    self.feed_on = True
                    for k in self.bunkers:
                        if k == "V":
                            self.bunkers[k]["mode"] = "приём"
                        else:
                            self.bunkers[k]["mode"] = "остановлен"

        if self.mode_stopping and hasattr(self, "_stop_seq"):
            self._stop_wait -= dt
            if self._stop_wait <= 0 and self._stop_idx < len(self._stop_seq):
                mid = self._stop_seq[self._stop_idx]
                self.stop_machine(mid)
                m = self.machines[mid]
                self._stop_wait = max(0.3, m.delay_stop * 0.35)
                self._stop_idx += 1
            if self._stop_idx >= len(self._stop_seq):
                if not any(self.machines[i].stopping or self.machines[i].running
                           for i in self._stop_seq if i in self.machines):
                    self.mode_stopping = False
                    self.mode_running = False
                    self.feed_on = False
                    for k in self.bunkers:
                        self.bunkers[k]["mode"] = "остановлен"

    def _tick_machines(self, dt: float) -> None:
        hours = dt / 3600.0
        for m in self.machines.values():
            if m.starting:
                m.start_in -= dt
                if m.start_in <= 0:
                    m.starting = False
                    m.running = True
                    m.start_in = 0
            if m.stopping:
                m.stop_in -= dt
                if m.stop_in <= 0:
                    m.stopping = False
                    m.running = False
                    m.stop_in = 0
            if m.running:
                m.hours_current += hours
                m.hours_total += hours
                if m.hours_to > 0 and m.hours_current >= m.hours_to:
                    # предупреждение, не стоп
                    if not any(a.message.endswith(f"ТО {m.name}") and a.active for a in self.alarms):
                        self._raise(f"Истекло время ТО {m.name}")

    def _active_edges(self) -> list[tuple[str, str, str]]:
        """(edge_id, from, to) по которым сейчас идёт зерно."""
        if not self.feed_on:
            return []
        need = {
            "conv_2", "noria_4", "muz_6", "noria_8", "tor_10",
            "noria_12", "noria_15", "noria_20",
        }
        if self.enable_op:
            need.add("op_5")
        if self.through_triers:
            need.update({"bt_14_1", "bt_14_2"})
        if self.through_pneumo:
            need.update({"sp_18", "fan_sp"})
        if any(not self.machines[i].running for i in need if i in self.machines):
            return []

        edges = [
            ("e_pit_c2", "pit", "conv_2"),
            ("e_c2_n4", "conv_2", "noria_4"),
            ("e_n4_op", "noria_4", "op_5" if self.enable_op else "muz_6"),
        ]
        if self.enable_op:
            edges.append(("e_op_muz", "op_5", "muz_6"))
        edges += [
            ("e_muz_n8", "muz_6", "noria_8"),
            ("e_n8_tor", "noria_8", "tor_10"),
            ("e_tor_n12", "tor_10", "noria_12"),
        ]
        if self.through_triers:
            edges += [
                ("e_n12_t1", "noria_12", "bt_14_1"),
                ("e_t1_t2", "bt_14_1", "bt_14_2"),
                ("e_t2_n15", "bt_14_2", "noria_15"),
            ]
        else:
            edges.append(("e_n12_n15", "noria_12", "noria_15"))
        if self.through_pneumo:
            edges += [
                ("e_n15_sp", "noria_15", "sp_18"),
                ("e_sp_n20", "sp_18", "noria_20"),
            ]
        else:
            edges.append(("e_n15_n20", "noria_15", "noria_20"))
        edges.append(("e_n20_v", "noria_20", "bunker_v"))
        return edges

    def _tick_grain(self, dt: float) -> None:
        edges = self._active_edges()
        edge_ids = [e[0] for e in edges]
        if self.feed_on and edges and self.bunkers["A"]["fill"] > 0.4:
            self._spawn_acc += dt * 14
            while self._spawn_acc >= 1 and len(self.particles) < 180:
                self._spawn_acc -= 1
                self.particles.append(GrainParticle(
                    id=str(uuid.uuid4())[:6],
                    edge=edges[0][0],
                    t=0.0,
                ))
        else:
            self._spawn_acc = 0

        nxt = {e[0]: i for i, e in enumerate(edges)}
        live = []
        arrived = 0
        for p in self.particles:
            p.t += dt * (GRAIN_SPEED / 100.0)
            if p.t >= 1.0:
                idx = nxt.get(p.edge)
                if idx is None:
                    p.alive = False
                    continue
                if idx + 1 < len(edges):
                    p.edge = edges[idx + 1][0]
                    p.t = 0.0
                    live.append(p)
                else:
                    arrived += 1
            else:
                if p.edge in edge_ids or p.t < 1:
                    live.append(p)
        self.particles = live[-180:]
        if arrived:
            v = self.bunkers["V"]
            v["fill"] = min(BUNKER_CAP, v["fill"] + arrived * 0.12)
            v["full"] = v["fill"] >= 95
            a = self.bunkers["A"]
            a["fill"] = max(0.0, a["fill"] - arrived * 0.08)
            a["full"] = a["fill"] >= 95
            if a["fill"] <= 0.5:
                self.feed_on = False
                if self.mode_running:
                    self._raise("Завальная яма / бункер А пуст — подача остановлена")

    def _tick_bunkers(self, dt: float) -> None:
        # медленное «дыхание» заполнения отходов при работе циклонов
        if self.machines["as_1"].running:
            b = self.bunkers["B"]
            b["fill"] = min(99.0, b["fill"] + dt * 0.15)
            b["full"] = b["fill"] >= 95

    # -------------------------------------------------------------- snapshot
    def snapshot(self) -> dict:
        with self.lock:
            return {
                "ts": now_str(),
                "date": today_str(),
                "estop": self.estop,
                "estop_source": self.estop_source,
                "mode_running": self.mode_running,
                "mode_starting": self.mode_starting,
                "mode_stopping": self.mode_stopping,
                "feed_on": self.feed_on,
                "route": self.route,
                "through_triers": self.through_triers,
                "through_pneumo": self.through_pneumo,
                "enable_op": self.enable_op,
                "enable_agitator": self.enable_agitator,
                "settings": deepcopy(self.settings),
                "user": deepcopy(self.user),
                "bunkers": deepcopy(self.bunkers),
                "diverters": deepcopy(self.diverters),
                "machines": {k: v.to_dict() for k, v in self.machines.items()},
                "alarms": [a.__dict__ for a in self.alarms[:80]],
                "archive": [a.__dict__ for a in self.archive[:80]],
                "particles": [
                    {"id": p.id, "edge": p.edge, "t": round(p.t, 3)}
                    for p in self.particles
                ],
                "status_line": self._status_line(),
            }

    def _status_line(self) -> str:
        if self.estop:
            return self.estop_source or "Нажат аварийный стоп"
        if self.mode_starting:
            return "Идёт запуск режима очистки"
        if self.mode_stopping:
            return "Идёт останов режима очистки"
        if self.mode_running:
            return "Режим очистки — линия в работе"
        if any(a.active for a in self.alarms):
            return self.alarms[0].message
        return "Линия остановлена"

    def set_settings(self, patch: dict) -> dict:
        with self.lock:
            for k, v in patch.items():
                if k in self.settings:
                    try:
                        self.settings[k] = max(0.0, float(v))
                    except (TypeError, ValueError):
                        pass
            return {"ok": True, "settings": deepcopy(self.settings)}

    def set_user(self, login: str, role: str) -> dict:
        with self.lock:
            self.user = {"login": login, "role": role, "logged_in": True}
            return {"ok": True, "user": deepcopy(self.user)}

    def fill_bunker(self, name: str, value: float) -> dict:
        with self.lock:
            if name not in self.bunkers:
                return {"ok": False}
            self.bunkers[name]["fill"] = max(0.0, min(100.0, float(value)))
            self.bunkers[name]["full"] = self.bunkers[name]["fill"] >= 95
            return {"ok": True}


plant = Plant()
