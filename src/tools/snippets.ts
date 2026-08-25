import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RemnawaveClient } from '../client/index.js';
import { toolResult, toolError, contractTool } from './helpers.js';
import {
    CreateSnippetCommand,
    UpdateSnippetCommand,
} from '@remnawave/backend-contract';

export function registerSnippetTools(server: McpServer, client: RemnawaveClient, readonly: boolean) {
    server.tool('snippets_list', 'List all configuration snippets', {}, async () => {
        try { return toolResult(await client.getSnippets()); } catch (e) { return toolError(e); }
    });

    if (readonly) return;

    contractTool(
        server,
        'snippets_create',
        'Create a snippet, incl. its body',
        CreateSnippetCommand,
        async (params) => client.createSnippet(params),
    );

    contractTool(
        server,
        'snippets_update',
        'Update a snippet, incl. its body',
        UpdateSnippetCommand,
        async (params) => client.updateSnippet(params),
    );

    server.tool('snippets_delete', 'Delete a snippet', {
        uuid: z.string().describe('Snippet UUID to delete'),
    }, async (params) => {
        try { return toolResult(await client.deleteSnippet(params)); } catch (e) { return toolError(e); }
    });
}
