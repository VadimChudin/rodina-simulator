# Развёртывание эмулятора ЛПЗС «Родина»

Приложение состоит из двух частей:

- **frontend/** — статика (HTML, CSS, JS, спрайты). Вся симуляция крутится в браузере,
  поэтому страница работает даже без сервера.
- **backend/** — FastAPI: держит серверную копию состояния линии, отдаёт REST и WebSocket.
  Нужен, когда за одной линией наблюдают несколько операторов или когда состояние
  должно переживать перезагрузку вкладки.

Выберите один из трёх вариантов ниже.

---

## Вариант 1. Только статика (самый простой)

Симуляция целиком в браузере, сервер приложений не нужен — достаточно любого веб-сервера.

```bash
# скопировать каталог frontend на сервер
scp -r frontend/ user@server:/var/www/lpzs/
```

Конфиг nginx:

```nginx
server {
    listen 80;
    server_name lpzs.example.ru;
    root /var/www/lpzs;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location ~* \.(webp|css|js)$ { expires 30d; }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Проверка: открыть `http://lpzs.example.ru` — должна появиться мнемосхема.
Ограничение: у каждого оператора своя независимая симуляция.

---

## Вариант 2. Docker Compose (рекомендую)

```bash
cd lpzs_emulation
docker compose up -d --build
docker compose logs -f lpzs      # смотреть запуск
```

Открыть `http://<IP сервера>` (через nginx) или `http://<IP сервера>:8000` (напрямую).

Обновление после правок:

```bash
docker compose up -d --build
```

Остановка: `docker compose down`

HTTPS: положите `fullchain.pem` и `privkey.pem` в `deploy/certs/`,
снимите комментарии с блока `server { listen 443 ... }` в `deploy/nginx.conf`
и с редиректа на HTTPS, затем `docker compose restart nginx`.

---

## Вариант 3. systemd без Docker

```bash
sudo useradd -r -s /bin/false lpzs
sudo mkdir -p /opt/lpzs && sudo chown lpzs:lpzs /opt/lpzs
sudo -u lpzs cp -r backend frontend requirements.txt /opt/lpzs/

cd /opt/lpzs
sudo -u lpzs python3 -m venv .venv
sudo -u lpzs .venv/bin/pip install -r requirements.txt

sudo cp deploy/lpzs.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lpzs
sudo systemctl status lpzs
```

Сервис слушает `127.0.0.1:8000`, наружу его публикует nginx (`deploy/nginx.conf`,
только поменяйте `upstream` на `server 127.0.0.1:8000;`).

---

## Эндпоинты

Базовый адрес: `http://<host>:8000`

### Служебные

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/` | Страница пульта (index.html) |
| GET | `/api/health` | Проба живости для балансировщика и Docker |
| GET | `/api/state` | Полный снимок состояния линии (JSON, ~14 КБ) |
| WS | `/ws` | Телеметрия, 10 кадров в секунду |

### Управление линией

| Метод | Путь | Тело | Что делает |
|---|---|---|---|
| POST | `/api/estop` | `{"pressed": true}` | Нажать или отжать аварийный стоп |
| POST | `/api/mode/start` | `{"through_triers": true, "through_pneumo": true, "enable_op": true, "trier_1": true, "trier_2": true}` | Пуск режима очистки, каскад с хвоста линии |
| POST | `/api/mode/stop` | `{}` | Останов режима, каскад с головы линии |
| POST | `/api/reset_alarms` | `{}` | Квитировать аварии |

### Механизмы

| Метод | Путь | Тело | Что делает |
|---|---|---|---|
| POST | `/api/machine/{mid}/start` | `{}` | Пуск механизма |
| POST | `/api/machine/{mid}/stop` | `{}` | Останов механизма |
| POST | `/api/machine/{mid}` | `{"delay_start": 2.0, "hours_to": 500, "manual": true, "dks": false}` | Правка задержек, ТО, снятие датчиков с контроля |
| POST | `/api/fault` | `{"machine_id": "noria_20", "sensor": "dks", "on": true}` | Имитация датчика. `"sensor": "clear"` снимает все датчики механизма |
| POST | `/api/diverter/{did}` | `{"pos": "trier"}` | Переключить задвижку |
| POST | `/api/bunker/{name}` | `{"value": 0.5}` | Задать уровень в бункере (0…1) |

### Настройки и учётная запись

| Метод | Путь | Тело |
|---|---|---|
| POST | `/api/settings` | `{"values": {"dvu_bo9": 8, "seq_up": 0.36}}` |
| POST | `/api/user` | `{"login": "operator", "role": "Наладчик"}` |

`mid` — идентификатор механизма: `intake`, `noria_4`, `muz_6`, `tor_10`, `bt_14_1`,
`sp_18`, `noria_20`, `as_1`…`as_3`, `conv_22_1`…`conv_22_4` и так далее.
Полный список приходит в `/api/state` в поле `machines`.

### Порядок вызовов при пуске

Линия стартует по умолчанию с нажатым аварийным стопом, поэтому порядок строгий:

```bash
H=http://<host>:8000
J='Content-Type: application/json'

# 1. проверить, что сервис жив
curl -s $H/api/health

# 2. отжать аварийный стоп
curl -s -X POST $H/api/estop -H "$J" -d '{"pressed": false}'

# 3. квитировать аварии — иначе пуск режима вернёт ok:false
curl -s -X POST $H/api/reset_alarms -H "$J" -d '{}'

# 4. запустить режим очистки
curl -s -X POST $H/api/mode/start -H "$J" \
     -d '{"through_triers": true, "through_pneumo": true, "enable_op": true}'

# 5. каскад поднимает механизмы с хвоста линии ~30 секунд, затем:
curl -s $H/api/health
```

Ответ в норме после пуска:

```json
{"status":"ok","mode_running":true,"estop":false,"machines":30}
```

Важно: `/api/mode/start` всегда отвечает HTTP 200. Результат смотрите в поле `ok`
тела ответа — при незакрытых авариях там будет `{"ok": false, "error": "..."}`.

---

## Частые проблемы

**Схема пустая, в консоли 404 на `/assets/*.webp`** — веб-сервер не отдаёт каталог
спрайтов. В варианте с FastAPI это уже настроено (`app.mount("/assets", ...)`),
в варианте со статикой проверьте, что `frontend/assets` скопирован целиком.

**Механизмы не крутятся, WebSocket молчит** — прокси не пропускает апгрейд соединения.
В nginx для `/ws` обязательны `proxy_http_version 1.1`, `Upgrade` и `Connection "upgrade"`.

**Линия «залипает» после перезапуска сервера** — состояние в `backend/plant.py`
живёт в памяти процесса. Это симулятор, база не нужна: перезапуск = чистый стенд.

**Долгие соединения рвутся через минуту** — поднимите `proxy_read_timeout` для `/ws`
(в конфиге стоит 3600 с).
