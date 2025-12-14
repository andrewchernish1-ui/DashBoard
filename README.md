# Dashboard Monitoring Stack

## Что это за проект
Панель мониторинга, которая тянет:
- **RM (повторные максимумы)** из Google Sheets.
- **Метрики Telegram** путём парсинга публичной страницы `t.me/s/chernish_training`.
- **Оплаты клиентов** из другого листа Google Sheets.

Архитектура:
- **Cloudflare Worker** (`worker/`, Hono + D1) — API + cron (06:00 UTC).
- **D1** — хранит `telegram_stats`, `telegram_posts`, `exercise_stats`, `client_payments`.
- **Next.js (Vercel)** (`dashboard-design/`) — фронтенд.

## Google Sheets
Файл: `1o-6hqyn3_avPPhyBn6RHanVDGBHA_Nhkb62EqbJP2ls`.

Листы по умолчанию:
- `Лист1` — RM. Столбцы: `A=Упражнение`, `B=Вес (кг)`, `C=Дата` (опционально, ISO `YYYY-MM-DD`).
- `Лист2` - оплаты. Столбцы: `A=Клиент`, `B=План`, `C=Сумма`, `D=Следующая оплата`, `E=Статус`, `F=Примечание`, `G=Telegram chat id`, `H=Telegram username (опц)`, `I=Notify opt-in (yes/no)`, `J=Timezone`, `K=Last notified offset`, `L=Last notified at`, `M=Error message`.

Worker читает диапазоны из секретов:
- `GOOGLE_SHEET_RANGE` (по умолчанию `Лист1!A2:C1000`).
- `PAYMENTS_SHEET_RANGE` (по умолчанию `Лист2!A2:M1000`).

## Backend эндпоинты
- `POST /api/refresh` - парсит Telegram, читает оба листа, перезаписывает D1.
- `GET /api/dashboard` - отдаёт данные фронту.
- `POST /api/sheets/init` - ставит заголовки на листах и очищает диапазоны ниже.
- `POST /api/payments/add` - добавляет оплату через Composio в Google Sheet **и** синхронизирует D1 (ожидает JSON с `name`, `amount`, опциональными `plan`, `status`, `nextPayment`, `notes`).
- `PUT /api/payments/update` - обновляет оплату по совпадению (поле `match`) и новым данным (`data`), синхронизирует лист и D1.
- `DELETE /api/payments/delete` - удаляет оплату по совпадению из листа и D1.
- `POST /api/exercises/add` - добавляет RM в лист и D1 (`name`, `weight`).
- Для мутаций можно (опционально) передать заголовок `X-API-KEY` со значением `API_SECRET`, чтобы ограничить публичные вызовы.

Секреты (см. `ENVIRONMENT.md`):
- Базовые: `COMPOSIO_API_KEY`, `COMPOSIO_CONNECTION_ID`, `COMPOSIO_USER_ID`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_RANGE`, `PAYMENTS_SHEET_RANGE`, `API_SECRET` (необязателен, но желателен).
- Календарь: `GOOGLE_CALENDAR_ID`, `COMPOSIO_CALENDAR_CONNECTION_ID`, `COMPOSIO_CALENDAR_USER_ID`, `COMPOSIO_CALENDAR_AUTH_CONFIG_ID` (если требуется).
- Напоминания в Telegram: `TELEGRAM_BOT_TOKEN`, `TIMEZONE_DEFAULT`, `REMINDER_DEDUP_MINUTES`, `REMINDER_STATUSES_SKIP`, `REMINDER_TEMPLATE` (опц.).
- Кнопка “Оплатил”: `REMINDER_CONFIRM_BASE_URL` (публичный URL воркера) и `REMINDER_CONFIRM_SECRET` (рандомная строка для подписи ссылок).

## Флоу обновления
1. Вносим данные в Google Sheet.
2. Жмём кнопку «Обновить» на фронтенде (делает `POST /api/refresh`) — Worker читает листы и обновляет D1.
3. Фронт после перезагрузки показывает новую статистику.

Для автоматического добавления оплат используем `POST /api/payments/add`. Это надёжнее ручной правки, потому что запись сразу попадает в D1 и не исчезнет при refresh.

## Последние правки
- Telegram-парсер с резервным фолбэком (`r.jina.ai`) и очисткой старых метрик перед вставкой новых, чтобы графики не тянули сидовые данные.
- Загрузка RM из листа выбирает максимальный вес по каждому упражнению за день.
- Диапазоны листов расширены до `A2:B1000` и `A2:M1000`, чтобы не терять строки ниже 500 и хранить данные напоминаний.
- Для отладки чтения RM из Sheets добавлен `GET /api/debug/exercises` (можно убрать после проверки).

## Идеи / TODO
- Добавить возможность задавать даты RM прямо в листе (сейчас дата = день обновления).
- Сохранённый список клиентов в D1 сбрасывается, если в листе нет строк. Нужно подумать об append-only режиме или проверке пустых значений.
- Сделать UX-флоу для ручного редактирования (например, формы в фронте с валидацией и сохранением через API).
- Генерировать уведомления / телеграм-бот для напоминаний об оплате.

Этот README — минимальный контекст; нового агента можно попросить прочитать его и `ENVIRONMENT.md`.

## Правки в Google Sheets
- Редактирование листов делаем через Composio-интеграцию (API воркера); вручную править в UI можно, но массовые замены (например, переименование Press -> Bench Press) лучше через Composio, чтобы данные в D1 и на фронте были согласованы.
- Диапазоны по умолчанию: `Лист1!A2:C1000` (упражнения) и `Лист2!A2:M1000` (оплаты + напоминания).
- События можно тянуть из Google Calendar через Composio (нужен подключённый календарь и секрет `GOOGLE_CALENDAR_ID`); фронт показывает события на сегодня +2 дня.

### Как вносить данные (чеклист для напоминаний)
- Не трогай заголовки `Лист2` (A1-M1). Если сбились - восстанови `POST /api/sheets/init` (нужен `X-API-KEY`).
- Обязательные поля для напоминаний: `Клиент` (A), `Сумма` (C), `Следующая оплата` (D, `YYYY-MM-DD`), `Telegram chat id` (G).
- Как получить `Telegram chat id`:
  - Пользователь должен написать боту (обычно `/start`), иначе бот не сможет писать в личку.
  - Затем дерни `GET /api/telegram/updates` (нужен `X-API-KEY`) и возьми `chat.id` из ответа.
  - Альтернатива: через Telegram-бота @userinfobot (вручную).
- Статус (E): `ok|warning|urgent|paid|cancelled`. При `paid`/`cancelled` уведомления не шлём.
- Notify opt-in (I): `yes`/`no`. Если `no`, уведомления пропускаются.
- Таймзона (J): например `Europe/Moscow`; если пусто - берём `TIMEZONE_DEFAULT`.
- Служебные поля `K/L/M` руками не заполняем - их пишет воркер после отправки/ошибок.
- В каждом напоминании есть кнопка “Оплатил”. Клиент нажимает → открывается страница воркера, где отметка записывается в `reminders_log`. Дату в таблице всё равно меняем вручную.

## Полезные эндпоинты
- `POST /api/reminders/run` — ручной запуск напоминаний (нужен `X-API-KEY`, если включён `API_SECRET`).
- `GET /api/reminders/logs?limit=20` — последние записи из `reminders_log`.
- `GET /api/telegram/updates?limit=20` — посмотреть необработанные апдейты и узнать `chat.id`.
- `GET /api/telegram/me` — проверить токен бота.
- `GET /api/reminders/confirm?...` — ссылка из кнопки “Оплатил” (генерится автоматически).
