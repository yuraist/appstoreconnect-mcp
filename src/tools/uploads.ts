import { z } from "zod";
import {
  assetTypes,
  uploadBuild,
  uploadReservedAsset,
} from "../api/uploads.js";
import type { ToolContext } from "../types/index.js";
import { result, writeAnnotations } from "./api.js";

export function registerUploadTools({ server, client }: ToolContext) {
  server.registerTool(
    "upload_build",
    {
      description:
        "Upload a ready, signed local .ipa/.pkg/.zip using Apple's Build Upload API. Streams chunks and commits the checksum. Does not compile, sign, distribute or submit review. For large builds prefer the CLI to avoid host tool-call timeouts. On failure inspect returned reservation IDs before retrying.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        appId: z.string(),
        filePath: z
          .string()
          .describe(
            "Absolute path to the signed build on the MCP server's machine",
          ),
        version: z.string(),
        buildNumber: z.string(),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .default("IOS"),
      }),
    },
    async (input) => result(await uploadBuild(client, input)),
  );
  server.registerTool(
    "upload_reserved_asset",
    {
      description:
        "Upload a local file into an existing Apple reservation and commit its checksum. Supports screenshots, app previews, review attachments and build files. Create the reservation through write_api first; upload instructions are fetched directly from Apple.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        resourceType: z.enum(assetTypes),
        resourceId: z.string(),
        filePath: z.string(),
      }),
    },
    async ({ resourceType, resourceId, filePath }) =>
      result(
        await uploadReservedAsset(client, resourceType, resourceId, filePath),
      ),
  );
}
