import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerIapTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_iaps",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "List all in-app purchases for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const iaps = await client.get(`/v1/apps/${appId}/inAppPurchasesV2`);
      return { content: [{ type: "text" as const, text: JSON.stringify(iaps, null, 2) }] };
    },
  );

  server.registerTool(
    "get_iap",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "Get details for a specific in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      const iap = await client.get(`/v2/inAppPurchases/${iapId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(iap, null, 2) }] };
    },
  );

  server.registerTool(
    "create_iap",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Create a new in-app purchase",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        name: z.string().describe("Reference name for the IAP"),
        productId: z.string().describe("Product ID (e.g. com.app.gems_pack)"),
        inAppPurchaseType: z
          .enum(["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"])
          .describe("Type of in-app purchase"),
      },
    },
    async ({ appId, name, productId, inAppPurchaseType }) => {
      const result = await client.post("/v2/inAppPurchases", {
        data: {
          type: "inAppPurchases",
          attributes: { name, productId, inAppPurchaseType },
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_iap",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Update an existing in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
        name: z.string().optional().describe("New reference name"),
        reviewNote: z.string().optional().describe("Review notes for App Review"),
      },
    },
    async ({ iapId, name, reviewNote }) => {
      const attributes: Record<string, string> = {};
      if (name) attributes.name = name;
      if (reviewNote) attributes.reviewNote = reviewNote;
      const result = await client.patch(`/v2/inAppPurchases/${iapId}`, {
        data: { type: "inAppPurchases", id: iapId, attributes },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "delete_iap",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Delete a draft in-app purchase (only works if not yet submitted for review)",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      await client.delete(`/v2/inAppPurchases/${iapId}`);
      return {
        content: [
          { type: "text" as const, text: `In-app purchase ${iapId} deleted successfully` },
        ],
      };
    },
  );

  server.registerTool(
    "list_iap_localizations",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description: "List localizations (display names, descriptions) for an in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      const localizations = await client.get(
        `/v2/inAppPurchases/${iapId}/inAppPurchaseLocalizations`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(localizations, null, 2) }],
      };
    },
  );

  server.registerTool(
    "set_iap_localization",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Create or update a localization for an in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID (used for creating new localizations)"),
        localizationId: z
          .string()
          .optional()
          .describe("Existing localization ID (provide to update instead of create)"),
        locale: z.string().describe("Locale code (e.g. en-US, de-DE)"),
        name: z.string().describe("Display name for this locale"),
        description: z.string().optional().describe("Description for this locale"),
      },
    },
    async ({ iapId, localizationId, locale, name, description }) => {
      if (localizationId) {
        const result = await client.patch(
          `/v1/inAppPurchaseLocalizations/${localizationId}`,
          {
            data: {
              type: "inAppPurchaseLocalizations",
              id: localizationId,
              attributes: { name, description },
            },
          },
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      const result = await client.post("/v1/inAppPurchaseLocalizations", {
        data: {
          type: "inAppPurchaseLocalizations",
          attributes: { locale, name, description },
          relationships: {
            inAppPurchaseV2: { data: { id: iapId, type: "inAppPurchases" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "set_iap_price",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Set or update the price for an in-app purchase using a price point ID",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
        pricePointId: z
          .string()
          .describe("The price point ID (get available price points via the API)"),
      },
    },
    async ({ iapId, pricePointId }) => {
      const result = await client.post(
        `/v2/inAppPurchases/${iapId}/pricePoints`,
        {
          data: {
            type: "inAppPurchasePricePoints",
            relationships: {
              inAppPurchasePricePoint: {
                data: { id: pricePointId, type: "inAppPurchasePricePoints" },
              },
            },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "submit_iap_for_review",
    {
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      description: "Submit an in-app purchase for review independently of the app version",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      const result = await client.post("/v1/inAppPurchaseSubmissions", {
        data: {
          type: "inAppPurchaseSubmissions",
          relationships: {
            inAppPurchaseV2: { data: { id: iapId, type: "inAppPurchases" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
