import type { HttpMethod } from '../client.js';
import type { Config } from '../config.js';
import type { Tool } from './contract.js';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

/**
 * Escape hatch for endpoints the installed contract does not describe yet
 * (a panel newer than the contract). A raw write can do anything a
 * destructive tool can, so non-GET methods need both write mode and
 * REMNAWAVE_ALLOW_DESTRUCTIVE.
 */
export function rawRequestTool(config: Pick<Config, 'readonly' | 'allowDestructive'>): Tool {
    const writable = !config.readonly && config.allowDestructive;
    const methods = writable ? METHODS : (['GET'] as HttpMethod[]);
    return {
        name: 'api_request',
        kind: writable ? 'destructive' : 'read',
        description:
            'Send a raw request to the panel REST API with the configured token. Use it only for endpoints no dedicated tool covers. ' +
            (writable ? 'All methods are allowed.' : 'Only GET is allowed in this mode.'),
        inputSchema: {
            type: 'object',
            properties: {
                method: { type: 'string', enum: methods, default: 'GET' },
                path: { type: 'string', description: 'Path starting with /api/, e.g. /api/system/metadata' },
                query: { type: 'object', additionalProperties: true, description: 'Query parameters; objects and arrays are sent as JSON strings' },
                body: { type: 'object', additionalProperties: true, description: 'JSON request body' },
            },
            required: ['path'],
        },
        async run(args, client) {
            const method = String(args.method ?? 'GET').toUpperCase() as HttpMethod;
            const path = String(args.path ?? '');
            if (!methods.includes(method)) {
                throw new Error(`Method ${method} is not allowed: ${writable ? `use one of ${METHODS.join(', ')}` : 'the server is in readonly mode or destructive tools are off'}`);
            }
            if (!path.startsWith('/api/') || path.includes('..')) throw new Error('path must start with /api/');
            return client.request(method, path, {
                query: args.query as Record<string, unknown> | undefined,
                body: args.body,
            });
        },
    };
}
