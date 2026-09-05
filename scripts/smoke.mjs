#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const client = new Client({ name: 'asc-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./launch.mjs', import.meta.url))],
  stderr: 'pipe',
});
try {
  await client.connect(transport);
  const result = await client.listTools();
  if (!result.tools.some(t => t.name === 'list_apps')) throw new Error('Missing list_apps');
  if (result.tools.some(t => typeof t.annotations?.readOnlyHint !== 'boolean')) {
    throw new Error('Tool annotations missing');
  }
  console.log(JSON.stringify({ toolCount: result.tools.length, annotations: 'present' }));
  if (process.argv.includes('--live')) {
    const response = await client.callTool({ name: 'list_apps', arguments: {} });
    if (response.isError) throw new Error('list_apps returned an MCP error');
    const data = JSON.parse(response.content.find(c => c.type === 'text').text);
    if (!Array.isArray(data)) throw new Error('list_apps did not return an app array');
    console.log(JSON.stringify({ live: 'ok', appCount: data.length }));
  }
} finally {
  await client.close();
}
