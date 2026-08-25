# mcp-remnawave

MCP (Model Context Protocol) server for the [Remnawave](https://remna.st) VPN panel.
Lets an MCP client — Claude Code, Claude Desktop, Cursor, or any other — read and
manage users, nodes, hosts, config profiles, squads, subscription templates,
billing and HWID devices through the panel's REST API.

This is a maintained fork of [TrackLine/mcp-remnawave](https://github.com/TrackLine/mcp-remnawave)
(v1.2.0), updated for **Remnawave 3.x** (verified against 3.3.x) and reworked so that
tool schemas stay in sync with the panel API.

## What changed in this fork

Remnawave 3.0 broke the API in ways the original server did not follow:

- **Numeric user ids.** User `uuid` is gone; every `users_*` route takes the numeric `id`
  returned by `users_list`. The `by-telegram-id`, `by-email`, `by-tag` and
  `by-subscription-uuid` routes were removed — search goes through `users_list` filters.
- **Tool schemas derived from the contract.** Most hand-written schemas had silently
  drifted: 20 of 23 write tools accepted only a subset of the API fields, and the MCP
  SDK drops undeclared fields without any error. Write tools now take their input
  schema straight from `@remnawave/backend-contract`, so they expose the full API
  (e.g. `hosts_create` with `inbound`, `users_create` with explicit `vlessUuid` /
  `ssPassword` / `trojanPassword`).
- **Full API error bodies.** Validation errors from the panel are returned with the
  field-level details instead of a bare `Validation failed`.
- **Multi-panel config.** One global install can serve several panels: the server looks
  for the panel config in the current project first (see below).
- New tools: `users_extend_expiration`, `users_accessible_nodes`,
  `subscription_templates_list/get/update`, `subscriptions_get_by_user_id`.
- Fixes for 3.x behaviour: empty `2xx` bodies on bulk operations, `userIds` /
  `extendDays` bulk payloads, `MONTH_ROLLING` traffic strategy, numeric ids in
  `hwid_devices_list` and `subscriptions_get_connection_keys`.

## Requirements

- Node.js 22+
- A Remnawave panel 3.x and an API token (Panel → API tokens)

## Install

```bash
git clone https://github.com/Maaagiic/mcp-remnawave.git
cd mcp-remnawave
npm install
npm run build
```

Create a config file (see [Configuration](#configuration)):

```bash
cp .env.example .env
# edit .env: REMNAWAVE_BASE_URL, REMNAWAVE_API_TOKEN
```

### Register with Claude Code

Globally, for every project:

```bash
claude mcp add --scope user remnawave -- node /absolute/path/to/mcp-remnawave/dist/index.js
```

Or per project, in `.mcp.json`:

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

### Other MCP clients

Any stdio MCP client works — point it at `node dist/index.js` and pass the
environment variables below (or rely on the config file lookup).

## Configuration

| Variable | Required | Description |
|---|---|---|
| `REMNAWAVE_BASE_URL` | yes | Panel URL, e.g. `https://panel.example.com` |
| `REMNAWAVE_API_TOKEN` | yes | API token (Bearer) |
| `REMNAWAVE_API_KEY` | no | `X-Api-Key` for a Caddy custom-path setup |
| `REMNAWAVE_READONLY` | no | `true` = only read tools are registered (recommended default) |
| `REMNAWAVE_ENV_FILE` | no | Explicit path to a config file |

### Where the config is read from

The server stops at the first file that provides `REMNAWAVE_BASE_URL` and
`REMNAWAVE_API_TOKEN`:

1. `$REMNAWAVE_ENV_FILE`
2. `<cwd>/.remnawave.env` — per-project; add it to `.gitignore`
3. `<cwd>/.env`
4. `<package>/.env` — fallback

MCP clients launch stdio servers with `cwd` set to the project root, so with a single
global install the **active panel is whichever project you are working in**. To add a
panel, drop a `.remnawave.env` into its project — no server changes needed.
Variables already present in the environment are never overridden, so env passed by
the client registration has the highest priority.

### Readonly mode

Start with `REMNAWAVE_READONLY=true`. In this mode write tools
(create / update / delete / enable / disable / bulk) are **not registered at all**,
so the client cannot even attempt them. Flip it to `false` and restart the server
when you actually need to write.

## Tools

About 150 tools, grouped by the panel's API. Read tools are always available;
write tools only when readonly is off.

| Group | Read | Write |
|---|---|---|
| Users | `users_list` (with filters), `users_get`, `users_get_by_username`, `users_get_by_short_uuid`, `users_resolve`, `users_accessible_nodes`, `users_tags_list` | `users_create`, `users_update`, `users_delete`, `users_enable/disable`, `users_revoke_subscription`, `users_reset_traffic`, `users_extend_expiration`, `users_bulk_*`, `users_bulk_all_*` |
| Nodes | `nodes_list`, `nodes_get`, `nodes_tags_list` | `nodes_create/update/delete`, `nodes_enable/disable`, `nodes_restart`, `nodes_restart_all`, `nodes_reorder`, `nodes_reset_traffic`, `nodes_bulk_*` |
| Hosts | `hosts_list`, `hosts_get`, `hosts_tags_list` | `hosts_create/update/delete`, `hosts_bulk_*` |
| Config profiles | `config_profiles_list/get`, `config_profiles_get_inbounds`, `config_profiles_get_computed_config`, `inbounds_list` | `config_profiles_create/update/delete/reorder` — `update` takes the full xray `config` body |
| Squads | `squads_list`, `squads_accessible_nodes`, `external_squads_list/get` | `squads_create/update/delete`, `squads_add_users`, `squads_remove_users`, `external_squads_*` |
| Subscriptions | `subscriptions_list`, `subscriptions_get_by_username`, `subscriptions_get_by_short_uuid`, `subscriptions_get_by_user_id`, `subscriptions_get_raw_by_short_uuid`, `subscriptions_get_connection_keys`, `subscription_info` | — |
| Subscription templates & pages | `subscription_templates_list/get`, `sub_page_configs_list/get` | `subscription_templates_update`, `sub_page_configs_*` |
| HWID | `hwid_devices_list`, `hwid_devices_list_all`, `hwid_stats`, `hwid_top_users` | `hwid_device_create/delete`, `hwid_devices_delete_all` |
| System | `system_health`, `system_metadata`, `system_stats`, `system_stats_recap`, `system_bandwidth_stats`, `system_nodes_metrics`, `system_nodes_statistics`, `system_generate_x25519`, `keygen_get`, `system_srr_matcher` | `settings_update` |
| Billing | `billing_providers_list/get`, `billing_nodes_list`, `billing_history_list` | `billing_provider_*`, `billing_node_*`, `billing_history_*` |
| Node plugins | `node_plugins_list/get`, `node_plugins_torrent_*` | `node_plugins_*` |
| Misc | `api_tokens_list`, `snippets_list`, `metadata_*_get`, `ip_control_*` | `api_tokens_*`, `snippets_*`, `metadata_*_upsert` |

Notes:

- `users_list` filters are TanStack-style: `filters: [{"id": "telegramId", "value": 123456789}]`,
  optional `filterModes` and `sorting`. This replaces the removed `by-*` routes.
- `users_resolve` takes exactly one of `id`, `shortUuid`, `username`.
- Bulk user tools take `userIds: number[]` (1–500); `users_bulk_update` nests the
  changed fields under `fields`.
- `config_profiles_update` with `config` **replaces** the whole xray config of the
  profile — read it first, patch, write back.
- `api_tokens_list` / `settings_*` need an API token with the corresponding rights;
  otherwise the panel answers `Forbidden`.

## Design notes

- `src/tools/helpers.ts` — `contractTool()` registers a tool with the request schema
  taken from the contract command (`RequestSchema.shape`). Do **not** replace object
  fields with `z.any()`: a JSON schema without `type` makes clients send the value as a
  string and the panel rejects it with `expected object, received string`.
- `src/tools/users.ts` is hand-written on purpose: the installed contract (2.7.x) still
  declares `uuid` for users and cannot be reused for 3.x.
- The client (`src/client/index.ts`) tolerates empty `2xx` bodies and surfaces full
  error bodies from the panel.
- Paths that exist in 3.x but not in the installed contract (`/users/:id/actions/extend`,
  `/users/:id/accessible-nodes`, `/subscriptions/by-id/:id`, …) are built by hand.

## Known limitations

- `subscriptions_get_subpage_config` — the panel expects an object on this route;
  not yet mapped.
- Endpoints added in 3.x that the installed contract does not know (geocheck, shared
  lists, node integrations, bandwidth-stats routes) are not exposed.
- The contract package is intentionally **not** bumped to 3.x: the current version reads
  fine against 3.3.x, and the known write-side differences are handled explicitly.

## Development

```bash
npm run dev      # tsup --watch
npm run build    # tsup → dist/index.js
npx tsc --noEmit # typecheck
```

The server starts from `dist/`, so after changing `src/` rebuild and restart
(reconnect) the MCP server.

## Docker

```bash
docker compose up -d
```

See `docker-compose.yml`; pass the same environment variables.

## License

MIT — see the original project for upstream authorship.
