#!/usr/bin/env node
import { fileURLToPath } from "node:url";
const legacy = process.argv.includes("--legacy");
const { Client } = await import(
  legacy ? "mcp-sdk-v1/client/index.js" : "@modelcontextprotocol/client"
);
const { StdioClientTransport } = await import(
  legacy ? "mcp-sdk-v1/client/stdio.js" : "@modelcontextprotocol/client/stdio"
);

const client = new Client({ name: "asc-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./launch.mjs", import.meta.url))],
  env: Object.fromEntries(
    Object.entries(process.env).filter(([name, value]) =>
      /^(ASC_|APPLE_ADS_)/.test(name) && typeof value === "string",
    ),
  ),
  stderr: "pipe",
});
try {
  await client.connect(transport);
  const result = await client.listTools();
  if (!result.tools.some((t) => t.name === "list_apps"))
    throw new Error("Missing list_apps");
  if (
    result.tools.some((t) => typeof t.annotations?.readOnlyHint !== "boolean")
  ) {
    throw new Error("Tool annotations missing");
  }
  for (const name of [
    "search_api_operations",
    "write_api",
    "upload_build",
    "submit_beta_review",
  ]) {
    if (!result.tools.some((t) => t.name === name))
      throw new Error(`Missing ${name}`);
  }
  const catalog = await client.callTool({
    name: "search_api_operations",
    arguments: {},
  });
  if (catalog.isError) throw new Error("Catalog discovery failed");
  const metadata = JSON.parse(
    catalog.content.find((c) => c.type === "text").text,
  );
  console.log(
    JSON.stringify({
      legacy,
      server: client.getServerVersion(),
      toolCount: result.tools.length,
      operationCount: metadata.total,
      annotations: "present",
    }),
  );
  if (process.argv.includes("--live")) {
    const response = await client.callTool({
      name: "list_apps",
      arguments: {},
    });
    if (response.isError) throw new Error("list_apps returned an MCP error");
    const data = JSON.parse(
      response.content.find((c) => c.type === "text").text,
    );
    if (!Array.isArray(data))
      throw new Error("list_apps did not return an app array");
    console.log(JSON.stringify({ live: "ok", appCount: data.length }));
    const raw = await client.callTool({
      name: "read_api",
      arguments: { operationId: "apps_getCollection", query: { limit: 1 } },
    });
    if (
      raw.isError ||
      !Array.isArray(
        JSON.parse(raw.content.find((c) => c.type === "text").text).data,
      )
    )
      throw new Error("read_api live check failed");
    console.log(JSON.stringify({ rawRead: "ok" }));
  }
} finally {
  await client.close();
}
