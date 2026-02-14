import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerReviewTools({ server, client }: ToolContext): void {
  server.registerTool(
    "get_review_status",
    {
      description: "Get the current review status for an app store version",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
      },
    },
    async ({ versionId }) => {
      const version = await client.get(`/v1/appStoreVersions/${versionId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(version, null, 2) }] };
    },
  );

  server.registerTool(
    "get_review_submission",
    {
      description:
        "Get the latest review submission for an app, including rejection reasons if any",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Filter by platform"),
      },
    },
    async ({ appId, platform }) => {
      const params: Record<string, string> = { "filter[app]": appId };
      if (platform) params["filter[platform]"] = platform;
      const submissions = await client.get("/v1/reviewSubmissions", params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(submissions, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_app_store_version_localizations",
    {
      description:
        "List localizations for an app store version (descriptions, what's new, keywords per locale)",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
      },
    },
    async ({ versionId }) => {
      const localizations = await client.get(
        `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(localizations, null, 2) }],
      };
    },
  );

  server.registerTool(
    "submit_for_review",
    {
      description: "Submit an app version for App Store review",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Platform to submit for"),
      },
    },
    async ({ appId, platform }) => {
      const body: Record<string, unknown> = {
        data: {
          type: "reviewSubmissions",
          attributes: platform ? { platform } : {},
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      };
      const result = await client.post("/v1/reviewSubmissions", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
