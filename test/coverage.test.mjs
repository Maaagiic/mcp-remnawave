// A contract bump must be reviewed: every command is either a tool or an explicit exclusion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '@remnawave/backend-contract';
import { EXCLUDED_COMMANDS, TOOLSETS, PROMPTS } from '../.test-build/lib.js';

const tools = Object.values(TOOLSETS).flat();
const commands = Object.entries(contract).filter(([name, value]) => name.endsWith('Command') && value?.endpointDetails);

test('every contract command is a tool or an explicit exclusion', () => {
    const used = new Set([...tools.map((tool) => tool.command), ...EXCLUDED_COMMANDS.map((entry) => entry.command)]);
    const unhandled = commands.filter(([, command]) => !used.has(command)).map(([name]) => name);
    assert.deepEqual(unhandled, [], 'add these commands to src/tools/registry.ts (TOOLSETS or EXCLUDED_COMMANDS)');
});

test('no command is used twice and no tool name repeats', () => {
    const names = tools.map((tool) => tool.name);
    assert.deepEqual(names.filter((name, i) => names.indexOf(name) !== i), []);
    const all = [...tools.map((tool) => tool.command), ...EXCLUDED_COMMANDS.map((entry) => entry.command)];
    const nameOf = (command) => commands.find(([, value]) => value === command)?.[0];
    assert.deepEqual(all.filter((command, i) => all.indexOf(command) !== i).map(nameOf), []);
});

test('tool names are lowercase snake_case', () => {
    assert.deepEqual(tools.map((tool) => tool.name).filter((name) => !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(name)), []);
});

test('prompts only mention tools that exist', () => {
    const names = new Set(tools.map((tool) => tool.name));
    const prefixes = new Set([...names].map((name) => name.split('_')[0]));
    const stale = [];
    for (const [prompt, { text }] of Object.entries(PROMPTS)) {
        const body = text({ username: 'u', nodeUuid: 'n', id: '1', startDate: 'a', endDate: 'b' });
        for (const word of body.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) ?? []) {
            if (prefixes.has(word.split('_')[0]) && !names.has(word)) stale.push(`${prompt}: ${word}`);
        }
    }
    assert.deepEqual(stale, []);
});
