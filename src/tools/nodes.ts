import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RemnawaveClient } from '../client/index.js';
import { toolResult, toolError, contractTool } from './helpers.js';
import {
    CreateNodeCommand,
    UpdateNodeCommand,
} from '@remnawave/backend-contract';

type Json = Record<string, any>;

/** Shrink a node list for LLM context: 13 raw nodes are ~55 KB, mostly inbound objects and system info. */
function compactNodes(result: unknown): unknown {
    const nodes = (result as Json)?.response ?? result;
    if (!Array.isArray(nodes)) return result;
    return nodes.map((n: Json) => {
        const { configProfile, provider, system, integrationUuids, ips, providerUuid, ...rest } = n;
        const info = system?.info;
        const stats = system?.stats;
        return {
            ...rest,
            configProfile: configProfile && {
                activeConfigProfileUuid: configProfile.activeConfigProfileUuid,
                activeInbounds: (configProfile.activeInbounds ?? []).map((i: Json) => i.tag ?? i.uuid),
            },
            provider: provider?.name ?? null,
            system: (info || stats) && {
                cpus: info?.cpus,
                kernel: info?.release,
                memoryTotal: info?.memoryTotal,
                memoryUsed: stats?.memoryUsed,
                loadAvg: stats?.loadAvg,
                uptime: stats?.uptime,
                rxBytesPerSec: stats?.interface?.rxBytesPerSec,
                txBytesPerSec: stats?.interface?.txBytesPerSec,
            },
        };
    });
}

export function registerNodeTools(server: McpServer, client: RemnawaveClient, readonly: boolean) {
    server.tool(
        'nodes_list',
        'List all Remnawave nodes. Compact by default (~4 KB less per node): inbounds as tags, provider as name, ' +
            'system info trimmed. Pass full=true for the raw panel response, or use nodes_get for one node.',
        {
            full: z.boolean().optional().describe('Return the raw panel response (large: ~4 KB per node)'),
        },
        async ({ full }) => {
            try {
                const result = await client.getNodes();
                return toolResult(full ? result : compactNodes(result));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_get',
        'Get a specific node by UUID',
        {
            uuid: z.string().describe('Node UUID'),
        },
        async ({ uuid }) => {
            try {
                const result = await client.getNodeByUuid(uuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_tags_list',
        'List all node tags',
        {},
        async () => {
            try {
                const result = await client.getNodeTags();
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    if (readonly) return;

    contractTool(
        server,
        'nodes_create',
        'Create a new node (full request schema from the Remnawave contract)',
        CreateNodeCommand,
        async (params) => client.createNode(params),
    );

    contractTool(
        server,
        'nodes_update',
        'Update a node, incl. configProfile/tags (full request schema from the Remnawave contract)',
        UpdateNodeCommand,
        async (params) => client.updateNode(params),
    );

    server.tool(
        'nodes_delete',
        'Delete a node from Remnawave',
        {
            uuid: z.string().describe('Node UUID to delete'),
        },
        async ({ uuid }) => {
            try {
                await client.deleteNode(uuid);
                return toolResult({
                    success: true,
                    message: `Node ${uuid} deleted`,
                });
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_enable',
        'Enable a disabled node',
        {
            uuid: z.string().describe('Node UUID'),
        },
        async ({ uuid }) => {
            try {
                const result = await client.enableNode(uuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_disable',
        'Disable a node',
        {
            uuid: z.string().describe('Node UUID'),
        },
        async ({ uuid }) => {
            try {
                const result = await client.disableNode(uuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_restart',
        'Restart a specific node',
        {
            uuid: z.string().describe('Node UUID'),
        },
        async ({ uuid }) => {
            try {
                const result = await client.restartNode(uuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_restart_all',
        'Restart all nodes',
        {},
        async () => {
            try {
                const result = await client.restartAllNodes();
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_reset_traffic',
        'Reset traffic counter for a node',
        {
            uuid: z.string().describe('Node UUID'),
        },
        async ({ uuid }) => {
            try {
                const result = await client.resetNodeTraffic(uuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_reorder',
        'Reorder nodes by providing an ordered array of UUIDs',
        {
            uuids: z
                .array(z.string())
                .describe('Ordered array of node UUIDs'),
        },
        async ({ uuids }) => {
            try {
                const result = await client.reorderNodes(uuids);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_bulk_profile_modification',
        'Bulk modify config profile for selected nodes',
        {
            nodeUuids: z.array(z.string()).describe('Array of node UUIDs'),
            configProfileUuid: z.string().describe('New config profile UUID'),
        },
        async (params) => {
            try {
                const result = await client.bulkNodeProfileModification(params);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_bulk_actions',
        'Bulk actions on selected nodes (enable/disable/restart)',
        {
            nodeUuids: z.array(z.string()).describe('Array of node UUIDs'),
            action: z.enum(['enable', 'disable', 'restart']).describe('Action to perform'),
        },
        async (params) => {
            try {
                const result = await client.bulkNodeActions(params);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'nodes_bulk_update',
        'Bulk update properties for selected nodes',
        {
            nodeUuids: z.array(z.string()).describe('Array of node UUIDs'),
            countryCode: z.string().optional().describe('New country code'),
            consumptionMultiplier: z.number().optional().describe('New consumption multiplier'),
        },
        async (params) => {
            try {
                const result = await client.bulkUpdateNodes(params);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );
}
