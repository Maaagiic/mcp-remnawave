import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, loadEnvFiles } from './config.js';
import { createServer } from './server.js';

try {
    const config = loadConfig(process.env, loadEnvFiles());
    await createServer(config).connect(new StdioServerTransport());
} catch (e) {
    // stdout belongs to the MCP protocol; a startup failure must be readable on stderr
    // instead of surfacing in the client as a bare "Connection closed".
    console.error(`remnawave-mcp: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
}
