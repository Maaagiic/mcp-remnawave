import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetNodesCommand, GetRemnawaveHealthCommand, GetStatsCommand, GetUserByIdCommand } from '@remnawave/backend-contract';
import type { RemnawaveClient } from './client.js';

const MIME = 'application/json';

export function registerResources(server: McpServer, client: RemnawaveClient) {
    const fixed: [name: string, uri: string, description: string, path: string][] = [
        ['panel-stats', 'remnawave://stats', 'Current Remnawave panel statistics (users, nodes, traffic, system)', GetStatsCommand.TSQ_url],
        ['panel-nodes', 'remnawave://nodes', 'Status of all Remnawave nodes (online/offline, traffic)', GetNodesCommand.TSQ_url],
        ['panel-health', 'remnawave://health', 'Remnawave panel health check', GetRemnawaveHealthCommand.TSQ_url],
    ];

    for (const [name, uri, description, path] of fixed) {
        server.registerResource(name, uri, { description, mimeType: MIME }, async () => ({
            contents: [{ uri, mimeType: MIME, text: JSON.stringify(await client.request('GET', path)) }],
        }));
    }

    server.registerResource(
        'user-details',
        new ResourceTemplate('remnawave://users/{id}', { list: undefined }),
        { description: 'Detailed information about a Remnawave user by numeric id', mimeType: MIME },
        async (uri, { id }) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: MIME,
                    text: JSON.stringify(await client.request('GET', GetUserByIdCommand.url(String(id)))),
                },
            ],
        }),
    );
}
