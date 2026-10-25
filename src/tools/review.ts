import { z } from "zod";
import type { ToolContext } from "../types/index.js";
import { submitVersionReview } from "../api/review.js";

export function registerReviewTools({ server, client }: ToolContext): void {
  server.registerTool(
    "get_review_status",
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description: "Get the current review status for an app store version",
      inputSchema: z.object({
        versionId: z.string().describe("The app store version ID"),
      }),
    },
    async ({ versionId }) => {
      const version = await client.get(`/v1/appStoreVersions/${versionId}`);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(version, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "get_review_submission",
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get the latest review submission for an app, including rejection reasons if any",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Filter by platform"),
      }),
    },
    async ({ appId, platform }) => {
      const params: Record<string, string> = { "filter[app]": appId };
      if (platform) params["filter[platform]"] = platform;
      const submissions = await client.get("/v1/reviewSubmissions", params);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(submissions, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "list_app_store_version_localizations",
    {
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "List localizations for an app store version (descriptions, what's new, keywords per locale)",
      inputSchema: z.object({
        versionId: z.string().describe("The app store version ID"),
      }),
    },
    async ({ versionId }) => {
      const localizations = await client.get(
        `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(localizations, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "submit_for_review",
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      description:
        "Submit an app version for App Store review: resolve/reuse a draft submission, attach the version and set submitted=true. Separate from TestFlight beta review. On failure inspect and resume the returned submission ID.",
      inputSchema: z.object({
        appId: z.string().describe("The App Store Connect app ID"),
        versionId: z
          .string()
          .optional()
          .describe(
            "Explicit app version ID; otherwise resolves one editable version",
          ),
        submissionId: z
          .string()
          .optional()
          .describe("Existing draft submission ID to resume"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Platform to submit for"),
      }),
    },
    async ({ appId, platform, versionId, submissionId }) => {
      const result = await submitVersionReview(client, {
        appId,
        platform,
        versionId,
        submissionId,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
