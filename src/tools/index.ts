import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { RemnawaveClient } from '../client.js';
import { ConfigError, type Config } from '../config.js';
import type { Tool } from './contract.js';
import { rawRequestTool } from './raw.js';
import { TOOLSETS } from './registry.js';

export const RAW_TOOLSET = 'raw';
export const TOOLSET_NAMES = [...Object.keys(TOOLSETS), RAW_TOOLSET];

type ToolAccess = Pick<Config, 'readonly' | 'allowDestructive' | 'toolsets' | 'excludeTools'>;

function globToRegExp(glob: string): RegExp {
    return new RegExp(`^${glob.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}

export interface ToolSelection {
    enabled: Tool[];
    /** Known tools that are switched off, with the reason — reported when a client calls one anyway. */
    disabled: Map<string, string>;
}

export function selectTools(config: ToolAccess): ToolSelection {
    const unknown = (config.toolsets ?? []).filter((name) => !TOOLSET_NAMES.includes(name));
    if (unknown.length) {
        throw new ConfigError(`Unknown toolset(s) in REMNAWAVE_TOOLSETS: ${unknown.join(', ')}. Available: ${TOOLSET_NAMES.join(', ')}`);
    }
    const excluded = config.excludeTools.map(globToRegExp);
    const enabled: Tool[] = [];
    const disabled = new Map<string, string>();

    const all: [string, Tool][] = [
        ...Object.entries(TOOLSETS).flatMap(([toolset, tools]) => tools.map((tool): [string, Tool] => [toolset, tool])),
        [RAW_TOOLSET, rawRequestTool(config)],
    ];
    for (const [toolset, tool] of all) {
        let reason: string | undefined;
        if (config.toolsets && !config.toolsets.includes(toolset)) {
            reason = `its toolset "${toolset}" is not listed in REMNAWAVE_TOOLSETS`;
        } else if (excluded.some((pattern) => pattern.test(tool.name))) {
            reason = 'it is excluded by REMNAWAVE_TOOLS_EXCLUDE';
        } else if (toolset !== RAW_TOOLSET && config.readonly && tool.kind !== 'read') {
            reason = 'the server runs in readonly mode (REMNAWAVE_READONLY=true)';
        } else if (toolset !== RAW_TOOLSET && !config.allowDestructive && tool.kind === 'destructive') {
            reason = 'destructive tools are switched off (REMNAWAVE_ALLOW_DESTRUCTIVE=false)';
        }
        if (reason) disabled.set(tool.name, reason);
        else enabled.push(tool);
    }
    return { enabled, disabled };
}

/**
 * Tools are served through the low-level request handlers rather than
 * McpServer.registerTool: the input schemas are JSON Schema taken from the
 * contract, and arguments must reach the panel exactly as the caller sent them.
 */
export function installTools(server: Server, client: RemnawaveClient, config: ToolAccess): ToolSelection {
    const selection = selectTools(config);
    const byName = new Map(selection.enabled.map((tool) => [tool.name, tool]));

    server.registerCapabilities({ tools: {} });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: selection.enabled.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as { type: 'object' },
            annotations: { readOnlyHint: tool.kind === 'read', destructiveHint: tool.kind === 'destructive' },
        })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args = {} } = request.params;
        const tool = byName.get(name);
        if (!tool) {
            const reason = selection.disabled.get(name);
            throw new McpError(ErrorCode.InvalidParams, reason ? `Tool ${name} is disabled: ${reason}` : `Unknown tool: ${name}`);
        }
        try {
            const result = await tool.run(args, client);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
        }
    });

    return selection;
}
