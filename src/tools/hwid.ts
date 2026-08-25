import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RemnawaveClient } from '../client/index.js';
import { toolResult, toolError, contractTool } from './helpers.js';
import {
    CreateUserHwidDeviceCommand,
} from '@remnawave/backend-contract';

export function registerHwidTools(
    server: McpServer,
    client: RemnawaveClient,
    readonly: boolean,
) {
    server.tool(
        'hwid_devices_list',
        'List HWID devices for a specific user',
        {
            userId: z.number().int().describe('Numeric user id (panel 3.x dropped user uuid)'),
        },
        async ({ userId }) => {
            try {
                const result = await client.getUserHwidDevices(userId);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'hwid_devices_list_all',
        'List all HWID devices across all users',
        {},
        async () => {
            try {
                const result = await client.getAllHwidDevices();
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'hwid_stats',
        'Get HWID device statistics',
        {},
        async () => {
            try {
                const result = await client.getHwidStats();
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'hwid_top_users',
        'Get users with most HWID devices',
        {},
        async () => {
            try {
                const result = await client.getHwidTopUsers();
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    if (readonly) return;

    contractTool(
        server,
        'hwid_device_create',
        'Register a HWID device for a user',
        CreateUserHwidDeviceCommand,
        async (params) => client.createUserHwidDevice(params),
    );

    server.tool(
        'hwid_device_delete',
        'Delete a specific HWID device',
        {
            deviceUuid: z.string().describe('HWID device UUID to delete'),
        },
        async ({ deviceUuid }) => {
            try {
                const result = await client.deleteHwidDevice(deviceUuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'hwid_devices_delete_all',
        'Delete all HWID devices for a user',
        {
            userUuid: z.string().describe('User UUID'),
        },
        async ({ userUuid }) => {
            try {
                const result =
                    await client.deleteAllUserHwidDevices(userUuid);
                return toolResult(result);
            } catch (e) {
                return toolError(e);
            }
        },
    );
}
