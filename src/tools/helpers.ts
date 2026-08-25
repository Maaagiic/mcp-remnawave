import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function toolResult(data: unknown) {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}

export function toolError(error: unknown) {
    const message =
        error instanceof Error ? error.message : String(error);
    return {
        content: [
            {
                type: 'text' as const,
                text: `Error: ${message}`,
            },
        ],
        isError: true,
    };
}

/**
 * Register a tool whose input schema comes STRAIGHT from the Remnawave contract.
 *
 * Why: hand-written zod schemas drift from the real API. At one point 20 of 23
 * write tools accepted a truncated field set (e.g. `config_profiles_update` had
 * no `config` and could only rename a profile; `hosts_create` exposed 16 of 28
 * fields and lacked `inbound`). The MCP SDK silently drops anything not declared
 * in the schema, so such fields never reached the panel. The contract is the
 * single source of truth for request shapes, and tools follow contract bumps.
 *
 * IMPORTANT: never replace an object field with `z.any()`/`z.unknown()` — a
 * schema without `type` makes clients marshal the value as a JSON string and
 * the panel rejects it with `expected object, received string`.
 */
export function contractTool(
    server: McpServer,
    name: string,
    description: string,
    command: { RequestSchema: z.ZodObject<z.ZodRawShape> },
    handler: (params: Record<string, unknown>) => Promise<unknown>,
) {
    server.tool(
        name,
        description,
        command.RequestSchema.shape,
        async (params: Record<string, unknown>) => {
            try {
                return toolResult(await handler(params));
            } catch (e) {
                return toolError(e);
            }
        },
    );
}
