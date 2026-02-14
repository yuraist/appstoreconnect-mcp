import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerBuildsTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_builds",
    {
      description: "List builds for an app, optionally filtered by version or processing state",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        version: z.string().optional().describe("Filter by version string"),
        processingState: z
          .enum(["PROCESSING", "FAILED", "INVALID", "VALID"])
          .optional()
          .describe("Filter by processing state"),
      },
    },
    async ({ appId, version, processingState }) => {
      const params: Record<string, string> = { "filter[app]": appId };
      if (version) params["filter[version]"] = version;
      if (processingState) params["filter[processingState]"] = processingState;
      const builds = await client.get("/v1/builds", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(builds, null, 2) }] };
    },
  );

  server.registerTool(
    "get_build",
    {
      description: "Get details for a specific build",
      inputSchema: {
        buildId: z.string().describe("The build ID"),
      },
    },
    async ({ buildId }) => {
      const build = await client.get(`/v1/builds/${buildId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(build, null, 2) }] };
    },
  );

  server.registerTool(
    "list_beta_groups",
    {
      description: "List TestFlight beta groups for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const params: Record<string, string> = { "filter[app]": appId };
      const groups = await client.get("/v1/betaGroups", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }] };
    },
  );

  server.registerTool(
    "add_build_to_beta_group",
    {
      description: "Assign a build to a TestFlight beta group",
      inputSchema: {
        betaGroupId: z.string().describe("The beta group ID"),
        buildId: z.string().describe("The build ID to add"),
      },
    },
    async ({ betaGroupId, buildId }) => {
      await client.post(`/v1/betaGroups/${betaGroupId}/relationships/builds`, {
        data: [{ id: buildId, type: "builds" }],
      });
      return {
        content: [
          { type: "text" as const, text: `Build ${buildId} added to beta group ${betaGroupId}` },
        ],
      };
    },
  );

  server.registerTool(
    "list_beta_testers",
    {
      description: "List TestFlight beta testers, optionally filtered by beta group",
      inputSchema: {
        betaGroupId: z.string().optional().describe("Filter by beta group ID"),
      },
    },
    async ({ betaGroupId }) => {
      const params: Record<string, string> = {};
      if (betaGroupId) params["filter[betaGroups]"] = betaGroupId;
      const testers = await client.get("/v1/betaTesters", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(testers, null, 2) }] };
    },
  );
}
