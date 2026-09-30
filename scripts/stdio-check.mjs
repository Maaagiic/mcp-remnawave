// End-to-end check over stdio, the way an MCP client launches the server (run `npm run build` first).
//   node scripts/stdio-check.mjs <dir with .remnawave.env or .env>
//   node scripts/stdio-check.mjs --docker <env file>      (image built as remnawave-mcp)
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [first, second] = process.argv.slice(2);
const transport =
    first === '--docker'
        ? new StdioClientTransport({ command: 'docker', args: ['run', '-i', '--rm', '--env-file', second, 'remnawave-mcp'] })
        : new StdioClientTransport({ command: 'node', args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))], cwd: first });

const client = new Client({ name: 'stdio-check', version: '0' });
await client.connect(transport);
const { tools } = await client.listTools();
const metadata = JSON.parse((await client.callTool({ name: 'system_metadata', arguments: {} })).content[0].text).response;
const server = client.getServerVersion();
console.log(`${server.name} ${server.version}: ${tools.length} tools, panel ${metadata.version}`);
console.log(client.getInstructions());
await client.close();
