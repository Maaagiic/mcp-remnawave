<div align="center">

# mcp-remnawave

**MCP server for the [Remnawave](https://remna.st) VPN panel — updated for Remnawave 3.x**

[![Remnawave 3.x](https://img.shields.io/badge/Remnawave-3.x-blue)](https://remna.st)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.0.0-orange)](package.json)

**English** · [Русский](README.ru.md)

</div>

---

Lets an MCP client — Claude Code, Claude Desktop, Cursor or any other — read and manage
users, nodes, hosts, config profiles, squads, subscription templates, billing and HWID
devices through the panel's REST API.

Maintained fork of [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave) v1.2.0,
brought in line with **Remnawave 3.x** (verified against a live 3.3.x panel) and reworked so
that tool schemas can no longer drift away from the panel API.

## ✨ Highlights

| | |
|---|---|
| 🔢 **Numeric user ids** | Remnawave 3.0 dropped the user `uuid`; every `users_*` tool uses the numeric `id` and the removed `by-*` routes are replaced by `users_list` filters |
| 📜 **Schemas from the contract** | Write tools take their input schema straight from `@remnawave/backend-contract` — the full API surface, not a hand-picked subset |
| 🧾 **Real error messages** | Validation errors come back with field-level details instead of a bare `Validation failed` |
| 🗂 **One install, many panels** | Panel config is looked up in the current project first — the active panel is whichever project you are working in |
| 🔒 **Readonly by default** | With `REMNAWAVE_READONLY=true` write tools are not registered at all |

## 🚀 Quick start

```bash
git clone https://github.com/Maaagiic/mcp-remnawave.git
cd mcp-remnawave
npm install && npm run build

cp .env.example .env          # set REMNAWAVE_BASE_URL and REMNAWAVE_API_TOKEN

# Claude Code — available in every project:
claude mcp add --scope user remnawave -- node "$PWD/dist/index.js"
```

That's it. Ask your client to `system_metadata` — it should answer with the panel version.

<details>
<summary><b>Per-project registration instead (<code>.mcp.json</code>)</b></summary>

```json
{
  "mcpServers": {
    "remnawave": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-remnawave/dist/index.js"]
    }
  }
}
```
</details>

<details>
<summary><b>Other MCP clients</b></summary>

Any stdio MCP client works — point it at `node dist/index.js` and pass the environment
variables from the table below (or rely on the config file lookup).
</details>

## ⚙️ Configuration

| Variable | Required | Description |
|---|:---:|---|
| `REMNAWAVE_BASE_URL` | ✅ | Panel URL, e.g. `https://panel.example.com` |
| `REMNAWAVE_API_TOKEN` | ✅ | API token (Bearer) — Panel → API tokens |
| `REMNAWAVE_READONLY` | — | `true` = only read tools are registered **(recommended default)** |
| `REMNAWAVE_API_KEY` | — | `X-Api-Key` for a Caddy custom-path setup |
| `REMNAWAVE_ENV_FILE` | — | Explicit path to a config file |

### Where the config comes from

The server stops at the **first** file that provides `REMNAWAVE_BASE_URL` and `REMNAWAVE_API_TOKEN`:

```
1. $REMNAWAVE_ENV_FILE          explicit path
2. <cwd>/.remnawave.env         per-project — add it to .gitignore
3. <cwd>/.env
4. <package>/.env               fallback
```

MCP clients launch stdio servers with `cwd` set to the project root, so with a single
global install **the active panel is whichever project you are working in**. To add a
panel, drop a `.remnawave.env` into its project — nothing to change on the server side.
Variables already present in the environment are never overridden, so env passed by the
client registration always wins.

### Readonly mode

Start with `REMNAWAVE_READONLY=true`. Write tools (create / update / delete / enable /
disable / bulk) are **not registered at all** in this mode, so the client cannot even
attempt them. Set it to `false` and restart the server when you actually need to write.

## 🧰 Tools

About 150 tools, grouped like the panel API. Read tools are always available; write tools
only when readonly is off.

<details open>
<summary><b>Users</b></summary>

| Read | Write |
|---|---|
| `users_list` (filters · sorting), `users_get`, `users_get_by_username`, `users_get_by_short_uuid`, `users_resolve`, `users_accessible_nodes`, `users_tags_list` | `users_create`, `users_update`, `users_delete`, `users_enable` / `users_disable`, `users_revoke_subscription`, `users_reset_traffic`, `users_extend_expiration`, `users_bulk_*`, `users_bulk_all_*` |

- Search by telegramId / email / tag / status: `users_list` with
  `filters: [{"id": "telegramId", "value": 123456789}]` (+ optional `filterModes`, `sorting`).
  This replaces the `by-*` routes removed in 3.x.
- `users_resolve` takes **exactly one** of `id`, `shortUuid`, `username`.
- Bulk tools take `userIds: number[]` (1–500); `users_bulk_update` nests changed fields under `fields`.
- `users_create` accepts explicit `vlessUuid` / `ssPassword` / `trojanPassword` / `shortUuid` — handy for service accounts.
</details>

<details>
<summary><b>Nodes · Hosts · Config profiles</b></summary>

| Group | Read | Write |
|---|---|---|
| Nodes | `nodes_list`, `nodes_get`, `nodes_tags_list` | `nodes_create` / `update` / `delete`, `nodes_enable` / `disable`, `nodes_restart`, `nodes_restart_all`, `nodes_reorder`, `nodes_reset_traffic`, `nodes_bulk_*` |
| Hosts | `hosts_list`, `hosts_get`, `hosts_tags_list` | `hosts_create` / `update` / `delete`, `hosts_bulk_*` |
| Config profiles | `config_profiles_list` / `get`, `config_profiles_get_inbounds`, `config_profiles_get_computed_config`, `inbounds_list` | `config_profiles_create` / `update` / `delete` / `reorder` |

- `config_profiles_update` with `config` **replaces** the whole xray config of the profile — read, patch, write back.
- `hosts_create` requires `inbound: { configProfileUuid, configProfileInboundUuid }`.
</details>

<details>
<summary><b>Squads · Subscriptions · Templates</b></summary>

| Group | Read | Write |
|---|---|---|
| Squads | `squads_list`, `squads_accessible_nodes`, `external_squads_list` / `get` | `squads_create` / `update` / `delete`, `squads_add_users`, `squads_remove_users`, `external_squads_*` |
| Subscriptions | `subscriptions_list`, `subscriptions_get_by_username`, `subscriptions_get_by_short_uuid`, `subscriptions_get_by_user_id`, `subscriptions_get_raw_by_short_uuid`, `subscriptions_get_connection_keys`, `subscription_info` | — |
| Templates & pages | `subscription_templates_list` / `get`, `sub_page_configs_list` / `get` | `subscription_templates_update`, `sub_page_configs_*` |
</details>

<details>
<summary><b>HWID · System · Billing · Plugins · Misc</b></summary>

| Group | Read | Write |
|---|---|---|
| HWID | `hwid_devices_list`, `hwid_devices_list_all`, `hwid_stats`, `hwid_top_users` | `hwid_device_create` / `delete`, `hwid_devices_delete_all` |
| System | `system_health`, `system_metadata`, `system_stats`, `system_stats_recap`, `system_bandwidth_stats`, `system_nodes_metrics`, `system_nodes_statistics`, `system_generate_x25519`, `keygen_get`, `system_srr_matcher` | `settings_update` |
| Billing | `billing_providers_list` / `get`, `billing_nodes_list`, `billing_history_list` | `billing_provider_*`, `billing_node_*`, `billing_history_*` |
| Node plugins | `node_plugins_list` / `get`, `node_plugins_torrent_*` | `node_plugins_*` |
| Misc | `api_tokens_list`, `snippets_list`, `metadata_*_get`, `ip_control_*` | `api_tokens_*`, `snippets_*`, `metadata_*_upsert` |

`api_tokens_list` and `settings_*` need an API token with the matching rights — otherwise the panel answers `Forbidden`.
</details>

## 🔧 What changed vs. upstream

<details>
<summary>Full list</summary>

- **Numeric user ids** everywhere; `users_get_by_telegram_id` / `_by_email` / `_by_tag` /
  `_by_subscription_uuid` and `subscriptions_get_by_uuid` removed (the routes no longer exist).
- **`contractTool()`** — write tools register with `RequestSchema.shape` from the contract.
  Before: 20 of 23 write tools exposed a subset of fields and the MCP SDK dropped the rest silently.
- `users_*` remain hand-written: the installed contract still declares `uuid` for users.
- New: `users_extend_expiration`, `users_accessible_nodes`, `subscriptions_get_by_user_id`,
  `subscription_templates_list` / `get` / `update`; `config_profiles_update` takes `config`.
- Client: full API error bodies, empty `2xx` bodies on bulk operations handled,
  trailing-slash-safe hand-built paths for 3.x-only routes.
- Enums from the contract (`RESET_PERIODS` incl. `MONTH_ROLLING`, `USERS_STATUS`).
- Multi-panel config lookup; readonly recommended by default; version bumped to **2.0.0**.
</details>

## 🧩 Design notes

- **Never replace an object field with `z.any()`.** A JSON schema without `type` makes clients
  send the value as a string and the panel rejects it with `expected object, received string`.
  Use `z.object({}).passthrough()`.
- The contract package is intentionally **not** bumped to 3.x: the current version reads fine
  against 3.3.x, and the known write-side differences are handled explicitly.
- The server runs from `dist/` — after changing `src/` run `npm run build` and reconnect.

## ⚠️ Known limitations

- `subscriptions_get_subpage_config` — the panel expects an object on this route; not yet mapped.
- Endpoints added in 3.x that the installed contract does not know (geocheck, shared lists,
  node integrations, bandwidth-stats routes) are not exposed.

## 🛠 Development

```bash
npm run dev       # tsup --watch
npm run build     # tsup → dist/index.js
npx tsc --noEmit  # typecheck
```

## 🐳 Docker

```bash
docker compose up -d
```

See `docker-compose.yml` and pass the same environment variables.

## 📄 License

MIT. Upstream authorship: [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave).
