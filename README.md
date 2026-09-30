<div align="center">

# mcp-remnawave

**MCP server for the [Remnawave](https://remna.st) VPN panel — tools generated from the panel's own API contract**

[![Remnawave 3.4](https://img.shields.io/badge/Remnawave-3.4-blue)](https://remna.st)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.0.0-orange)](package.json)

**English** · [Русский](README.ru.md)

</div>

---

Lets an MCP client — Claude Code, Claude Desktop, Cursor or any other — read and manage
users, nodes, hosts, config profiles, squads, subscriptions, node plugins, traffic
statistics, billing and HWID devices through the panel's REST API.

Every tool is built from [`@remnawave/backend-contract`](https://www.npmjs.com/package/@remnawave/backend-contract) —
the package the panel itself validates requests with. Route, HTTP method and arguments come
from the contract, so a tool cannot drift away from the API: updating for a new panel
version means bumping one dependency.

Maintained fork of [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave).

## ✨ Highlights

| | |
|---|---|
| 📜 **Generated from the contract** | 203 tools cover the whole API of Remnawave 3.4. A test fails when the contract gains a command that has no tool |
| 🚦 **Three access levels** | Read only · read + write · read + write + destructive. Tools above the chosen level are not registered at all |
| 🧩 **Toolsets** | Register only the groups you need (`users`, `nodes`, `hosts`, …) to keep the client's tool list short |
| 🧾 **Nothing is dropped silently** | An argument the endpoint does not know is an error, not an update that quietly did nothing. Validation errors name the field |
| 🗂 **One install, many panels** | Panel config is looked up in the current project first — the active panel is whichever project you are working in |
| 🪶 **Compact answers** | List tools leave out xray configs and raw inbound objects unless asked (`full: true`) |

## 🚀 Quick start

```bash
git clone https://github.com/Maaagiic/mcp-remnawave.git
cd mcp-remnawave
npm install && npm run build

cp .env.example .env          # set REMNAWAVE_BASE_URL and REMNAWAVE_API_TOKEN

# Claude Code — available in every project:
claude mcp add --scope user remnawave -- node "$PWD/dist/index.js"
```

That's it. Ask your client to call `system_metadata` — it should answer with the panel version.

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
<summary><b>Docker</b></summary>

The server speaks MCP over stdio, so the client starts one container per session — there
is no port to expose and nothing to keep running.

```bash
docker build -t remnawave-mcp .
claude mcp add --scope user remnawave -- docker run -i --rm --env-file /absolute/path/to/.env remnawave-mcp
```
</details>

<details>
<summary><b>Other MCP clients</b></summary>

Any stdio MCP client works — point it at `node dist/index.js` and pass the environment
variables from the table below (or rely on the config file lookup).
</details>

## ⚙️ Configuration

| Variable | Default | Description |
|---|---|---|
| `REMNAWAVE_BASE_URL` | — (required) | Panel URL, e.g. `https://panel.example.com` |
| `REMNAWAVE_API_TOKEN` | — (required) | API token (Bearer) — Panel → API tokens |
| `REMNAWAVE_READONLY` | `false` | `true` = only tools that read are registered **(recommended to start with)** |
| `REMNAWAVE_ALLOW_DESTRUCTIVE` | `true` | `false` = tools that delete data or act on every user/node are not registered |
| `REMNAWAVE_TOOLSETS` | all | Comma-separated toolsets to register, e.g. `users,nodes,hosts` |
| `REMNAWAVE_TOOLS_EXCLUDE` | — | Comma-separated tool names to leave out; `*` is a wildcard (`users_bulk_*`) |
| `REMNAWAVE_TIMEOUT_MS` | `30000` | Timeout for one request to the panel |
| `REMNAWAVE_API_KEY` | — | `X-Api-Key` for a reverse proxy in front of the panel |
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
client registration always wins. If nothing is found, the server exits with a message
that lists the files it looked at.

### Access levels

Every tool has a kind, shown to the client as MCP annotations (`readOnlyHint`, `destructiveHint`):

| Kind | What it is | Registered when |
|---|---|---|
| **read** | Does not change the panel (includes POST endpoints that only look things up) | always |
| **write** | Creates or changes something | `REMNAWAVE_READONLY` is not `true` |
| **destructive** | Deletes data, or acts on **every** user or node at once | write mode and `REMNAWAVE_ALLOW_DESTRUCTIVE` is not `false` |

Tools above the chosen level are not registered, so the client cannot even attempt them;
calling one by name answers with the reason it is off. A sensible setup for daily work is
write mode with `REMNAWAVE_ALLOW_DESTRUCTIVE=false`.

## 🧰 Tools

203 contract tools in 12 toolsets, plus `api_request`.

| Toolset | Read | Write | Destructive |
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
| `raw` | `api_request` (GET) | — | `api_request` (any method) |

Good to know:

- **Users are identified by a numeric `id`**, not a uuid. To search by telegramId, email, tag or
  status use `users_list` with `filters: [{"id": "telegramId", "value": 123456789}]`.
- **A tool takes exactly the fields of its endpoint.** Unknown arguments are rejected before
  anything is sent; values are forwarded as given, with no defaults added.
- **`config_profiles_update` with `config` replaces the whole xray config** of the profile —
  read it, patch it, write it back. Nodes using the profile restart xray to apply it.
- **Compact lists:** `nodes_list`, `config_profiles_list`, `squads_list` and `inbounds_list`
  leave out bulky parts by default; pass `full: true` for the raw panel response.
- **`squads_add_all_users` / `squads_remove_all_users` act on every user.** For selected users
  use `squads_add_many_users` / `squads_remove_many_users`.
- **`connections_*_request` start a job** on the node and return a `jobId`; fetch the outcome
  with the matching `*_result` tool.
- **`api_request`** sends a raw request for endpoints the installed contract does not describe
  yet. GET works in every mode; other methods need write mode with destructive tools allowed.
- `api_tokens_*` and `settings_*` need an API token with the matching scope — otherwise the panel
  answers `Forbidden`.

## 🔁 Panel versions

Tools describe the API of contract **3.4.15** (checked against a live 3.4.4 panel). The server
targets Remnawave **3.4**; for a 2.x or 3.0–3.3 panel use release
[v2.1.0](https://github.com/Maaagiic/mcp-remnawave/releases/tag/v2.1.0).

To follow a new panel release:

```bash
npm install --save-exact @remnawave/backend-contract@<version> zod@<the zod version it depends on>
npm run check
```

`npm run check` fails with the list of contract commands that have no tool yet (add them to
`src/tools/registry.ts`) and shows every changed argument as a snapshot diff.

## ⬆️ Upgrading from 2.x

3.0 is a breaking release: tools now follow the 3.4 API exactly.

- **Removed:** `ip_control_*` (the panel moved these routes — use `connections_*`),
  `hosts_bulk_set_inbound` / `hosts_bulk_set_port` (use `hosts_bulk_update`),
  `subscriptions_get_subpage_config`.
- **Renamed, because the old names promised something else:** `squads_add_users` /
  `squads_remove_users` and `external_squads_add_users` / `_remove_users` →
  `*_add_all_users` / `*_remove_all_users`. The endpoints take no user list and affect every
  user; selected users go through the new `squads_add_many_users` / `squads_remove_many_users`.
- **Arguments** changed wherever 2.x had drifted from the panel: hosts take `tags` (array) and
  `internalSquads` instead of `tag` and `excludedInternalSquads`; `nodes_restart` takes
  `forceRestart`; `nodes_bulk_*` take `uuids`; `*_reorder` take a list of `{uuid, viewPosition}`;
  `*_clone` take `cloneFromUuid`; HWID tools take `userId`; tools that address one user
  (`users_get`, `users_delete`, …) take `userId` instead of `id`.
- **New:** traffic statistics (`bandwidth_*`), geocheck, shared lists, node integrations,
  subscription settings, tags for profiles/squads/templates, `hosts_clone`, `hosts_reorder`,
  `hosts_bulk_update`, `users_stream`, `api_request`.
- `docker-compose.yml` is gone: the server is a stdio process, see the Docker section above.

## 🛠 Development

```bash
npm run dev         # tsup --watch
npm run build       # tsup → dist/index.js
npm run check       # typecheck + tests
```

The tests run the real server in-process against a mocked panel: they snapshot the tool
surface (names, schemas, annotations) and the HTTP request of every tool, so any change
to what a tool sends shows up in review. Accept intended changes with
`UPDATE_SNAPSHOTS=1 npm test`.

Two scripts check a real panel, without changing anything on it:

```bash
node scripts/smoke.mjs path/to/.env         # calls every read tool, reports routes the panel does not serve
node scripts/stdio-check.mjs path/to/project   # starts dist/index.js over stdio like a client would
```

The source is small on purpose: `src/tools/registry.ts` maps tool names to contract
commands, `src/tools/contract.ts` turns a command into a tool.

## 📄 License

MIT. Upstream authorship: [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave).
