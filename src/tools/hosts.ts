import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RemnawaveClient } from '../client/index.js';
import { toolResult, toolError, contractTool } from './helpers.js';
import {
    CreateHostCommand,
    UpdateHostCommand,
} from '@remnawave/backend-contract';

const SUBSCRIPTION_TYPES = ['XRAY_JSON', 'XRAY_BASE64', 'MIHOMO', 'STASH', 'CLASH', 'SINGBOX'] as const;

/**
 * Host schema fixes on top of contract 2.7.2:
 * - the contract names the XHTTP field `xHttpExtraParams`, panel 3.x reads
 *   `xhttpExtraParams` and silently ignores the old name (200 OK, field stays null);
 * - these object fields are `z.unknown()` in the contract, which yields a JSON schema
 *   without `type`, so clients send them as strings (`expected object, received string`).
 */
const hostObjectField = () => z.object({}).passthrough().nullable().optional();
const HOST_OBJECT_FIELDS = {
    xhttpExtraParams: hostObjectField().describe('XHTTP extra params (panel 3.x field name)'),
    muxParams: hostObjectField(),
    sockoptParams: hostObjectField(),
    finalMask: hostObjectField(),
};

function fixHostSchema(command: { RequestSchema: z.ZodObject<z.ZodRawShape> }) {
    return {
        RequestSchema: command.RequestSchema.omit({ xHttpExtraParams: true }).extend(HOST_OBJECT_FIELDS),
    };
}

export function registerHostTools(server: McpServer, client: RemnawaveClient, readonly: boolean) {
    server.tool(
        'hosts_list',
        'List all Remnawave hosts',
        {},
        async () => {
            try {
                const result = await client.getHosts();
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'hosts_get',
        'Get a specific host by UUID',
        {
            uuid: z.string().describe('Host UUID'),
        },
        async ({ uuid }) => {
            try {
                const result = await client.getHostByUuid(uuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'hosts_tags_list',
        'List all host tags',
        {},
        async () => {
            try {
                const result = await client.getHostTags();
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    if (readonly) return;

    contractTool(
        server,
        'hosts_create',
        'Create a new host (full request schema from the Remnawave contract)',
        fixHostSchema(CreateHostCommand),
        async (params) => client.createHost(params),
    );

    contractTool(
        server,
        'hosts_update',
        'Update an existing host (full request schema from the Remnawave contract)',
        fixHostSchema(UpdateHostCommand),
        async (params) => client.updateHost(params),
    );

    server.tool(
        'hosts_delete',
        'Delete a host from Remnawave',
        {
            uuid: z.string().describe('Host UUID to delete'),
        },
        async ({ uuid }) => {
            try {
                await client.deleteHost(uuid);
                return toolResult({
                    success: true,
                    message: `Host ${uuid} deleted`,
                });
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'hosts_bulk_enable',
        'Bulk enable selected hosts',
        { uuids: z.array(z.string()).describe('Array of host UUIDs') },
        async (params) => {
            try { return toolResult(await client.bulkEnableHosts(params)); } catch (e) { return toolError(e); }
        },
    );

    server.tool(
        'hosts_bulk_disable',
        'Bulk disable selected hosts',
        { uuids: z.array(z.string()).describe('Array of host UUIDs') },
        async (params) => {
            try { return toolResult(await client.bulkDisableHosts(params)); } catch (e) { return toolError(e); }
        },
    );

    server.tool(
        'hosts_bulk_delete',
        'Bulk delete selected hosts',
        { uuids: z.array(z.string()).describe('Array of host UUIDs') },
        async (params) => {
            try { return toolResult(await client.bulkDeleteHosts(params)); } catch (e) { return toolError(e); }
        },
    );

    server.tool(
        'hosts_bulk_set_inbound',
        'Bulk set inbound for selected hosts',
        {
            uuids: z.array(z.string()).describe('Array of host UUIDs'),
            configProfileUuid: z.string().describe('Config profile UUID'),
            configProfileInboundUuid: z.string().describe('Inbound UUID'),
        },
        async (params) => {
            try { return toolResult(await client.bulkSetHostInbound(params)); } catch (e) { return toolError(e); }
        },
    );

    server.tool(
        'hosts_bulk_set_port',
        'Bulk set port for selected hosts',
        {
            uuids: z.array(z.string()).describe('Array of host UUIDs'),
            port: z.number().describe('New port number'),
        },
        async (params) => {
            try { return toolResult(await client.bulkSetHostPort(params)); } catch (e) { return toolError(e); }
        },
    );
}
