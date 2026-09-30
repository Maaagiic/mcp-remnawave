// The tool surface (names, descriptions, input schemas, annotations) is the public
// API of this server. Any change to it must be deliberate: review the snapshot diff.
import { test } from 'node:test';
import { connect, testConfig, matchSnapshot } from './harness.mjs';

async function surface(config) {
    const client = await connect(config);
    const { tools } = await client.listTools();
    await client.close();
    return tools.sort((a, b) => a.name.localeCompare(b.name));
}

test('tool surface, write mode', async () => {
    matchSnapshot('surface-write', await surface(testConfig()));
});

test('tool names, readonly mode', async () => {
    const tools = await surface(testConfig({ readonly: true }));
    matchSnapshot('surface-readonly', tools.map((tool) => tool.name));
});

test('tool names, write mode without destructive tools', async () => {
    const tools = await surface(testConfig({ allowDestructive: false }));
    matchSnapshot('surface-no-destructive', tools.map((tool) => tool.name));
});
