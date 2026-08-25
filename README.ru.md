<div align="center">

# mcp-remnawave

**MCP-сервер для VPN-панели [Remnawave](https://remna.st) — обновлён под Remnawave 3.x**

[![Remnawave 3.x](https://img.shields.io/badge/Remnawave-3.x-blue)](https://remna.st)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.0.0-orange)](package.json)

[English](README.md) · **Русский**

</div>

---

Позволяет MCP-клиенту — Claude Code, Claude Desktop, Cursor или любому другому — читать и
управлять юзерами, нодами, хостами, config-профилями, сквадами, шаблонами подписки,
биллингом и HWID-устройствами через REST API панели.

Поддерживаемый форк [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave) v1.2.0,
приведённый в соответствие с **Remnawave 3.x** (проверен на живой панели 3.3.x) и переработанный
так, чтобы схемы тулов больше не расходились с API панели.

## ✨ Главное

| | |
|---|---|
| 🔢 **Числовые id юзеров** | В Remnawave 3.0 у юзеров исчез `uuid`; все `users_*` работают по числовому `id`, а удалённые маршруты `by-*` заменены фильтрами `users_list` |
| 📜 **Схемы из контракта** | Write-тулы берут схему запроса прямо из `@remnawave/backend-contract` — весь API, а не подмножество полей, выбранное вручную |
| 🧾 **Настоящие ошибки** | Ошибки валидации возвращаются с указанием поля, а не голым `Validation failed` |
| 🗂 **Одна установка — много панелей** | Конфиг панели ищется сначала в текущем проекте: активна та панель, в проекте которой вы работаете |
| 🔒 **Readonly по умолчанию** | При `REMNAWAVE_READONLY=true` write-тулы вообще не регистрируются |

## 🚀 Быстрый старт

```bash
git clone https://github.com/Maaagiic/mcp-remnawave.git
cd mcp-remnawave
npm install && npm run build

cp .env.example .env          # задайте REMNAWAVE_BASE_URL и REMNAWAVE_API_TOKEN

# Claude Code — доступен во всех проектах:
claude mcp add --scope user remnawave -- node "$PWD/dist/index.js"
```

Готово. Попросите клиента вызвать `system_metadata` — он должен ответить версией панели.

<details>
<summary><b>Регистрация только в проекте (<code>.mcp.json</code>)</b></summary>

```json
{
  "mcpServers": {
    "remnawave": {
      "command": "node",
      "args": ["/абсолютный/путь/к/mcp-remnawave/dist/index.js"]
    }
  }
}
```
</details>

<details>
<summary><b>Другие MCP-клиенты</b></summary>

Подходит любой stdio-клиент MCP — укажите ему `node dist/index.js` и передайте переменные
окружения из таблицы ниже (или положитесь на поиск конфиг-файла).
</details>

## ⚙️ Настройка

| Переменная | Обязательна | Описание |
|---|:---:|---|
| `REMNAWAVE_BASE_URL` | ✅ | URL панели, например `https://panel.example.com` |
| `REMNAWAVE_API_TOKEN` | ✅ | API-токен (Bearer) — Панель → API tokens |
| `REMNAWAVE_READONLY` | — | `true` = регистрируются только read-тулы **(рекомендуемый дефолт)** |
| `REMNAWAVE_API_KEY` | — | `X-Api-Key` для Caddy с custom path |
| `REMNAWAVE_ENV_FILE` | — | Явный путь к файлу конфига |

### Откуда берётся конфиг

Сервер останавливается на **первом** файле, в котором есть `REMNAWAVE_BASE_URL` и `REMNAWAVE_API_TOKEN`:

```
1. $REMNAWAVE_ENV_FILE          явный путь
2. <cwd>/.remnawave.env         per-project — добавьте в .gitignore
3. <cwd>/.env
4. <пакет>/.env                 фолбэк
```

MCP-клиенты запускают stdio-серверы с `cwd` = корень проекта, поэтому при одной глобальной
установке **активна та панель, в проекте которой вы работаете**. Чтобы подключить новую панель,
положите в её проект `.remnawave.env` — на стороне сервера менять ничего не нужно. Уже заданные
переменные окружения никогда не перетираются, так что env из регистрации клиента всегда главнее.

### Режим readonly

Начинайте с `REMNAWAVE_READONLY=true`. Write-тулы (create / update / delete / enable / disable /
bulk) в этом режиме **не регистрируются вообще** — клиент не сможет их даже попытаться вызвать.
Переключите на `false` и перезапустите сервер, когда запись действительно нужна.

## 🧰 Тулы

Около 150 тулов, сгруппированы как API панели. Read-тулы доступны всегда, write — только при
выключенном readonly.

<details open>
<summary><b>Юзеры</b></summary>

| Чтение | Запись |
|---|---|
| `users_list` (фильтры · сортировка), `users_get`, `users_get_by_username`, `users_get_by_short_uuid`, `users_resolve`, `users_accessible_nodes`, `users_tags_list` | `users_create`, `users_update`, `users_delete`, `users_enable` / `users_disable`, `users_revoke_subscription`, `users_reset_traffic`, `users_extend_expiration`, `users_bulk_*`, `users_bulk_all_*` |

- Поиск по telegramId / email / tag / status: `users_list` с
  `filters: [{"id": "telegramId", "value": 123456789}]` (+ опционально `filterModes`, `sorting`).
  Это замена маршрутов `by-*`, удалённых в 3.x.
- `users_resolve` принимает **ровно одно** из `id`, `shortUuid`, `username`.
- Bulk-тулы принимают `userIds: number[]` (1–500); в `users_bulk_update` изменяемые поля вложены в `fields`.
- `users_create` принимает явные `vlessUuid` / `ssPassword` / `trojanPassword` / `shortUuid` — удобно для сервисных аккаунтов.
</details>

<details>
<summary><b>Ноды · Хосты · Config-профили</b></summary>

| Группа | Чтение | Запись |
|---|---|---|
| Ноды | `nodes_list`, `nodes_get`, `nodes_tags_list` | `nodes_create` / `update` / `delete`, `nodes_enable` / `disable`, `nodes_restart`, `nodes_restart_all`, `nodes_reorder`, `nodes_reset_traffic`, `nodes_bulk_*` |
| Хосты | `hosts_list`, `hosts_get`, `hosts_tags_list` | `hosts_create` / `update` / `delete`, `hosts_bulk_*` |
| Config-профили | `config_profiles_list` / `get`, `config_profiles_get_inbounds`, `config_profiles_get_computed_config`, `inbounds_list` | `config_profiles_create` / `update` / `delete` / `reorder` |

- `config_profiles_update` с `config` **заменяет** весь xray-конфиг профиля — прочитайте, поправьте, запишите обратно.
- `hosts_create` требует `inbound: { configProfileUuid, configProfileInboundUuid }`.
</details>

<details>
<summary><b>Сквады · Подписки · Шаблоны</b></summary>

| Группа | Чтение | Запись |
|---|---|---|
| Сквады | `squads_list`, `squads_accessible_nodes`, `external_squads_list` / `get` | `squads_create` / `update` / `delete`, `squads_add_users`, `squads_remove_users`, `external_squads_*` |
| Подписки | `subscriptions_list`, `subscriptions_get_by_username`, `subscriptions_get_by_short_uuid`, `subscriptions_get_by_user_id`, `subscriptions_get_raw_by_short_uuid`, `subscriptions_get_connection_keys`, `subscription_info` | — |
| Шаблоны и страницы | `subscription_templates_list` / `get`, `sub_page_configs_list` / `get` | `subscription_templates_update`, `sub_page_configs_*` |
</details>

<details>
<summary><b>HWID · Система · Биллинг · Плагины · Прочее</b></summary>

| Группа | Чтение | Запись |
|---|---|---|
| HWID | `hwid_devices_list`, `hwid_devices_list_all`, `hwid_stats`, `hwid_top_users` | `hwid_device_create` / `delete`, `hwid_devices_delete_all` |
| Система | `system_health`, `system_metadata`, `system_stats`, `system_stats_recap`, `system_bandwidth_stats`, `system_nodes_metrics`, `system_nodes_statistics`, `system_generate_x25519`, `keygen_get`, `system_srr_matcher` | `settings_update` |
| Биллинг | `billing_providers_list` / `get`, `billing_nodes_list`, `billing_history_list` | `billing_provider_*`, `billing_node_*`, `billing_history_*` |
| Плагины нод | `node_plugins_list` / `get`, `node_plugins_torrent_*` | `node_plugins_*` |
| Прочее | `api_tokens_list`, `snippets_list`, `metadata_*_get`, `ip_control_*` | `api_tokens_*`, `snippets_*`, `metadata_*_upsert` |

`api_tokens_list` и `settings_*` требуют API-токен с соответствующими правами — иначе панель отвечает `Forbidden`.
</details>

## 🔧 Что изменилось относительно апстрима

<details>
<summary>Полный список</summary>

- **Числовые id юзеров** везде; `users_get_by_telegram_id` / `_by_email` / `_by_tag` /
  `_by_subscription_uuid` и `subscriptions_get_by_uuid` удалены (маршрутов больше нет).
- **`contractTool()`** — write-тулы регистрируются со схемой `RequestSchema.shape` из контракта.
  Раньше 20 из 23 write-тулов принимали подмножество полей, а MCP SDK молча отбрасывал остальное.
- `users_*` написаны руками: установленный контракт всё ещё объявляет `uuid` для юзеров.
- Новое: `users_extend_expiration`, `users_accessible_nodes`, `subscriptions_get_by_user_id`,
  `subscription_templates_list` / `get` / `update`; `config_profiles_update` принимает `config`.
- Клиент: полные тела ошибок API, пустые `2xx` у bulk-операций, безопасная склейка путей для
  маршрутов, которых нет в контракте.
- Enum'ы из контракта (`RESET_PERIODS` вкл. `MONTH_ROLLING`, `USERS_STATUS`).
- Поиск конфига по нескольким панелям; readonly рекомендован по умолчанию; версия **2.0.0**.
</details>

## 🧩 Заметки по дизайну

- **Никогда не заменяйте объектное поле на `z.any()`.** JSON-схема без `type` заставляет клиент
  отправить значение строкой, и панель отвечает `expected object, received string`.
  Используйте `z.object({}).passthrough()`.
- Пакет контракта намеренно **не** поднят до 3.x: текущая версия нормально читает 3.3.x, а известные
  отличия на записи обработаны явно.
- Сервер работает из `dist/` — после правок в `src/` выполните `npm run build` и переподключитесь.

## ⚠️ Известные ограничения

- `subscriptions_get_subpage_config` — панель ждёт объект на этом маршруте; пока не разобрано.
- Эндпоинты, появившиеся в 3.x и неизвестные установленному контракту (geocheck, shared lists,
  node integrations, маршруты bandwidth-stats), не покрыты.

## 🛠 Разработка

```bash
npm run dev       # tsup --watch
npm run build     # tsup → dist/index.js
npx tsc --noEmit  # проверка типов
```

## 🐳 Docker

```bash
docker compose up -d
```

См. `docker-compose.yml`, переменные окружения те же.

## 📄 Лицензия

MIT. Оригинальный проект: [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave).
