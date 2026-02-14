import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppStoreConnectClient } from "../api/client.js";

export interface ToolContext {
  server: McpServer;
  client: AppStoreConnectClient;
}
