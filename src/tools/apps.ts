import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerAppsTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_apps",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "List all apps in your App Store Connect account",
    },
    async () => {
      const apps = await client.get("/v1/apps");
      return { content: [{ type: "text" as const, text: JSON.stringify(apps, null, 2) }] };
    },
  );

  server.registerTool(
    "get_app",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "Get details for a specific app by its App Store Connect ID",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const app = await client.get(`/v1/apps/${appId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(app, null, 2) }] };
    },
  );

  server.registerTool(
    "list_app_versions",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "List all App Store versions for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Filter by platform"),
      },
    },
    async ({ appId, platform }) => {
      const params: Record<string, string> = {};
      if (platform) params["filter[platform]"] = platform;
      const versions = await client.get(`/v1/apps/${appId}/appStoreVersions`, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(versions, null, 2) }] };
    },
  );
}
