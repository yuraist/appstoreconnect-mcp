#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppStoreConnectClient } from "./api/client.js";
import { AppleAdsClient, DEFAULT_ADS_BASE_URL } from "./api/ads-client.js";
import { registerAdsTools } from "./tools/ads.js";
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
  version: "0.1.1",
});

const client = new AppStoreConnectClient(issuerId, keyId, privateKeyPath);

const ctx = { server, client };

registerAppsTools(ctx);
registerBuildsTools(ctx);
registerReviewTools(ctx);
registerIapTools(ctx);
registerSubscriptionsTools(ctx);
registerProductPagesTools(ctx);

// Apple Ads is a separate API with its own credentials, so its tools are
// optional — the server stays fully usable with App Store Connect alone.
const adsClientId = process.env.APPLE_ADS_CLIENT_ID;
const adsTeamId = process.env.APPLE_ADS_TEAM_ID;
const adsKeyId = process.env.APPLE_ADS_KEY_ID;
const adsPrivateKeyPath = process.env.APPLE_ADS_PRIVATE_KEY_PATH;

if (adsClientId && adsTeamId && adsKeyId && adsPrivateKeyPath) {
  const adsClient = new AppleAdsClient(
    {
      clientId: adsClientId,
      teamId: adsTeamId,
      keyId: adsKeyId,
      privateKeyPath: adsPrivateKeyPath,
      adAccountId: process.env.APPLE_ADS_AD_ACCOUNT_ID,
    },
    process.env.APPLE_ADS_BASE_URL || DEFAULT_ADS_BASE_URL,
  );

  registerAdsTools({ server, adsClient });

  if (!process.env.APPLE_ADS_AD_ACCOUNT_ID) {
    console.error(
      "Apple Ads: APPLE_ADS_AD_ACCOUNT_ID is not set. Run the list_ad_accounts tool to find it — " +
        "the other Apple Ads tools require it.",
    );
  }
} else {
  console.error(
    "Apple Ads tools disabled (set APPLE_ADS_CLIENT_ID, APPLE_ADS_TEAM_ID, APPLE_ADS_KEY_ID, " +
      "APPLE_ADS_PRIVATE_KEY_PATH to enable).",
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("App Store Connect MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
