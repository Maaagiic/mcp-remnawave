// Calls every tool with synthesized arguments against a mocked panel and snapshots
// the HTTP requests (method, path, body). A tool that starts hitting another route
// or drops a field shows up as a snapshot diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, connect, mockFetch, matchSnapshot, dummyArgs } from './harness.mjs';

// Tools whose schema cannot be satisfied by "fill every field" (mutually exclusive fields and the like).
const ARGS = {
    users_resolve: { username: 'TEST' },
    connections_geocheck_request: { nodeUuid: '00000000-0000-4000-8000-000000000001', ip: '192.0.2.1' },
    api_request: { method: 'POST', path: '/api/example', query: { a: 1, list: [1, 2] }, body: { key: 'value' } },
};

test('every tool sends the expected request', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const fetchMock = mockFetch();
    const out = {};
    const failed = [];

    for (const tool of tools.sort((a, b) => a.name.localeCompare(b.name))) {
        const args = ARGS[tool.name] ?? dummyArgs(tool.inputSchema);
        fetchMock.calls.length = 0;
        const { error } = await call(client, tool.name, args);
        if (error) failed.push(`${tool.name}: ${error}`);
        out[tool.name] = { args, requests: [...fetchMock.calls] };
    }

    fetchMock.restore();
    await client.close();
    assert.deepEqual(failed, [], 'tools that could not be exercised');
    matchSnapshot('requests', out);
});
