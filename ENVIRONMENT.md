# Environment & Secrets Checklist

Заполни переменные перед развёртыванием. Все значения можно хранить в 1Password/Bitwarden и прокидывать через CLI (Wrangler/Vercel).

## Cloudflare Worker (`worker/`)

| Назначение | Где задаётся | Имя | Описание |
| --- | --- | --- | --- |
| D1 database id | `wrangler.toml` | `database_id` | ID созданной базы `dashboard-db` |
| Composio API key | `wrangler secret put` или `.dev.vars` | `COMPOSIO_API_KEY` | Сервисный ключ Composio |
| Composio Connection ID | `wrangler secret put` | `COMPOSIO_CONNECTION_ID` | ID подключённого аккаунта Google Sheets |
| Google Sheet ID | `wrangler secret put` | `GOOGLE_SHEET_ID` | ID таблицы (часть URL после `/d/`) |
| Composio User ID | `wrangler secret put` | `COMPOSIO_USER_ID` | Тот `user_id`, который указал при создании connection (например `andrew-prod`) |
| Sheet Range (RM) | `wrangler secret put` | `GOOGLE_SHEET_RANGE` | Диапазон вида `Лист1!A2:B50`, чтобы подстраиваться под русские названия листов |
| Sheet Range (Payments) | `wrangler secret put` | `PAYMENTS_SHEET_RANGE` | Диапазон листа оплат, например `Лист2!A2:F100` |
| API secret для маршрутов | `wrangler secret put` | `API_SECRET` | Любое значение. При наличии проверяется в заголовке `X-API-KEY` |

Для локальной разработки продублируй значения в `worker/.dev.vars`.

## Vercel (Next.js фронтенд)

| Назначение | Переменная | Значение |
| --- | --- | --- |
| База URL бэкенда | `NEXT_PUBLIC_BACKEND_URL` | https://<твой-worker>.workers.dev |

Добавь переменную в `.env.local` (по образцу `dashboard-design/.env.example`) и через `vercel env`.
