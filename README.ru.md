<div align="center">

# mcp-remnawave

**MCP-сервер для VPN-панели [Remnawave](https://remna.st) — тулы строятся из контракта API самой панели**

[![Remnawave 3.4](https://img.shields.io/badge/Remnawave-3.4-blue)](https://remna.st)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.0.0-orange)](package.json)

[English](README.md) · **Русский**

</div>

---

Даёт MCP-клиенту — Claude Code, Claude Desktop, Cursor и любому другому — читать и менять
юзеров, ноды, хосты, конфиг-профили, сквады, подписки, плагины нод, статистику трафика,
биллинг и HWID-устройства через REST API панели.

Каждый тул построен из [`@remnawave/backend-contract`](https://www.npmjs.com/package/@remnawave/backend-contract) —
пакета, которым сама панель проверяет запросы. Маршрут, HTTP-метод и аргументы берутся из
контракта, поэтому тул не может разъехаться с API: обновиться под новую версию панели —
значит поднять одну зависимость.

Поддерживаемый форк [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave).

## ✨ Главное

| | |
|---|---|
| 📜 **Тулы из контракта** | 203 тула покрывают весь API Remnawave 3.4. Тест падает, если в контракте появилась команда без тула |
| 🚦 **Три уровня доступа** | Только чтение · чтение и запись · чтение, запись и деструктивные действия. Тулы выше выбранного уровня не регистрируются вовсе |
| 🧩 **Наборы тулов** | Можно включить только нужные группы (`users`, `nodes`, `hosts`, …), чтобы список тулов у клиента был коротким |
| 🧾 **Ничего не теряется молча** | Аргумент, которого эндпоинт не знает, — ошибка, а не «успешное» обновление, которое ничего не сделало. Ошибки валидации называют поле |
| 🗂 **Одна установка — много панелей** | Конфиг панели ищется сначала в текущем проекте: активна та панель, в проекте которой вы работаете |
| 🪶 **Компактные ответы** | Списочные тулы не отдают xray-конфиги и сырые инбаунды, пока не попросишь (`full: true`) |

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
<summary><b>Docker</b></summary>

Сервер говорит по MCP через stdio, поэтому клиент сам запускает контейнер на каждую
сессию — портов наружу нет, постоянно ничего не крутится.

```bash
docker build -t remnawave-mcp .
claude mcp add --scope user remnawave -- docker run -i --rm --env-file /абсолютный/путь/к/.env remnawave-mcp
```
</details>

<details>
<summary><b>Другие MCP-клиенты</b></summary>

Подходит любой stdio-клиент MCP — укажите ему `node dist/index.js` и передайте переменные
окружения из таблицы ниже (или положитесь на поиск конфиг-файла).
</details>

## ⚙️ Настройка

| Переменная | По умолчанию | Описание |
|---|---|---|
| `REMNAWAVE_BASE_URL` | — (обязательна) | URL панели, например `https://panel.example.com` |
| `REMNAWAVE_API_TOKEN` | — (обязательна) | API-токен (Bearer) — Панель → API tokens |
| `REMNAWAVE_READONLY` | `false` | `true` = регистрируются только читающие тулы **(с этого стоит начинать)** |
| `REMNAWAVE_ALLOW_DESTRUCTIVE` | `true` | `false` = не регистрируются тулы, которые удаляют данные или действуют сразу на всех юзеров/ноды |
| `REMNAWAVE_TOOLSETS` | все | Наборы тулов через запятую, например `users,nodes,hosts` |
| `REMNAWAVE_TOOLS_EXCLUDE` | — | Имена тулов через запятую, которые нужно убрать; `*` — маска (`users_bulk_*`) |
| `REMNAWAVE_TIMEOUT_MS` | `30000` | Таймаут одного запроса к панели |
| `REMNAWAVE_API_KEY` | — | `X-Api-Key` для реверс-прокси перед панелью |
| `REMNAWAVE_ENV_FILE` | — | Явный путь к конфиг-файлу |

### Откуда берётся конфиг

Сервер останавливается на **первом** файле, где есть и `REMNAWAVE_BASE_URL`, и `REMNAWAVE_API_TOKEN`:

```
1. $REMNAWAVE_ENV_FILE          явный путь
2. <cwd>/.remnawave.env         на проект — добавьте в .gitignore
3. <cwd>/.env
4. <пакет>/.env                 запасной вариант
```

MCP-клиенты запускают stdio-серверы с `cwd` = корень проекта, поэтому при одной глобальной
установке **активна та панель, в проекте которой вы работаете**. Чтобы добавить панель,
положите `.remnawave.env` в её проект — на стороне сервера менять нечего. Переменные, уже
заданные в окружении, не перезаписываются: env из регистрации клиента всегда сильнее.
Если конфиг не найден, сервер завершается с сообщением, где перечислены просмотренные файлы.

### Уровни доступа

У каждого тула есть тип; клиенту он передаётся MCP-аннотациями (`readOnlyHint`, `destructiveHint`):

| Тип | Что это | Когда регистрируется |
|---|---|---|
| **read** | Панель не меняет (сюда же POST-эндпоинты, которые только ищут) | всегда |
| **write** | Создаёт или меняет | `REMNAWAVE_READONLY` не `true` |
| **destructive** | Удаляет данные или действует на **всех** юзеров либо все ноды сразу | режим записи и `REMNAWAVE_ALLOW_DESTRUCTIVE` не `false` |

Тулы выше выбранного уровня не регистрируются, так что клиент не может их даже попытаться
вызвать; вызов по имени вернёт причину, по которой тул выключен. Для ежедневной работы
разумно держать режим записи с `REMNAWAVE_ALLOW_DESTRUCTIVE=false`.

## 🧰 Тулы

203 тула из контракта в 12 наборах и `api_request`.

| Набор | Чтение | Запись | Деструктивные |
|---|---|---|---|
| `users` | `users_list`, `users_stream`, `users_get`, `users_get_by_username`, `users_get_by_short_uuid`, `users_resolve`, `users_tags_list`, `users_accessible_nodes`, `users_subscription_request_history` | `users_create`, `users_update`, `users_enable`, `users_disable`, `users_revoke_subscription`, `users_reset_traffic`, `users_extend_expiration`, `users_bulk_update`, `users_bulk_update_squads`, `users_bulk_extend_expiration`, `users_bulk_reset_traffic`, `users_bulk_revoke_subscription` | `users_delete`, `users_bulk_delete`, `users_bulk_delete_by_status`, `users_bulk_all_update`, `users_bulk_all_reset_traffic`, `users_bulk_all_extend_expiration` |
| `nodes` | `nodes_list`, `nodes_get`, `nodes_tags_list`, `keygen_get`, `node_integrations_list`, `node_integrations_get` | `nodes_create`, `nodes_update`, `nodes_enable`, `nodes_disable`, `nodes_restart`, `nodes_reset_traffic`, `nodes_reorder`, `nodes_bulk_actions`, `nodes_bulk_update`, `nodes_bulk_profile_modification`, `node_integrations_create`, `node_integrations_update` | `nodes_delete`, `nodes_restart_all`, `node_integrations_delete` |
| `hosts` | `hosts_list`, `hosts_get`, `hosts_tags_list` | `hosts_create`, `hosts_update`, `hosts_clone`, `hosts_reorder`, `hosts_bulk_enable`, `hosts_bulk_disable`, `hosts_bulk_update` | `hosts_delete`, `hosts_bulk_delete` |
| `config_profiles` | `config_profiles_list`, `config_profiles_get`, `config_profiles_get_computed_config`, `config_profiles_get_inbounds`, `inbounds_list`, `config_profiles_tags_list`, `snippets_list` | `config_profiles_create`, `config_profiles_update`, `config_profiles_set_tags`, `config_profiles_reorder`, `snippets_create`, `snippets_update`, `snippets_sync` | `config_profiles_delete`, `snippets_delete` |
| `squads` | `squads_list`, `squads_get`, `squads_accessible_nodes`, `squads_tags_list`, `external_squads_list`, `external_squads_get`, `external_squads_tags_list` | `squads_create`, `squads_update`, `squads_set_tags`, `squads_reorder`, `squads_add_many_users`, `squads_remove_many_users`, `external_squads_create`, `external_squads_update`, `external_squads_set_tags`, `external_squads_reorder` | `squads_add_all_users`, `squads_remove_all_users`, `squads_delete`, `external_squads_add_all_users`, `external_squads_remove_all_users`, `external_squads_delete` |
| `hwid` | `hwid_devices_list`, `hwid_devices_list_all`, `hwid_stats`, `hwid_top_users` | `hwid_device_create` | `hwid_device_delete`, `hwid_devices_delete_all` |
| `subscriptions` | `subscriptions_list`, `subscriptions_get_by_user_id`, `subscriptions_get_by_username`, `subscriptions_get_by_short_uuid`, `subscriptions_get_raw_by_short_uuid`, `subscriptions_get_connection_keys`, `subscription_info`, `subscription_request_history_list`, `subscription_request_history_stats`, `subscription_settings_get`, `subscription_templates_list`, `subscription_templates_get`, `subscription_templates_tags_list`, `sub_page_configs_list`, `sub_page_configs_get`, `sub_page_configs_tags_list` | `subscription_settings_update`, `subscription_templates_create`, `subscription_templates_update`, `subscription_templates_set_tags`, `subscription_templates_reorder`, `sub_page_configs_create`, `sub_page_configs_update`, `sub_page_configs_clone`, `sub_page_configs_set_tags`, `sub_page_configs_reorder` | `subscription_templates_delete`, `sub_page_configs_delete` |
| `node_plugins` | `node_plugins_list`, `node_plugins_get`, `node_plugins_tags_list`, `node_plugins_torrent_reports`, `node_plugins_torrent_stats`, `shared_lists_list`, `shared_lists_get` | `node_plugins_create`, `node_plugins_update`, `node_plugins_clone`, `node_plugins_set_tags`, `node_plugins_reorder`, `node_plugins_sync`, `node_plugins_execute`, `shared_lists_create`, `shared_lists_update`, `shared_lists_sync` | `node_plugins_delete`, `node_plugins_torrent_truncate`, `shared_lists_delete` |
| `connections` | `connections_by_user_request`, `connections_by_user_result`, `connections_by_node_request`, `connections_by_node_result`, `connections_geocheck_request`, `connections_geocheck_result` | — | `connections_drop` |
| `stats` | `system_stats`, `system_stats_recap`, `system_stats_digest`, `system_http_stats`, `system_bandwidth_stats`, `system_nodes_statistics`, `system_nodes_metrics`, `bandwidth_nodes_usage`, `bandwidth_node_users`, `bandwidth_nodes_users`, `bandwidth_nodes_usage_threshold`, `bandwidth_user_usage`, `bandwidth_squad_usage`, `bandwidth_squad_user_usage` | — | — |
| `system` | `system_health`, `system_metadata`, `system_configuration`, `system_generate_x25519`, `system_srr_matcher`, `auth_status`, `settings_get`, `api_tokens_list`, `api_tokens_scopes`, `metadata_node_get`, `metadata_user_get` | `settings_update`, `api_tokens_create`, `metadata_node_upsert`, `metadata_user_upsert` | `api_tokens_delete` |
| `billing` | `billing_providers_list`, `billing_provider_get`, `billing_nodes_list`, `billing_history_list` | `billing_provider_create`, `billing_provider_update`, `billing_node_create`, `billing_node_update`, `billing_history_create` | `billing_provider_delete`, `billing_node_delete`, `billing_history_delete` |
| `raw` | `api_request` (GET) | — | `api_request` (любой метод) |

Полезно знать:

- **Юзер определяется числовым `id`**, а не uuid. Поиск по telegramId, email, тегу или статусу —
  `users_list` с `filters: [{"id": "telegramId", "value": 123456789}]`.
- **Тул принимает ровно поля своего эндпоинта.** Неизвестные аргументы отклоняются до отправки;
  значения уходят в панель как есть, без подставленных умолчаний.
- **`config_profiles_update` с `config` заменяет весь xray-конфиг** профиля — прочитать,
  поправить, записать обратно. Ноды профиля перезапускают xray, чтобы применить его.
- **Компактные списки:** `nodes_list`, `config_profiles_list`, `squads_list` и `inbounds_list`
  по умолчанию опускают объёмные части; `full: true` вернёт сырой ответ панели.
- **`squads_add_all_users` / `squads_remove_all_users` действуют на всех юзеров.** Для выбранных —
  `squads_add_many_users` / `squads_remove_many_users`.
- **`connections_*_request` запускают задание** на ноде и возвращают `jobId`; результат забирает
  парный тул `*_result`.
- **`api_request`** шлёт сырой запрос — для эндпоинтов, которых установленный контракт ещё не
  описывает. GET работает в любом режиме; остальные методы — только в режиме записи с
  разрешёнными деструктивными тулами.
- `api_tokens_*` и `settings_*` требуют API-токен с нужным scope — иначе панель ответит `Forbidden`.

## 🔁 Версии панели

Тулы описывают API контракта **3.4.15** (проверено на живой панели 3.4.4). Сервер рассчитан на
Remnawave **3.4**; для панели 2.x или 3.0–3.3 берите релиз
[v2.1.0](https://github.com/Maaagiic/mcp-remnawave/releases/tag/v2.1.0).

Как догнать новый релиз панели:

```bash
npm install --save-exact @remnawave/backend-contract@<версия> zod@<версия zod, от которой он зависит>
npm run check
```

`npm run check` упадёт со списком команд контракта, для которых ещё нет тула (их добавляют в
`src/tools/registry.ts`), и покажет каждый изменившийся аргумент как diff снапшота.

## ⬆️ Переход с 2.x

3.0 — ломающий релиз: тулы теперь в точности следуют API 3.4.

- **Удалены:** `ip_control_*` (панель перенесла эти маршруты — используйте `connections_*`),
  `hosts_bulk_set_inbound` / `hosts_bulk_set_port` (используйте `hosts_bulk_update`),
  `subscriptions_get_subpage_config`.
- **Переименованы, потому что старые имена обещали другое:** `squads_add_users` /
  `squads_remove_users` и `external_squads_add_users` / `_remove_users` →
  `*_add_all_users` / `*_remove_all_users`. Эти эндпоинты не принимают список и действуют на
  всех юзеров; для выбранных появились `squads_add_many_users` / `squads_remove_many_users`.
- **Аргументы** изменились там, где 2.x разошёлся с панелью: у хостов `tags` (массив) и
  `internalSquads` вместо `tag` и `excludedInternalSquads`; `nodes_restart` принимает
  `forceRestart`; `nodes_bulk_*` — `uuids`; `*_reorder` — список `{uuid, viewPosition}`;
  `*_clone` — `cloneFromUuid`; HWID-тулы — `userId`; тулы для одного юзера
  (`users_get`, `users_delete`, …) — `userId` вместо `id`.
- **Новое:** статистика трафика (`bandwidth_*`), geocheck, shared lists, node integrations,
  настройки подписки, теги профилей/сквадов/шаблонов, `hosts_clone`, `hosts_reorder`,
  `hosts_bulk_update`, `users_stream`, `api_request`.
- `docker-compose.yml` убран: сервер — это stdio-процесс, см. раздел Docker выше.

## 🛠 Разработка

```bash
npm run dev         # tsup --watch
npm run build       # tsup → dist/index.js
npm run check       # проверка типов + тесты
```

Тесты поднимают настоящий сервер в том же процессе против мок-панели: снимают снапшот
поверхности тулов (имена, схемы, аннотации) и HTTP-запроса каждого тула, так что любое
изменение того, что тул шлёт, видно на ревью. Намеренные изменения принимаются командой
`UPDATE_SNAPSHOTS=1 npm test`.

Два скрипта проверяют живую панель, ничего на ней не меняя:

```bash
node scripts/smoke.mjs путь/к/.env           # вызывает все читающие тулы, сообщает о маршрутах, которых на панели нет
node scripts/stdio-check.mjs путь/к/проекту   # запускает dist/index.js по stdio, как это делает клиент
```

Исходников намеренно мало: `src/tools/registry.ts` сопоставляет имена тулов командам
контракта, `src/tools/contract.ts` превращает команду в тул.

## 📄 Лицензия

MIT. Оригинальный проект: [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave).
