import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerProductPagesTools({ server, client }: ToolContext): void {
  // --- Custom Product Pages ---

  server.registerTool(
    "list_custom_product_pages",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "List all custom product pages for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const pages = await client.get(`/v1/apps/${appId}/appCustomProductPages`);
      return { content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }] };
    },
  );

  server.registerTool(
    "create_custom_product_page",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Create a new custom product page for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        name: z.string().describe("Name of the custom product page"),
      },
    },
    async ({ appId, name }) => {
      const result = await client.post("/v1/appCustomProductPages", {
        data: {
          type: "appCustomProductPages",
          attributes: { name },
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "get_custom_product_page",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "Get details for a specific custom product page",
      inputSchema: {
        pageId: z.string().describe("The custom product page ID"),
      },
    },
    async ({ pageId }) => {
      const page = await client.get(`/v1/appCustomProductPages/${pageId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }] };
    },
  );

  server.registerTool(
    "update_custom_product_page",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Update a custom product page name or visibility",
      inputSchema: {
        pageId: z.string().describe("The custom product page ID"),
        name: z.string().optional().describe("New name"),
        visible: z.boolean().optional().describe("Whether the page is visible"),
      },
    },
    async ({ pageId, name, visible }) => {
      const attributes: Record<string, unknown> = {};
      if (name !== undefined) attributes.name = name;
      if (visible !== undefined) attributes.visible = visible;
      const result = await client.patch(`/v1/appCustomProductPages/${pageId}`, {
        data: { type: "appCustomProductPages", id: pageId, attributes },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Experiments (A/B Tests) ---

  server.registerTool(
    "list_experiments",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "List all A/B test experiments for an app store version",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
      },
    },
    async ({ versionId }) => {
      const experiments = await client.get(
        `/v2/appStoreVersions/${versionId}/appStoreVersionExperiments`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(experiments, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_experiment",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "Get details for a specific A/B test experiment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const experiment = await client.get(
        `/v2/appStoreVersionExperiments/${experimentId}`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(experiment, null, 2) }],
      };
    },
  );

  server.registerTool(
    "create_experiment",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Create a new A/B test experiment for an app store version",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
        name: z.string().describe("Experiment name"),
        trafficProportion: z
          .number()
          .min(0)
          .max(100)
          .describe("Percentage of traffic for the experiment (0-100)"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .describe("Platform for this experiment"),
      },
    },
    async ({ versionId, name, trafficProportion, platform }) => {
      const result = await client.post("/v2/appStoreVersionExperiments", {
        data: {
          type: "appStoreVersionExperiments",
          attributes: { name, trafficProportion, platform },
          relationships: {
            appStoreVersion: {
              data: { id: versionId, type: "appStoreVersions" },
            },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "start_experiment",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Start running an A/B test experiment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const result = await client.patch(
        `/v2/appStoreVersionExperiments/${experimentId}`,
        {
          data: {
            type: "appStoreVersionExperiments",
            id: experimentId,
            attributes: { state: "READY_FOR_REVIEW" },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "stop_experiment",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Stop a running A/B test experiment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const result = await client.patch(
        `/v2/appStoreVersionExperiments/${experimentId}`,
        {
          data: {
            type: "appStoreVersionExperiments",
            id: experimentId,
            attributes: { state: "STOPPED" },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "get_experiment_results",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Get results for an A/B test experiment including conversion rates per treatment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const treatments = await client.get(
        `/v2/appStoreVersionExperiments/${experimentId}/appStoreVersionExperimentTreatments`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(treatments, null, 2) }],
      };
    },
  );

  // --- App Store Version Localizations ---

  server.registerTool(
    "update_app_description",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Update the app description for a specific locale",
      inputSchema: {
        localizationId: z.string().describe("The app store version localization ID"),
        description: z.string().describe("New app description"),
      },
    },
    async ({ localizationId, description }) => {
      const result = await client.patch(
        `/v1/appStoreVersionLocalizations/${localizationId}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: localizationId,
            attributes: { description },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_whats_new",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Update the 'What's New' text for a specific locale",
      inputSchema: {
        localizationId: z.string().describe("The app store version localization ID"),
        whatsNew: z.string().describe("New 'What's New' text"),
      },
    },
    async ({ localizationId, whatsNew }) => {
      const result = await client.patch(
        `/v1/appStoreVersionLocalizations/${localizationId}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: localizationId,
            attributes: { whatsNew },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_keywords",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Update the keywords for a specific locale",
      inputSchema: {
        localizationId: z.string().describe("The app store version localization ID"),
        keywords: z.string().describe("Comma-separated keywords"),
      },
    },
    async ({ localizationId, keywords }) => {
      const result = await client.patch(
        `/v1/appStoreVersionLocalizations/${localizationId}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: localizationId,
            attributes: { keywords },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
