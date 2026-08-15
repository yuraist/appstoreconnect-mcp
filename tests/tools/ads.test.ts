import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAdsTools } from "../../src/tools/ads.js";
import { AppleAdsClient } from "../../src/api/ads-client.js";

vi.mock("../../src/auth/ads-oauth.js", () => ({
  getAccessToken: vi.fn(() => Promise.resolve("mock-access-token")),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Apple Ads Tools", () => {
  let server: McpServer;
  let adsClient: AppleAdsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.1" });
    adsClient = new AppleAdsClient({
      clientId: "SEARCHADS.abc",
      teamId: "SEARCHADS.team",
      keyId: "key",
      privateKeyPath: "/ads-key.pem",
      adAccountId: "42",
    });
  });

  it("registers the Apple Ads tools", () => {
    const spy = vi.spyOn(server, "registerTool");
    registerAdsTools({ server, adsClient });

    const toolNames = spy.mock.calls.map((call) => call[0]);
    expect(toolNames).toContain("list_ad_accounts");
    expect(toolNames).toContain("get_search_term_popularity");
    expect(toolNames).toContain("get_keyword_suggestions");
    expect(toolNames).toContain("get_phrase_suggestions");
    expect(toolNames).toContain("get_impression_share");
  });

  describe("get_search_term_popularity", () => {
    // Pull the registered handler out so we can exercise the request it builds.
    function handlerFor(name: string) {
      const spy = vi.spyOn(server, "registerTool");
      registerAdsTools({ server, adsClient });
      const call = spy.mock.calls.find((c) => c[0] === name);
      return call![2] as (args: Record<string, unknown>) => Promise<unknown>;
    }

    it("builds the documented query body from the tool arguments", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ searchTerm: "calorie counter", rankInGenre: 3 }],
            pagination: { totalResults: 1 },
          }),
      });

      const handler = handlerFor("get_search_term_popularity");
      await handler({
        start: "2026-08-02",
        end: "2026-08-08",
        granularity: "WEEKLY_SUN_SAT",
        countryOrRegion: "US",
        genre: "Health & Fitness",
        sortBy: "rankInGenre",
        sortOrder: "ASC",
        limit: 50,
      });

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.ads.apple.com/v1/insights/apps/search-term-popularity/query",
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.timeRange).toEqual({
        start: "2026-08-02",
        end: "2026-08-08",
        granularity: "WEEKLY_SUN_SAT",
      });
      expect(body.filters).toEqual([
        { field: "countryOrRegion", operator: "EQUALS", value: "US" },
        { field: "genre", operator: "EQUALS", value: "Health & Fitness" },
      ]);
      expect(body.sorting).toEqual([{ field: "rankInGenre", order: "ASC" }]);
      expect(body.pagination).toEqual({ offset: 0, pageSize: 50 });
      // All four score fields are requested unless the caller narrows them.
      expect(body.fields).toEqual([
        "rankInGenre",
        "searchPopularityInGenre",
        "searchPopularity1to100",
        "searchPopularity1to5",
      ]);
    });

    it("omits filters entirely when none are supplied", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [], pagination: { totalResults: 0 } }),
      });

      const handler = handlerFor("get_search_term_popularity");
      await handler({
        start: "2026-08-02",
        end: "2026-08-08",
        granularity: "MONTHLY",
        sortOrder: "ASC",
        limit: 10,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filters).toBeUndefined();
      expect(body.sorting).toBeUndefined();
      expect(body.timeRange.granularity).toBe("MONTHLY");
    });

    it("returns the rows as JSON text content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ searchTerm: "meal planner", searchPopularity1to5: 4 }],
            pagination: { totalResults: 1 },
          }),
      });

      const handler = handlerFor("get_search_term_popularity");
      const result = (await handler({
        start: "2026-08-02",
        end: "2026-08-08",
        granularity: "WEEKLY_SUN_SAT",
        sortOrder: "ASC",
        limit: 10,
      })) as { content: Array<{ type: string; text: string }> };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.items).toEqual([{ searchTerm: "meal planner", searchPopularity1to5: 4 }]);
      expect(parsed.totalResults).toBe(1);
    });

    it("requires promotedObjectId filters on keyword suggestions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [], pagination: { totalResults: 0 } }),
      });

      const handler = handlerFor("get_keyword_suggestions");
      await handler({
        promotedObjectId: "1234567890",
        promotedObjectType: "APPSTORE_APP",
        countriesOrRegions: ["US", "GB"],
        limit: 25,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.filters).toContainEqual({
        field: "promotedObjectId",
        operator: "EQUALS",
        value: "1234567890",
      });
      expect(body.filters).toContainEqual({
        field: "countriesOrRegions",
        operator: "IN",
        value: ["US", "GB"],
      });
    });
  });
});
