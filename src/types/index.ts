import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppStoreConnectClient } from "../api/client.js";
import { AppleAdsClient } from "../api/ads-client.js";

export interface ToolContext {
  server: McpServer;
  client: AppStoreConnectClient;
}

/**
 * Apple Ads tools take their own client — the credentials are separate from
 * App Store Connect's and may not be configured at all.
 */
export interface AdsToolContext {
  server: McpServer;
  adsClient: AppleAdsClient;
}
