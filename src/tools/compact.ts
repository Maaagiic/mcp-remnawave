import type { Args, ToolOptions } from './contract.js';

type Json = Record<string, any>;

/**
 * List endpoints return whole objects, which is mostly noise for a model that
 * is looking for an id or a name. These tools answer compactly by default and
 * return the raw panel response with full=true.
 */
function compactable(what: string, compact: (result: unknown) => unknown): Pick<ToolOptions, 'extraInput' | 'transform'> {
    return {
        extraInput: { full: { type: 'boolean', description: `Return the raw panel response, including ${what}` } },
        transform: (result: unknown, { full }: Args) => (full ? result : compact(result)),
    };
}

function omitDeep(value: unknown, keys: Set<string>): unknown {
    if (Array.isArray(value)) return value.map((item) => omitDeep(item, keys));
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !keys.has(key))
            .map(([key, inner]) => [key, omitDeep(inner, keys)]),
    );
}

/** Drop the given keys at any depth: full xray configs and raw inbound objects dominate these responses. */
export const without = (...keys: string[]) => compactable(keys.join(', '), (result) => omitDeep(result, new Set(keys)));

/** A raw node is ~4 KB, mostly inbound objects and system info. */
export const compactNodes = compactable('inbound objects and full system info', (result) => {
    const nodes = (result as Json)?.response ?? result;
    if (!Array.isArray(nodes)) return result;
    return nodes.map((node: Json) => {
        const { configProfile, provider, system, integrationUuids, ips, providerUuid, ...rest } = node;
        const info = system?.info;
        const stats = system?.stats;
        return {
            ...rest,
            configProfile: configProfile && {
                activeConfigProfileUuid: configProfile.activeConfigProfileUuid,
                activeInbounds: (configProfile.activeInbounds ?? []).map((inbound: Json) => inbound.tag ?? inbound.uuid),
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
});
