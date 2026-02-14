import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerSubscriptionsTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_subscription_groups",
    {
      description: "List subscription groups for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const groups = await client.get(`/v1/apps/${appId}/subscriptionGroups`);
      return { content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }] };
    },
  );

  server.registerTool(
    "create_subscription_group",
    {
      description: "Create a new subscription group for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        referenceName: z.string().describe("Reference name for the subscription group"),
      },
    },
    async ({ appId, referenceName }) => {
      const result = await client.post("/v1/subscriptionGroups", {
        data: {
          type: "subscriptionGroups",
          attributes: { referenceName },
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "list_subscriptions",
    {
      description: "List subscriptions within a subscription group",
      inputSchema: {
        groupId: z.string().describe("The subscription group ID"),
      },
    },
    async ({ groupId }) => {
      const subs = await client.get(`/v1/subscriptionGroups/${groupId}/subscriptions`);
      return { content: [{ type: "text" as const, text: JSON.stringify(subs, null, 2) }] };
    },
  );

  server.registerTool(
    "create_subscription",
    {
      description: "Create a new auto-renewable subscription",
      inputSchema: {
        groupId: z.string().describe("The subscription group ID"),
        name: z.string().describe("Reference name"),
        productId: z.string().describe("Product ID (e.g. com.app.monthly)"),
        subscriptionPeriod: z
          .enum([
            "ONE_WEEK",
            "ONE_MONTH",
            "TWO_MONTHS",
            "THREE_MONTHS",
            "SIX_MONTHS",
            "ONE_YEAR",
          ])
          .describe("Subscription duration"),
      },
    },
    async ({ groupId, name, productId, subscriptionPeriod }) => {
      const result = await client.post("/v1/subscriptions", {
        data: {
          type: "subscriptions",
          attributes: { name, productId, subscriptionPeriod },
          relationships: {
            group: { data: { id: groupId, type: "subscriptionGroups" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_subscription",
    {
      description: "Update an existing subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
        name: z.string().optional().describe("New reference name"),
        reviewNote: z.string().optional().describe("Review note for App Review"),
      },
    },
    async ({ subscriptionId, name, reviewNote }) => {
      const attributes: Record<string, string> = {};
      if (name) attributes.name = name;
      if (reviewNote) attributes.reviewNote = reviewNote;
      const result = await client.patch(`/v1/subscriptions/${subscriptionId}`, {
        data: { type: "subscriptions", id: subscriptionId, attributes },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "set_subscription_localization",
    {
      description: "Create or update a localization for a subscription",
      inputSchema: {
        subscriptionId: z
          .string()
          .describe("The subscription ID (used for creating new localizations)"),
        localizationId: z
          .string()
          .optional()
          .describe("Existing localization ID (provide to update instead of create)"),
        locale: z.string().describe("Locale code (e.g. en-US)"),
        name: z.string().describe("Display name"),
        description: z.string().optional().describe("Description"),
      },
    },
    async ({ subscriptionId, localizationId, locale, name, description }) => {
      if (localizationId) {
        const result = await client.patch(
          `/v1/subscriptionLocalizations/${localizationId}`,
          {
            data: {
              type: "subscriptionLocalizations",
              id: localizationId,
              attributes: { name, description },
            },
          },
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      const result = await client.post("/v1/subscriptionLocalizations", {
        data: {
          type: "subscriptionLocalizations",
          attributes: { locale, name, description },
          relationships: {
            subscription: { data: { id: subscriptionId, type: "subscriptions" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "set_subscription_price",
    {
      description: "Set a price point for a subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
        pricePointId: z.string().describe("The subscription price point ID"),
        startDate: z
          .string()
          .optional()
          .describe("Start date for the price (YYYY-MM-DD), null for immediate"),
      },
    },
    async ({ subscriptionId, pricePointId, startDate }) => {
      const attributes: Record<string, unknown> = {};
      if (startDate) attributes.startDate = startDate;
      const result = await client.post(
        `/v1/subscriptions/${subscriptionId}/prices`,
        {
          data: {
            type: "subscriptionPrices",
            attributes,
            relationships: {
              subscriptionPricePoint: {
                data: { id: pricePointId, type: "subscriptionPricePoints" },
              },
            },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "list_subscription_offers",
    {
      description: "List promotional offers for a subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
      },
    },
    async ({ subscriptionId }) => {
      const offers = await client.get(
        `/v1/subscriptions/${subscriptionId}/promotionalOffers`,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(offers, null, 2) }] };
    },
  );

  server.registerTool(
    "create_subscription_offer",
    {
      description: "Create a promotional offer for a subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
        name: z.string().describe("Offer reference name"),
        offerCode: z.string().describe("Unique offer code"),
        duration: z
          .enum([
            "ONE_WEEK",
            "ONE_MONTH",
            "TWO_MONTHS",
            "THREE_MONTHS",
            "SIX_MONTHS",
            "ONE_YEAR",
          ])
          .describe("Offer duration"),
        offerMode: z
          .enum(["PAY_AS_YOU_GO", "PAY_UP_FRONT", "FREE_TRIAL"])
          .describe("Offer mode"),
        numberOfPeriods: z.number().describe("Number of periods for the offer"),
      },
    },
    async ({ subscriptionId, name, offerCode, duration, offerMode, numberOfPeriods }) => {
      const result = await client.post(
        `/v1/subscriptions/${subscriptionId}/promotionalOffers`,
        {
          data: {
            type: "subscriptionPromotionalOffers",
            attributes: { name, offerCode, duration, offerMode, numberOfPeriods },
            relationships: {
              subscription: { data: { id: subscriptionId, type: "subscriptions" } },
            },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
