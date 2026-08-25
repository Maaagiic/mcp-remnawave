import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RemnawaveClient } from '../client/index.js';
import { toolResult, toolError, contractTool } from './helpers.js';
import {
    CreateSubscriptionPageConfigCommand,
    UpdateSubscriptionPageConfigCommand,
} from '@remnawave/backend-contract';

export function registerSubPageConfigTools(server: McpServer, client: RemnawaveClient, readonly: boolean) {
    server.tool('sub_page_configs_list', 'List all subscription page configurations', {}, async () => {
        try { return toolResult(await client.getSubscriptionPageConfigs()); } catch (e) { return toolError(e); }
    });

    server.tool('sub_page_configs_get', 'Get a subscription page config by UUID', {
        uuid: z.string().describe('Config UUID'),
    }, async ({ uuid }) => {
        try { return toolResult(await client.getSubscriptionPageConfig(uuid)); } catch (e) { return toolError(e); }
    });

    if (readonly) return;

    contractTool(
        server,
        'sub_page_configs_create',
        'Create a subscription page configuration',
        CreateSubscriptionPageConfigCommand,
        async (params) => client.createSubscriptionPageConfig(params),
    );

    contractTool(
        server,
        'sub_page_configs_update',
        'Update a subscription page configuration, incl. its config body',
        UpdateSubscriptionPageConfigCommand,
        async (params) => client.updateSubscriptionPageConfig(params),
    );

    server.tool('sub_page_configs_delete', 'Delete a subscription page configuration', {
        uuid: z.string().describe('Config UUID'),
    }, async ({ uuid }) => {
        try { await client.deleteSubscriptionPageConfig(uuid); return toolResult({ success: true, message: `Config ${uuid} deleted` }); } catch (e) { return toolError(e); }
    });

    server.tool('sub_page_configs_reorder', 'Reorder subscription page configurations', {
        uuids: z.array(z.string()).describe('Ordered array of config UUIDs'),
    }, async (params) => {
        try { return toolResult(await client.reorderSubscriptionPageConfigs(params)); } catch (e) { return toolError(e); }
    });

    server.tool('sub_page_configs_clone', 'Clone a subscription page configuration', {
        uuid: z.string().describe('Config UUID to clone'),
    }, async (params) => {
        try { return toolResult(await client.cloneSubscriptionPageConfig(params)); } catch (e) { return toolError(e); }
    });
}
