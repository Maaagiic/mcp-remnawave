// Read-only smoke test against a LIVE panel: calls every tool of kind "read" with real
// identifiers and reports which routes the panel actually serves.
// Usage: npm test && node scripts/smoke.mjs <path to a .env with REMNAWAVE_BASE_URL and REMNAWAVE_API_TOKEN>
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, loadConfig, selectTools } from '../.test-build/lib.js';

const env = Object.fromEntries(
    readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const config = loadConfig({ ...env, REMNAWAVE_READONLY: 'true' });
const server = createServer(config);
const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(a);
const client = new Client({ name: 'smoke', version: '0' });
await client.connect(b);

const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content[0].text;
    return r.isError ? { error: text } : { data: JSON.parse(text), size: text.length };
};
const first = (r, ...keys) => { let v = r.data?.response ?? r.data; for (const k of keys) v = Array.isArray(v) ? v[0]?.[k] : v?.[k]; return Array.isArray(v) ? v[0] : v; };

// Discover real identifiers.
const nodes = await call('nodes_list');
const node = (nodes.data ?? [])[0]?.uuid;
const users = await call('users_list', { size: 1 });
const user = first(users, 'users');
const hosts = await call('hosts_list');
const host = first(hosts)?.uuid ?? first(hosts, 'hosts')?.uuid;
const profiles = await call('config_profiles_list');
const profile = first(profiles, 'configProfiles')?.uuid;
const squads = await call('squads_list');
const squad = first(squads, 'internalSquads')?.uuid;
const pick = async (tool, ...keys) => first(await call(tool), ...keys)?.uuid;
const ids = {
    node, host, profile, squad, userId: user?.id, username: user?.username, shortUuid: user?.shortUuid,
    extSquad: await pick('external_squads_list', 'externalSquads'),
    provider: await pick('billing_providers_list', 'providers'),
    plugin: await pick('node_plugins_list', 'nodePlugins'),
    integration: await pick('node_integrations_list', 'nodeIntegrations'),
    subpage: await pick('sub_page_configs_list', 'configs'),
    template: await pick('subscription_templates_list', 'templates'),
};
const FAKE = '00000000-0000-4000-8000-000000000000';
const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
const range = { start: weekAgo, end: today };

const ARGS = {
    users_get: { userId: ids.userId }, users_get_by_username: { username: ids.username }, users_get_by_short_uuid: { shortUuid: ids.shortUuid },
    users_resolve: { id: ids.userId }, users_accessible_nodes: { userId: ids.userId }, users_subscription_request_history: { userId: ids.userId },
    users_list: { size: 2 }, users_stream: { size: 2 }, nodes_get: { uuid: ids.node },
    hosts_get: { uuid: ids.host }, config_profiles_get: { uuid: ids.profile }, config_profiles_get_computed_config: { uuid: ids.profile },
    config_profiles_get_inbounds: { uuid: ids.profile }, squads_get: { uuid: ids.squad }, squads_accessible_nodes: { uuid: ids.squad },
    external_squads_get: { uuid: ids.extSquad ?? FAKE }, hwid_devices_list: { userId: ids.userId }, hwid_devices_list_all: { size: 2 }, hwid_top_users: { size: 2 },
    subscriptions_list: { size: 2 }, subscriptions_get_by_user_id: { userId: ids.userId }, subscriptions_get_by_username: { username: ids.username },
    subscriptions_get_by_short_uuid: { shortUuid: ids.shortUuid }, subscriptions_get_raw_by_short_uuid: { shortUuid: ids.shortUuid },
    subscriptions_get_connection_keys: { userId: ids.userId }, subscription_info: { shortUuid: ids.shortUuid }, subscription_request_history_list: { size: 2 },
    subscription_templates_get: { uuid: ids.template ?? FAKE }, sub_page_configs_get: { uuid: ids.subpage ?? FAKE },
    node_plugins_get: { uuid: ids.plugin ?? FAKE }, node_plugins_torrent_reports: { size: 2 }, node_integrations_get: { uuid: ids.integration ?? FAKE },
    shared_lists_get: { name: 'no-such-list' }, connections_by_user_result: { jobId: 'smoke-test' }, connections_by_node_result: { jobId: 'smoke-test' },
    connections_geocheck_result: { jobId: 'smoke-test' }, system_stats_digest: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date().toISOString() }, bandwidth_nodes_usage: range,
    bandwidth_node_users: { uuid: ids.node, ...range }, bandwidth_nodes_users: { nodesUuids: [ids.node], ...range },
    bandwidth_nodes_usage_threshold: { nodesUuids: [ids.node], ...range }, bandwidth_user_usage: { userId: ids.userId, ...range },
    bandwidth_squad_usage: { uuid: ids.squad, ...range, limit: 5 }, bandwidth_squad_user_usage: { squadUuid: ids.squad, userId: ids.userId, ...range },
    metadata_node_get: { uuid: ids.node }, metadata_user_get: { userId: ids.userId }, billing_provider_get: { uuid: ids.provider ?? FAKE },
    billing_history_list: { size: 2 }, api_request: { path: '/api/system/health' },
};
// Jobs on nodes and a validator that needs a full config: not plain reads, skipped here.
const SKIP = new Set(['connections_by_user_request', 'connections_by_node_request', 'connections_geocheck_request', 'system_srr_matcher']);

const rows = { ok: [], expected: [], fail: [] };
for (const tool of selectTools(config).enabled) {
    if (SKIP.has(tool.name)) continue;
    const r = await call(tool.name, ARGS[tool.name] ?? {});
    if (!r.error) rows.ok.push(`${tool.name} (${r.size} B)`);
    else if (/HTTP 404\).*(not found|A\d{3})/i.test(r.error) && !/Cannot (GET|POST)/.test(r.error)) rows.expected.push(`${tool.name}: ${r.error.slice(0, 110)}`);
    else if (/HTTP 403\)/.test(r.error)) rows.expected.push(`${tool.name}: 403 (token scope)`);
    else rows.fail.push(`${tool.name}: ${r.error.slice(0, 260)}`);
}
const meta = (await call('system_metadata')).data?.response;
console.log(`panel ${meta?.version} build ${meta?.build?.number}; read tools called: ${rows.ok.length + rows.expected.length + rows.fail.length}`);
console.log(`OK ${rows.ok.length}; route exists, nothing to return ${rows.expected.length}; FAIL ${rows.fail.length}`);
console.log('--- expected non-2xx:\n' + rows.expected.join('\n'));
console.log('--- FAIL:\n' + rows.fail.join('\n'));
console.log('--- largest responses: ' + rows.ok.map((x) => [Number(x.match(/\((\d+) B/)[1]), x]).sort((x, y) => y[0] - x[0]).slice(0, 8).map((x) => x[1]).join(', '));
await client.close();
