import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, connect, mockFetch, testConfig, BASE_URL } from './harness.mjs';
import { ConfigError, RemnawaveClient, loadConfig, selectTools, TOOLSET_NAMES } from '../.test-build/lib.js';

const UUID = '00000000-0000-4000-8000-000000000001';
const names = (config) => selectTools(testConfig(config)).enabled.map((tool) => tool.name);

test('readonly mode keeps only tools that read', () => {
    const enabled = names({ readonly: true });
    assert.ok(enabled.includes('users_list'));
    assert.ok(enabled.includes('users_resolve'), 'a POST that only reads stays available');
    assert.ok(enabled.includes('api_request'));
    for (const name of ['users_update', 'users_delete', 'hosts_update', 'nodes_restart', 'connections_drop']) {
        assert.ok(!enabled.includes(name), `${name} must be off in readonly mode`);
    }
});

test('REMNAWAVE_ALLOW_DESTRUCTIVE=false removes deletes and fleet-wide actions, keeps ordinary writes', () => {
    const enabled = names({ allowDestructive: false });
    for (const name of ['users_update', 'hosts_update', 'nodes_restart', 'squads_add_many_users']) assert.ok(enabled.includes(name), name);
    for (const name of ['users_delete', 'users_bulk_all_update', 'nodes_restart_all', 'squads_add_all_users', 'hosts_bulk_delete', 'connections_drop']) {
        assert.ok(!enabled.includes(name), `${name} must be off`);
    }
});

test('toolsets and excludes narrow the tool list', () => {
    assert.ok(names({ toolsets: ['hosts'] }).every((name) => name.startsWith('hosts_')));
    assert.deepEqual(names({ toolsets: ['raw'] }), ['api_request']);
    const enabled = names({ excludeTools: ['users_bulk_*', 'nodes_delete'] });
    assert.ok(!enabled.some((name) => name.startsWith('users_bulk_')) && !enabled.includes('nodes_delete') && enabled.includes('users_update'));
    assert.throws(() => selectTools(testConfig({ toolsets: ['nope'] })), ConfigError);
    assert.ok(TOOLSET_NAMES.includes('users') && TOOLSET_NAMES.includes('raw'));
});

test('calling a disabled tool explains why', async () => {
    const client = await connect(testConfig({ readonly: true }));
    const { error } = await call(client, 'users_delete', { userId: 1 });
    assert.match(error, /users_delete is disabled: .*readonly/);
    assert.match((await call(client, 'no_such_tool')).error, /Unknown tool/);
    await client.close();
});

test('unknown arguments are rejected instead of being dropped', async () => {
    const client = await connect();
    const fetchMock = mockFetch();
    const { error } = await call(client, 'hosts_update', { uuid: UUID, tag: 'X' });
    assert.match(error, /Unknown argument\(s\): tag\. hosts_update accepts: .*tags/);
    assert.equal(fetchMock.calls.length, 0, 'nothing is sent to the panel');
    fetchMock.restore();
    await client.close();
});

test('invalid arguments are reported with the field name and never sent', async () => {
    const client = await connect();
    const fetchMock = mockFetch();
    const { error } = await call(client, 'hosts_update', { uuid: 'not-a-uuid', port: 'abc' });
    assert.match(error, /Invalid arguments: .*uuid: .*port: /);
    assert.equal(fetchMock.calls.length, 0);
    fetchMock.restore();
    await client.close();
});

test('values reach the panel as given: no injected defaults, only the fields that were passed', async () => {
    const client = await connect();
    const fetchMock = mockFetch();
    await call(client, 'users_update', { id: 7, description: null });
    await call(client, 'hosts_update', { uuid: UUID, xhttpExtraParams: '{"mode":"packet-up"}' });
    await call(client, 'users_list', { size: 5, filters: [{ id: 'tag', value: 'X' }] });
    await call(client, 'users_revoke_subscription', { userId: 7 });
    assert.deepEqual(fetchMock.calls, [
        { method: 'PATCH', path: '/api/users/', body: { id: 7, description: null } },
        // an object sent as JSON text is decoded, not forwarded as a string
        { method: 'PATCH', path: '/api/hosts/', body: { uuid: UUID, xhttpExtraParams: { mode: 'packet-up' } } },
        { method: 'GET', path: '/api/users/?size=5&filters=%5B%7B%22id%22%3A%22tag%22%2C%22value%22%3A%22X%22%7D%5D' },
        { method: 'POST', path: '/api/users/7/actions/revoke', body: {} },
    ]);
    fetchMock.restore();
    await client.close();
});

test('list tools drop xray configs and raw inbounds unless full=true', async () => {
    const inbound = { uuid: UUID, tag: 'in', rawInbound: { port: 443 } };
    const payload = { response: { total: 1, configProfiles: [{ uuid: UUID, name: 'p', config: { log: {} }, inbounds: [inbound] }] } };
    const client = await connect();
    const fetchMock = mockFetch(() => new Response(JSON.stringify(payload)));
    assert.deepEqual((await call(client, 'config_profiles_list')).data, {
        response: { total: 1, configProfiles: [{ uuid: UUID, name: 'p', inbounds: [{ uuid: UUID, tag: 'in' }] }] },
    });
    assert.deepEqual((await call(client, 'config_profiles_list', { full: true })).data, payload);
    fetchMock.restore();
    await client.close();
});

test('nodes_list is compact unless full=true', async () => {
    const node = { uuid: UUID, name: 'n1', provider: { name: 'acme', uuid: UUID }, system: { info: { cpus: 2 }, stats: {} }, ips: [] };
    const client = await connect();
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ response: [node] })));
    const compact = (await call(client, 'nodes_list')).data;
    const full = (await call(client, 'nodes_list', { full: true })).data;
    assert.equal(compact[0].provider, 'acme');
    assert.equal(compact[0].ips, undefined);
    assert.deepEqual(full, { response: [node] });
    assert.deepEqual(fetchMock.calls, [{ method: 'GET', path: '/api/nodes/' }, { method: 'GET', path: '/api/nodes/' }]);
    fetchMock.restore();
    await client.close();
});

test('api_request: GET everywhere, other methods only with full write access', async () => {
    const fetchMock = mockFetch();
    for (const config of [{ readonly: true }, { allowDestructive: false }]) {
        const client = await connect(testConfig(config));
        assert.match((await call(client, 'api_request', { method: 'DELETE', path: '/api/users/1' })).error, /not allowed/);
        assert.deepEqual((await call(client, 'api_request', { path: '/api/system/health' })).data, { response: {} });
        await client.close();
    }
    const client = await connect();
    assert.match((await call(client, 'api_request', { path: '/not-api' })).error, /must start with \/api\//);
    await call(client, 'api_request', { method: 'PATCH', path: '/api/hosts/', body: { uuid: UUID } });
    assert.deepEqual(fetchMock.calls.at(-1), { method: 'PATCH', path: '/api/hosts/', body: { uuid: UUID } });
    fetchMock.restore();
    await client.close();
});

test('client: errors keep the panel validation details, empty and non-JSON bodies are handled', async () => {
    const client = new RemnawaveClient(testConfig({ apiKey: 'proxy-key' }));
    let fetchMock = mockFetch((_, options) => {
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        assert.equal(options.headers['X-Api-Key'], 'proxy-key');
        return new Response(JSON.stringify({ message: 'Validation failed', errors: [{ path: ['port'] }] }), { status: 400 });
    });
    await assert.rejects(client.request('PATCH', '/api/hosts/', { body: {} }), /HTTP 400\): Validation failed \| body=.*"port"/);
    fetchMock.restore();

    fetchMock = mockFetch(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    await assert.rejects(client.request('GET', '/api/x'), /HTTP 502\): <html>502/);
    fetchMock.restore();

    fetchMock = mockFetch(() => new Response(null, { status: 204 }));
    assert.deepEqual(await client.request('POST', '/api/users/bulk/delete', { body: { userIds: [1] } }), { ok: true, status: 204 });
    fetchMock.restore();
});

test('client: a panel that does not answer fails with a timeout, not a hang', async () => {
    const client = new RemnawaveClient(testConfig({ timeoutMs: 30 }));
    const original = globalThis.fetch;
    globalThis.fetch = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    // AbortSignal.timeout uses an unref'd timer; a real socket would keep the loop alive, the mock needs a stand-in.
    const keepAlive = setTimeout(() => {}, 5_000);
    await assert.rejects(client.request('GET', '/api/system/health'), /no response from GET \/api\/system\/health within 30 ms/);
    clearTimeout(keepAlive);
    globalThis.fetch = original;
});

test('config: env parsing', () => {
    const base = { REMNAWAVE_BASE_URL: `${BASE_URL}///`, REMNAWAVE_API_TOKEN: 't' };
    const config = loadConfig({ ...base, REMNAWAVE_TOOLSETS: 'users, hosts', REMNAWAVE_TOOLS_EXCLUDE: 'users_delete', REMNAWAVE_TIMEOUT_MS: '5000' });
    assert.equal(config.baseUrl, BASE_URL);
    assert.deepEqual([config.readonly, config.allowDestructive, config.toolsets, config.excludeTools, config.timeoutMs], [false, true, ['users', 'hosts'], ['users_delete'], 5000]);
    assert.equal(loadConfig({ ...base, REMNAWAVE_READONLY: 'true' }).readonly, true);
    assert.equal(loadConfig({ ...base, REMNAWAVE_READONLY: 'yes' }).readonly, false, 'only the literal "true" enables readonly');
    assert.equal(loadConfig({ ...base, REMNAWAVE_ALLOW_DESTRUCTIVE: 'false' }).allowDestructive, false);
    assert.throws(() => loadConfig({}, ['/project/.remnawave.env']), /REMNAWAVE_BASE_URL and REMNAWAVE_API_TOKEN must be set[\s\S]*\/project\/\.remnawave\.env/);
    assert.throws(() => loadConfig({ ...base, REMNAWAVE_TIMEOUT_MS: 'soon' }), ConfigError);
});
