import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

export interface Config {
    baseUrl: string;
    apiToken: string;
    /** Sent as X-Api-Key (reverse proxy in front of the panel). */
    apiKey?: string;
    /** Register only tools that read from the panel. */
    readonly: boolean;
    /** Register tools that delete data or act on every user/node at once. */
    allowDestructive: boolean;
    /** Toolsets to register; undefined = all of them. */
    toolsets?: string[];
    /** Tool names to leave out; `*` is a wildcard. */
    excludeTools: string[];
    /** Per-request timeout for panel calls. */
    timeoutMs: number;
}

export class ConfigError extends Error {}

const DEFAULTS = {
    readonly: false,
    allowDestructive: true,
    excludeTools: [] as string[],
    timeoutMs: 30_000,
};

export function defineConfig(config: Pick<Config, 'baseUrl' | 'apiToken'> & Partial<Config>): Config {
    return { ...DEFAULTS, ...config, baseUrl: config.baseUrl.replace(/\/+$/, '') };
}

/**
 * One globally installed server, many panels. Panel config is taken from the
 * CURRENT project (MCP clients launch stdio servers with cwd = project root),
 * falling back to this package's own .env. The first file that provides both
 * the URL and the token wins; dotenv never overrides variables that are
 * already set, so env passed by the client registration has top priority.
 *
 * Returns the files that were considered, for the "not configured" error.
 */
export function loadEnvFiles(env: NodeJS.ProcessEnv = process.env): string[] {
    const candidates = [
        env.REMNAWAVE_ENV_FILE, // explicit file
        resolve(process.cwd(), '.remnawave.env'), // per-project (gitignore it)
        resolve(process.cwd(), '.env'), // per-project, shared .env
        fileURLToPath(new URL('../.env', import.meta.url)), // package .env (fallback)
    ].filter((path): path is string => !!path);

    for (const path of candidates) {
        if (!existsSync(path)) continue;
        loadDotenv({ path, quiet: true, override: false, processEnv: env as Record<string, string> });
        if (env.REMNAWAVE_BASE_URL && env.REMNAWAVE_API_TOKEN) break;
    }
    return candidates;
}

function list(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, searched: string[] = []): Config {
    const missing = ['REMNAWAVE_BASE_URL', 'REMNAWAVE_API_TOKEN'].filter((name) => !env[name]);
    if (missing.length) {
        const where = searched.length ? `\nLooked in the environment and in:\n${searched.map((p) => `  ${p}`).join('\n')}` : '';
        throw new ConfigError(`${missing.join(' and ')} must be set.${where}`);
    }

    const timeoutMs = Number(env.REMNAWAVE_TIMEOUT_MS ?? DEFAULTS.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new ConfigError(`REMNAWAVE_TIMEOUT_MS must be a positive number of milliseconds, got "${env.REMNAWAVE_TIMEOUT_MS}"`);
    }

    const toolsets = list(env.REMNAWAVE_TOOLSETS);
    return defineConfig({
        baseUrl: env.REMNAWAVE_BASE_URL!,
        apiToken: env.REMNAWAVE_API_TOKEN!,
        apiKey: env.REMNAWAVE_API_KEY || undefined,
        // Strict on purpose: only the literal "true" turns readonly on, only "false" turns destructive tools off.
        readonly: env.REMNAWAVE_READONLY === 'true',
        allowDestructive: env.REMNAWAVE_ALLOW_DESTRUCTIVE !== 'false',
        toolsets: toolsets.length ? toolsets : undefined,
        excludeTools: list(env.REMNAWAVE_TOOLS_EXCLUDE),
        timeoutMs,
    });
}
