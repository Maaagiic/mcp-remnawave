import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RESET_PERIODS_VALUES, USERS_STATUS_VALUES } from '@remnawave/backend-contract';
import { RemnawaveClient } from '../client/index.js';
import { toolResult, toolError } from './helpers.js';

/**
 * Users — schemas are hand-written here, NOT derived via contractTool.
 *
 * Remnawave 3.x (changelog v3.0.0) dropped the user uuid: the identifier is a
 * numeric `id`, while the installed contract (2.7.x) still declares `uuid`, so
 * its RequestSchema cannot be reused for users. Shapes below follow upstream
 * libs/contract/commands/users and were verified against a live 3.3.x panel.
 *
 * Routes removed in 3.x (panel answers `Cannot GET ...`): by-telegram-id,
 * by-email, by-tag, by-subscription-uuid. Use users_list filters instead
 * (`filters: [{id: "telegramId", value: ...}]`).
 */

const ID_DESC =
    'Numeric user id. Panel 3.x dropped user uuid entirely — users_list returns `id`, and it is what every users_* route takes.';

const RESET_PERIODS = z.enum(RESET_PERIODS_VALUES as [string, ...string[]]);
const USER_STATUS = z.enum(USERS_STATUS_VALUES as [string, ...string[]]);
const ACTIVE_OR_DISABLED = z.enum(['ACTIVE', 'DISABLED']);

const USER_ID_LIST = z
    .array(z.number().int())
    .min(1)
    .max(500)
    .describe('Numeric user ids (1..500 per call)');

// Shared profile fields used by create/update/bulk.
const userFields = {
    trafficLimitBytes: z.number().min(0).optional().describe('Traffic limit in bytes (0 = unlimited)'),
    trafficLimitStrategy: RESET_PERIODS.optional().describe('Traffic reset period'),
    expireAt: z.string().optional().describe('Expiration date, ISO 8601 (must be in the future)'),
    description: z.string().nullable().optional().describe('Free-form description'),
    tag: z
        .string()
        .regex(/^[A-Z0-9_]+$/)
        .max(16)
        .nullable()
        .optional()
        .describe('Tag: uppercase letters, digits, underscore; max 16'),
    telegramId: z.number().nullable().optional().describe('Telegram user id'),
    email: z.string().email().nullable().optional().describe('Email'),
    hwidDeviceLimit: z.number().int().min(0).nullable().optional().describe('Max HWID devices'),
    externalSquadUuid: z.string().uuid().nullable().optional().describe('External squad UUID'),
};

export function registerUserTools(server: McpServer, client: RemnawaveClient, readonly: boolean) {
    server.tool(
        'users_list',
        'List users with pagination and optional TanStack-style filters. To find users by telegramId, email, tag, status etc. (the dedicated by-* routes were removed in panel 3.x) pass filters, e.g. [{"id":"telegramId","value":123456789}].',
        {
            start: z.number().int().min(0).default(0).describe('Offset'),
            size: z.number().int().min(1).max(1000).default(25).describe('Page size (max 1000)'),
            filters: z
                .array(z.object({ id: z.string().describe('Column id, e.g. telegramId, email, tag, status, username'), value: z.unknown() }))
                .optional()
                .describe('Column filters'),
            filterModes: z.record(z.string()).optional().describe('Per-column filter mode, e.g. {"email":"contains"}'),
            sorting: z
                .array(z.object({ id: z.string(), desc: z.boolean().optional() }))
                .optional()
                .describe('Sort spec'),
        },
        async (params) => {
            try {
                return toolResult(await client.getUsers(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_get',
        'Get a user by their numeric id',
        { id: z.number().int().describe(ID_DESC) },
        async ({ id }) => {
            try {
                return toolResult(await client.getUserById(id));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_get_by_username',
        'Get a user by username',
        { username: z.string().describe('Username') },
        async ({ username }) => {
            try {
                return toolResult(await client.getUserByUsername(username));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_get_by_short_uuid',
        'Get a user by their subscription short UUID',
        { shortUuid: z.string().describe('Short UUID (the token in the subscription URL)') },
        async ({ shortUuid }) => {
            try {
                return toolResult(await client.getUserByShortUuid(shortUuid));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool('users_tags_list', 'List all user tags', {}, async () => {
        try {
            return toolResult(await client.getUserTags());
        } catch (e) {
            return toolError(e);
        }
    });

    server.tool(
        'users_resolve',
        'Resolve a user by EXACTLY ONE of: id, shortUuid, username',
        {
            id: z.number().int().optional().describe(ID_DESC),
            shortUuid: z.string().optional().describe('Short UUID'),
            username: z.string().optional().describe('Username'),
        },
        async (params) => {
            try {
                const provided = [params.id, params.shortUuid, params.username].filter((v) => v !== undefined);
                if (provided.length !== 1) {
                    throw new Error('Exactly one of id, shortUuid, or username must be provided');
                }
                return toolResult(await client.resolveUsers(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_accessible_nodes',
        'Which nodes a user can actually reach: per node — config profile, active squads and their inbounds. Handy for debugging squad/inbound routing.',
        { id: z.number().int().describe(ID_DESC) },
        async ({ id }) => {
            try {
                return toolResult(await client.getUserAccessibleNodes(id));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    if (readonly) return;

    server.tool(
        'users_create',
        'Create a user. Credentials (vlessUuid/ssPassword/trojanPassword/shortUuid) are generated by the panel unless given — pass them explicitly for service users (e.g. SS cascade tunnels).',
        {
            ...userFields,
            username: z.string().describe('Unique username'),
            // after the spread so the required version overrides the optional one
            expireAt: z.string().describe('Expiration date, ISO 8601'),
            status: USER_STATUS.optional().describe('Initial status'),
            shortUuid: z.string().optional().describe('Subscription short UUID (auto if omitted)'),
            vlessUuid: z.string().uuid().optional().describe('VLESS client UUID (auto if omitted)'),
            ssPassword: z.string().optional().describe('Shadowsocks password (auto if omitted)'),
            trojanPassword: z.string().optional().describe('Trojan password (auto if omitted)'),
            createdAt: z.string().optional().describe('Override creation timestamp, ISO 8601'),
            lastTrafficResetAt: z.string().optional().describe('Override last traffic reset, ISO 8601'),
            activeInternalSquads: z.array(z.string().uuid()).optional().describe('Internal squad UUIDs'),
        },
        async (params) => {
            try {
                return toolResult(await client.createUser(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_update',
        'Update a user. Identify by id OR username (at least one required).',
        {
            id: z.number().int().optional().describe(ID_DESC),
            username: z.string().optional().describe('Username (alternative identifier)'),
            status: ACTIVE_OR_DISABLED.optional().describe('Status (only ACTIVE/DISABLED can be set directly)'),
            activeInternalSquads: z.array(z.string().uuid()).optional().describe('Internal squad UUIDs (replaces the set)'),
            ...userFields,
        },
        async (params) => {
            try {
                if (params.id === undefined && params.username === undefined) {
                    throw new Error('At least one of id or username must be provided');
                }
                return toolResult(await client.updateUser(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_delete',
        'Permanently delete a user by numeric id',
        { id: z.number().int().describe(ID_DESC) },
        async ({ id }) => {
            try {
                await client.deleteUser(id);
                return toolResult({ success: true, message: `User ${id} deleted` });
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_enable',
        'Enable a disabled user (restore VPN access)',
        { id: z.number().int().describe(ID_DESC) },
        async ({ id }) => {
            try {
                return toolResult(await client.enableUser(id));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_disable',
        'Disable a user (block VPN access)',
        { id: z.number().int().describe(ID_DESC) },
        async ({ id }) => {
            try {
                return toolResult(await client.disableUser(id));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_revoke_subscription',
        'Revoke subscription (rotates the subscription link)',
        { id: z.number().int().describe(ID_DESC) },
        async ({ id }) => {
            try {
                return toolResult(await client.revokeUserSubscription(id));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_reset_traffic',
        'Reset traffic counter for a user',
        { id: z.number().int().describe(ID_DESC) },
        async ({ id }) => {
            try {
                return toolResult(await client.resetUserTraffic(id));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_extend_expiration',
        'Extend expiration date of one user by N days',
        {
            id: z.number().int().describe(ID_DESC),
            days: z.number().int().min(1).describe('Days to add'),
        },
        async ({ id, days }) => {
            try {
                return toolResult(await client.extendUserExpiration(id, { days }));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    // ---- bulk (selected users) ----

    server.tool(
        'users_bulk_delete_by_status',
        'Bulk delete ALL users with the given status',
        { status: USER_STATUS.describe('Status to delete') },
        async (params) => {
            try {
                return toolResult(await client.bulkDeleteUsersByStatus(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_bulk_update',
        'Bulk update selected users. Changed fields go under `fields`.',
        {
            userIds: USER_ID_LIST,
            fields: z
                .object({
                    status: USER_STATUS.optional(),
                    ...userFields,
                })
                .describe('Fields to set on every selected user'),
        },
        async (params) => {
            try {
                return toolResult(await client.bulkUpdateUsers(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_bulk_reset_traffic',
        'Bulk reset traffic for selected users',
        { userIds: USER_ID_LIST },
        async (params) => {
            try {
                return toolResult(await client.bulkResetUsersTraffic(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_bulk_revoke_subscription',
        'Bulk revoke subscriptions for selected users',
        { userIds: USER_ID_LIST },
        async (params) => {
            try {
                return toolResult(await client.bulkRevokeUsersSubscription(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_bulk_delete',
        'Bulk delete selected users',
        { userIds: USER_ID_LIST },
        async (params) => {
            try {
                return toolResult(await client.bulkDeleteUsers(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_bulk_update_squads',
        'Bulk replace internal squads for selected users',
        {
            userIds: USER_ID_LIST,
            activeInternalSquads: z.array(z.string().uuid()).describe('Squad UUIDs to assign'),
        },
        async (params) => {
            try {
                return toolResult(await client.bulkUpdateUserSquads(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool(
        'users_bulk_extend_expiration',
        'Bulk extend expiration for selected users',
        {
            userIds: USER_ID_LIST,
            extendDays: z.number().int().min(1).max(9999).describe('Days to add'),
        },
        async (params) => {
            try {
                return toolResult(await client.bulkExtendUsersExpiration(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    // ---- bulk-all (EVERY user) ----

    server.tool(
        'users_bulk_all_update',
        'Update EVERY user at once',
        {
            status: USER_STATUS.optional(),
            ...userFields,
        },
        async (params) => {
            try {
                return toolResult(await client.bulkAllUpdateUsers(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );

    server.tool('users_bulk_all_reset_traffic', 'Reset traffic for EVERY user', {}, async () => {
        try {
            return toolResult(await client.bulkAllResetUsersTraffic());
        } catch (e) {
            return toolError(e);
        }
    });

    server.tool(
        'users_bulk_all_extend_expiration',
        'Extend expiration for EVERY user',
        { extendDays: z.number().int().min(1).describe('Days to add') },
        async (params) => {
            try {
                return toolResult(await client.bulkAllExtendUsersExpiration(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );
}
