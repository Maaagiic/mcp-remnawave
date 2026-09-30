import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Prompt texts name tools explicitly. test/prompts.test.mjs checks that every
 * tool named here still exists, so a renamed tool cannot leave a stale prompt.
 */
export const PROMPTS: Record<string, { description: string; args: z.ZodRawShape; text: (args: Record<string, string>) => string }> = {
    create_user_wizard: {
        description: 'Step-by-step guide to create a new VPN user',
        args: { username: z.string().describe('Username for the new user') },
        text: ({ username }) => `I want to create a new VPN user with username "${username}". Please guide me through the process:

1. First, check if the username is already taken using users_get_by_username
2. Get the list of available internal squads using squads_list
3. Create the user with users_create (ask me about traffic limit, expiration date, and which squads to assign)
4. Confirm the user was created successfully and show the subscription URL`,
    },

    node_diagnostics: {
        description: 'Diagnose issues with a specific node',
        args: { nodeUuid: z.string().describe('UUID of the node to diagnose') },
        text: ({ nodeUuid }) => `Please run diagnostics on node ${nodeUuid}:

1. Get node details using nodes_get
2. Check panel health using system_health
3. Get node metrics using system_nodes_metrics
4. Check recent traffic of the node using bandwidth_node_users
5. Summarize the node's status: connection state, xray version, uptime, traffic usage, online users
6. Flag any issues found (offline, high traffic usage, errors)`,
    },

    traffic_report: {
        description: 'Generate a traffic usage report',
        args: {
            startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
            endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
        },
        text: ({ startDate, endDate }) => `Generate a traffic report for the ${startDate && endDate ? `period from ${startDate} to ${endDate}` : 'current period'}:

1. Get overall system stats using system_stats
2. Get per-node traffic for the period using bandwidth_nodes_usage
3. Get node statistics using system_nodes_statistics
4. List users and their traffic using users_list
5. Provide a summary including:
   - Total traffic consumed
   - Per-node traffic breakdown
   - Top users by traffic consumption
   - Users who exceeded their traffic limits
   - Users with expired subscriptions`,
    },

    user_audit: {
        description: 'Complete audit of a specific user',
        args: { id: z.string().describe('Numeric user id') },
        text: ({ id }) => `Perform a complete audit of user ${id}:

1. Get full user details using users_get
2. Get subscription info using subscriptions_get_by_user_id
3. Get HWID devices using hwid_devices_list
4. Check which nodes the user can reach using users_accessible_nodes
5. Summarize:
   - Account status and expiration
   - Traffic usage vs limit
   - Subscription URL and last access
   - Connected devices (HWID)
   - Squad memberships
   - Any issues or concerns`,
    },

    bulk_user_cleanup: {
        description: 'Find and manage expired or inactive users',
        args: {},
        text: () => `Help me clean up users:

1. List users using users_list, filtering by status where possible
2. Identify:
   - Users with EXPIRED status
   - Users with DISABLED status
   - Users with LIMITED status (exceeded traffic)
   - Users who haven't connected recently
3. Present the findings in a clear table
4. Ask what action to take (disable, delete, extend, reset traffic)
5. Execute the chosen action only after I confirm`,
    },
};

export function registerPrompts(server: McpServer) {
    for (const [name, prompt] of Object.entries(PROMPTS)) {
        server.registerPrompt(name, { description: prompt.description, argsSchema: prompt.args }, (args) => ({
            messages: [{ role: 'user' as const, content: { type: 'text' as const, text: prompt.text(args as Record<string, string>) } }],
        }));
    }
}
