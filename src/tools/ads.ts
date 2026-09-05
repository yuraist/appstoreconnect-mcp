import { z } from "zod";
import type { AdsToolContext } from "../types/index.js";

/**
 * Apple Ads Platform API 1.0 tools, focused on the ASO use case: search term
 * popularity is first-party keyword demand data, which until August 2026 could
 * only be estimated by third-party ASO tools.
 */

const SEARCH_TERM_POPULARITY_PATH = "/v1/insights/apps/search-term-popularity/query";
const IMPRESSION_SHARE_PATH = "/v1/insights/apps/impression-share/query";
const KEYWORD_SUGGESTIONS_PATH = "/v1/suggestions/keywords/query";
const PHRASE_SUGGESTIONS_PATH = "/v1/suggestions/phrases/query";

const POPULARITY_FIELDS = [
  "rankInGenre",
  "searchPopularityInGenre",
  "searchPopularity1to100",
  "searchPopularity1to5",
] as const;

function asText(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function registerAdsTools({ server, adsClient }: AdsToolContext): void {
  server.registerTool(
    "list_ad_accounts",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "List the Apple Ads accounts your API credentials can access, with their ad account IDs. " +
        "Run this first — the ad account ID is required by every other Apple Ads tool and is what " +
        "APPLE_ADS_AD_ACCOUNT_ID should be set to.",
    },
    async () => {
      const acls = await adsClient.get("/v1/acls");
      return asText(acls);
    },
  );

  server.registerTool(
    "get_search_term_popularity",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Get Apple's first-party App Store search term popularity — the real keyword demand data " +
        "behind ASO, not a third-party estimate. Returns up to the top 500 search terms per " +
        "country and genre, with popularity scored 1-100 and 1-5. Only terms with at least 500 " +
        "searches are included. Weekly data covers the last 65 weeks; monthly the last 15 months. " +
        "No advertising campaign is required, but an Apple Ads account is.",
      inputSchema: {
        start: z
          .string()
          .describe("Start date, YYYY-MM-DD. For WEEKLY_SUN_SAT this must be a Sunday."),
        end: z
          .string()
          .describe("End date, YYYY-MM-DD. For WEEKLY_SUN_SAT this must be a Saturday."),
        granularity: z
          .enum(["WEEKLY_SUN_SAT", "MONTHLY"])
          .default("WEEKLY_SUN_SAT")
          .describe("Reporting period. Time zone is fixed to UTC by Apple."),
        countryOrRegion: z
          .string()
          .optional()
          .describe("ISO 3166-1 alpha-2 storefront code, e.g. US, GB, DE. Scoping is per storefront, not per language."),
        genre: z
          .string()
          .optional()
          .describe("App Store genre name, e.g. 'Health & Fitness'. Free text, not a fixed enum."),
        searchTerm: z
          .string()
          .optional()
          .describe("Restrict results to one exact search term."),
        fields: z
          .array(z.enum(POPULARITY_FIELDS))
          .optional()
          .describe(
            "Score fields to return. Defaults to all four. countryOrRegion, genre, searchTerm " +
              "and the period are always returned.",
          ),
        sortBy: z
          .enum(POPULARITY_FIELDS)
          .optional()
          .describe("Field to sort by. Defaults to Apple's genre ASC, rankInGenre ASC."),
        sortOrder: z.enum(["ASC", "DESC"]).default("ASC").describe("Sort direction."),
        limit: z
          .number()
          .int()
          .positive()
          .max(5000)
          .default(100)
          .describe("Maximum rows to return. Apple caps a single page at 5000."),
      },
    },
    async ({
      start,
      end,
      granularity,
      countryOrRegion,
      genre,
      searchTerm,
      fields,
      sortBy,
      sortOrder,
      limit,
    }) => {
      const filters: Array<Record<string, unknown>> = [];
      if (countryOrRegion) {
        filters.push({ field: "countryOrRegion", operator: "EQUALS", value: countryOrRegion });
      }
      if (genre) {
        filters.push({ field: "genre", operator: "EQUALS", value: genre });
      }
      if (searchTerm) {
        filters.push({ field: "searchTerm", operator: "EQUALS", value: searchTerm });
      }

      const body: Record<string, unknown> = {
        fields: fields ?? [...POPULARITY_FIELDS],
        timeRange: { start, end, granularity },
      };
      if (filters.length > 0) body.filters = filters;
      if (sortBy) body.sorting = [{ field: sortBy, order: sortOrder }];

      const result = await adsClient.query(SEARCH_TERM_POPULARITY_PATH, body, limit);
      return asText(result);
    },
  );

  server.registerTool(
    "get_keyword_suggestions",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Get Apple's suggested keywords for one of your apps, each with a popularity score of " +
        "0-100. Useful for discovering keywords to target or to put in your App Store keyword field.",
      inputSchema: {
        promotedObjectId: z
          .string()
          .describe("The adam ID of your app (its numeric App Store ID). Required by Apple."),
        promotedObjectType: z
          .enum(["APPSTORE_APP", "MAPS_APP"])
          .default("APPSTORE_APP")
          .describe("The kind of promoted object."),
        countriesOrRegions: z
          .array(z.string())
          .optional()
          .describe("ISO 3166-1 alpha-2 storefront codes to scope suggestions to."),
        terms: z
          .array(z.string())
          .optional()
          .describe("Optional seed terms to steer the suggestions."),
        limit: z.number().int().positive().max(5000).default(100).describe("Maximum rows."),
      },
    },
    async ({ promotedObjectId, promotedObjectType, countriesOrRegions, terms, limit }) => {
      const filters: Array<Record<string, unknown>> = [
        { field: "promotedObjectId", operator: "EQUALS", value: promotedObjectId },
        { field: "promotedObjectType", operator: "EQUALS", value: promotedObjectType },
      ];
      if (countriesOrRegions?.length) {
        filters.push({ field: "countriesOrRegions", operator: "IN", value: countriesOrRegions });
      }
      if (terms?.length) {
        filters.push({ field: "terms", operator: "IN", value: terms });
      }

      const result = await adsClient.query(KEYWORD_SUGGESTIONS_PATH, { filters }, limit);
      return asText(result);
    },
  );

  server.registerTool(
    "get_phrase_suggestions",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Get natural-language search phrases associated with an app or brand, or search existing " +
        "phrases by text. Complements get_keyword_suggestions for long-tail ASO research.",
      inputSchema: {
        queryType: z
          .enum(["SUGGESTION", "SEARCH"])
          .default("SUGGESTION")
          .describe("SUGGESTION derives phrases for an app; SEARCH matches phrases by text."),
        promotedObjectId: z
          .string()
          .optional()
          .describe("App adam ID. Required for queryType SUGGESTION."),
        phrase: z
          .string()
          .optional()
          .describe("Phrase text to match. Used with queryType SEARCH."),
        matchType: z
          .enum(["IN", "LIKE"])
          .default("LIKE")
          .describe("IN is an exact match, LIKE a partial match. Used with queryType SEARCH."),
        limit: z.number().int().positive().max(5000).default(100).describe("Maximum rows."),
      },
    },
    async ({ queryType, promotedObjectId, phrase, matchType, limit }) => {
      const filters: Array<Record<string, unknown>> = [];
      if (promotedObjectId) {
        filters.push({ field: "promotedObjectId", operator: "EQUALS", value: promotedObjectId });
      }
      if (phrase) {
        filters.push({ field: "phrase", operator: matchType, value: phrase });
      }

      const body: Record<string, unknown> = { queryType };
      if (filters.length > 0) body.filters = filters;

      const result = await adsClient.query(PHRASE_SUGGESTIONS_PATH, body, limit);
      return asText(result);
    },
  );

  server.registerTool(
    "get_impression_share",
    {
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      description:
        "Get your app's share of App Store search impressions for search terms, plus its rank " +
        "against competitors. Unlike search term popularity, this one does require a promoted app.",
      inputSchema: {
        promotedObjectId: z.string().describe("The adam ID of your app. Required by Apple."),
        start: z.string().describe("Start date, YYYY-MM-DD. For weekly, must be a Sunday."),
        end: z.string().describe("End date, YYYY-MM-DD."),
        granularity: z
          .enum(["DAILY", "WEEKLY_SUN_SAT"])
          .default("WEEKLY_SUN_SAT")
          .describe("DAILY covers at most 30 days; weekly at most the last 4 weeks."),
        countryOrRegion: z
          .string()
          .optional()
          .describe("ISO 3166-1 alpha-2 storefront code."),
        limit: z.number().int().positive().max(5000).default(100).describe("Maximum rows."),
      },
    },
    async ({ promotedObjectId, start, end, granularity, countryOrRegion, limit }) => {
      const filters: Array<Record<string, unknown>> = [
        { field: "promotedObjectId", operator: "EQUALS", value: promotedObjectId },
        { field: "promotedObjectType", operator: "EQUALS", value: "APPSTORE_APP" },
      ];
      if (countryOrRegion) {
        filters.push({ field: "countryOrRegion", operator: "EQUALS", value: countryOrRegion });
      }

      const result = await adsClient.query(
        IMPRESSION_SHARE_PATH,
        { filters, timeRange: { start, end, granularity } },
        limit,
      );
      return asText(result);
    },
  );
}
