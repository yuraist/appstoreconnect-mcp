#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppStoreConnectClient } from "./api/client.js";
import { registerAppsTools } from "./tools/apps.js";
import { registerBuildsTools } from "./tools/builds.js";
import { registerReviewTools } from "./tools/review.js";
import { registerIapTools } from "./tools/iap.js";
import { registerSubscriptionsTools } from "./tools/subscriptions.js";
import { registerProductPagesTools } from "./tools/product-pages.js";

const issuerId = process.env.ASC_ISSUER_ID;
const keyId = process.env.ASC_KEY_ID;
const privateKeyPath = process.env.ASC_PRIVATE_KEY_PATH;

if (!issuerId || !keyId || !privateKeyPath) {
  console.error(
    "Missing required environment variables. Please set ASC_ISSUER_ID, ASC_KEY_ID, and ASC_PRIVATE_KEY_PATH.",
  );
  console.error("See .env.example for reference.");
  process.exit(1);
}

const server = new McpServer({
  name: "appstoreconnect-mcp",
  version: "0.1.0",
});

const client = new AppStoreConnectClient(issuerId, keyId, privateKeyPath);

const ctx = { server, client };

registerAppsTools(ctx);
registerBuildsTools(ctx);
registerReviewTools(ctx);
registerIapTools(ctx);
registerSubscriptionsTools(ctx);
registerProductPagesTools(ctx);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("App Store Connect MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
