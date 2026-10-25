import { z } from "zod";
import { getCatalog } from "../api/catalog.js";
import type { ToolContext } from "../types/index.js";

export const apiInput = {
  operationId: z
    .string()
    .describe("Exact operationId from search_api_operations"),
  path: z
    .record(z.string(), z.string())
    .optional()
    .describe("Path parameters, such as {id: resourceId}"),
  query: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    )
    .optional(),
  body: z
    .unknown()
    .optional()
    .describe("JSON:API request body matching get_api_operation"),
};
export const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
export const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};
export function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function registerApiTools({ server, client }: ToolContext) {
  server.registerTool(
    "search_api_operations",
    {
      description:
        "Search the complete official Apple App Store Connect OpenAPI catalog. Covers provisioning, users, TestFlight, releases, metadata, pricing, screenshots, analytics, Xcode Cloud and more. No network request.",
      annotations: readAnnotations,
      inputSchema: z.object({
        query: z.string().default(""),
        method: z.enum(["GET", "POST", "PATCH", "DELETE", "PUT"]).optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    async ({ query, method, offset, limit }) =>
      result(getCatalog().search(query, method, offset, limit)),
  );
  server.registerTool(
    "get_api_operation",
    {
      description:
        "Get exact parameters and request schemas, including referenced definitions, for an Apple operation before executing it. No network request.",
      annotations: readAnnotations,
      inputSchema: z.object({ operationId: z.string() }),
    },
    async ({ operationId }) => result(getCatalog().describe(operationId)),
  );
  server.registerTool(
    "read_api",
    {
      description:
        "Execute an official Apple GET operation after schema validation. Returns one unflattened JSON:API page with relationships, included resources and pagination links. Pass cursor from links.next for another page. Binary reports return base64.",
      annotations: readAnnotations,
      inputSchema: z.object(apiInput),
    },
    async (input) => result(await getCatalog().execute(client, input, "read")),
  );
  server.registerTool(
    "write_api",
    {
      description:
        "Execute a schema-validated official Apple POST/PATCH/DELETE operation. Changes production Apple data; only use within the user's authorized scope. dryRun validates without a network call. Cannot create a new app record: Apple requires its website.",
      annotations: writeAnnotations,
      inputSchema: z.object({
        ...apiInput,
        dryRun: z.boolean().default(false),
      }),
    },
    async ({ dryRun, ...input }) =>
      result(await getCatalog().execute(client, input, "write", dryRun)),
  );
}
