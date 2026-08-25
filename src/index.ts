import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

// One globally installed server, many panels. Panel config is taken from the
// CURRENT project (MCP clients launch stdio servers with cwd = project root),
// falling back to this package's own .env. First file found wins; dotenv never
// overrides variables that are already set, so env passed explicitly by the MCP
// client registration has the highest priority.
const candidates = [
    process.env.REMNAWAVE_ENV_FILE, // explicit file
    resolve(process.cwd(), '.remnawave.env'), // per-project (gitignore it)
    resolve(process.cwd(), '.env'), // per-project, shared .env
    fileURLToPath(new URL('../.env', import.meta.url)), // package .env (fallback)
].filter((p): p is string => !!p);

for (const path of candidates) {
    if (existsSync(path)) {
        loadDotenv({ path, quiet: true, override: false });
        if (process.env.REMNAWAVE_BASE_URL && process.env.REMNAWAVE_API_TOKEN) break;
    }
}

const config = loadConfig();
const server = createServer(config);
const transport = new StdioServerTransport();

await server.connect(transport);
