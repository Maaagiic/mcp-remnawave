import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { RemnawaveClient } from './client.js';
import type { Config } from './config.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { installTools } from './tools/index.js';

export const SERVER_VERSION = pkg.version;
export const CONTRACT_VERSION = pkg.dependencies['@remnawave/backend-contract'];

function instructions(config: Config): string {
    const mode = config.readonly
        ? 'readonly: only tools that read are available'
        : config.allowDestructive
          ? 'read and write'
          : 'read and write, destructive tools are off';
    return [
        `Tools mirror the Remnawave REST API as described by backend contract ${CONTRACT_VERSION}; a tool takes exactly the fields of its endpoint.`,
        'Users are identified by a numeric id (not a uuid); nodes, hosts, squads and profiles by uuid.',
        `Mode: ${mode}.`,
    ].join(' ');
}

export function createServer(config: Config): McpServer {
    const server = new McpServer({ name: 'remnawave-mcp', version: SERVER_VERSION }, { instructions: instructions(config) });
    const client = new RemnawaveClient(config);

    installTools(server.server, client, config);
    registerResources(server, client);
    registerPrompts(server);

    return server;
}
