import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RemnawaveClient } from '../client/index.js';
import { toolResult, toolError, contractTool } from './helpers.js';
import {
    UpdateSubscriptionTemplateCommand,
} from '@remnawave/backend-contract';

export function registerSubscriptionTemplateTools(
    server: McpServer,
    client: RemnawaveClient,
    readonly: boolean,
) {
    server.tool(
        'subscription_templates_list',
        'List all subscription templates (XRAY_JSON, CLASH, STASH, SINGBOX, MIHOMO). Content is not included — use subscription_templates_get.',
        {},
        async () => {
            try {
                return toolResult(await client.getSubscriptionTemplates());
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'subscription_templates_get',
        'Get a subscription template by UUID, including its content (templateJson / encodedTemplateYaml)',
        {
            uuid: z.string().describe('Template UUID'),
        },
        async ({ uuid }) => {
            try {
                return toolResult(await client.getSubscriptionTemplate(uuid));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    if (readonly) return;

    contractTool(
        server,
        'subscription_templates_update',
        'Update a subscription template (name and/or its content)',
        UpdateSubscriptionTemplateCommand,
        async (params) => client.updateSubscriptionTemplate(params),
    );
}
