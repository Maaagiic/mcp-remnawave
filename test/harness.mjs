// Test harness: runs the real server in-process (no stdio, no network) and records
// every HTTP request the tools would send to the panel.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, defineConfig } from '../.test-build/lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASE_URL = 'https://panel.example.com';

export function testConfig(overrides = {}) {
    return defineConfig({ baseUrl: BASE_URL, apiToken: 'test-token', ...overrides });
}

export async function connect(config = testConfig()) {
    const server = createServer(config);
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientSide);
    return client;
}

/** Call a tool and return { data } (parsed JSON result) or { error } (tool or protocol error text). */
export async function call(client, name, args = {}) {
    try {
        const result = await client.callTool({ name, arguments: args });
        const text = result.content[0].text;
        return result.isError ? { error: text } : { data: JSON.parse(text) };
    } catch (e) {
        return { error: e.message };
    }
}

/** Replace global fetch; returns the list that collects {method, path, body}. */
export function mockFetch(respond = () => new Response(JSON.stringify({ response: {} }), { status: 200 })) {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
        const request = { method: options.method ?? 'GET', path: String(url).replace(BASE_URL, '') };
        if (options.body !== undefined) request.body = JSON.parse(options.body);
        calls.push(request);
        return respond(request, options);
    };
    return { calls, restore: () => { globalThis.fetch = original; } };
}

/** Compare against test/snapshots/<name>.json; UPDATE_SNAPSHOTS=1 rewrites the file. */
export function matchSnapshot(name, value) {
    const file = resolve(HERE, 'snapshots', `${name}.json`);
    const actual = JSON.stringify(value, null, 2) + '\n';
    if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, actual);
        return;
    }
    assert.equal(actual, readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), `snapshot ${name} differs (UPDATE_SNAPSHOTS=1 to accept)`);
}

const UUID = '00000000-0000-4000-8000-000000000001';
const FORMATS = {
    uuid: UUID,
    email: 'user@example.com',
    uri: 'https://example.com',
    date: '2030-01-01',
    'date-time': '2030-01-01T00:00:00.000Z',
    ipv4: '192.0.2.1',
    ipv6: '2001:db8::1',
    base64: 'dGVzdA==',
};

/** Values for fields whose constraints live in zod refinements the JSON Schema cannot express. */
const BY_NAME = {
    hwid: 'ABCDEFGHIJ12',
    proxyUrl: 'socks5://127.0.0.1:1080',
    telegramId: 123456789,
    origin: 'https://example.com',
    rpId: 'example.com',
    frontendDomain: 'example.com',
    plainDomain: 'example.com',
    keycloakDomain: 'example.com',
};

/** Build a complete argument object (every property filled) from a tool's JSON input schema. */
export function dummyArgs(schema, root = schema, name = '') {
    if (!schema || typeof schema !== 'object') return undefined;
    if (name in BY_NAME) {
        const wantsString = [schema, ...(schema.anyOf ?? [])].some((variant) => variant.type === 'string');
        return wantsString ? String(BY_NAME[name]) : BY_NAME[name];
    }
    if (schema.$ref) {
        const target = schema.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node?.[decodeURIComponent(key)], root);
        return dummyArgs(target, root);
    }
    if (schema.const !== undefined) return schema.const;
    if (schema.enum) return schema.enum[0];
    const variants = schema.anyOf ?? schema.oneOf;
    if (variants) return dummyArgs(variants.find((v) => v.type !== 'null') ?? variants[0], root);
    if (schema.allOf) return Object.assign({}, ...schema.allOf.map((s) => dummyArgs(s, root)));
    const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
    switch (type) {
        case 'string':
            if (schema.format in FORMATS) return FORMATS[schema.format];
            return 'TEST'.padEnd(schema.minLength ?? 0, 'X').slice(0, schema.maxLength ?? Infinity);
        case 'integer':
        case 'number':
            return Math.max(schema.minimum ?? 1, schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : 1);
        case 'boolean':
            return true;
        case 'array':
            return schema.items ? Array.from({ length: schema.minItems ?? 1 }, () => dummyArgs(schema.items, root)) : [];
        case 'object': {
            const out = {};
            for (const [key, prop] of Object.entries(schema.properties ?? {})) out[key] = dummyArgs(prop, root, key);
            return out;
        }
        default:
            return {};
    }
}
