import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AppleAdsClient,
  AppleAdsError,
  DEFAULT_ADS_BASE_URL,
} from "../../src/api/ads-client.js";
import type { AppleAdsCredentials } from "../../src/auth/ads-oauth.js";

vi.mock("../../src/auth/ads-oauth.js", () => ({
  getAccessToken: vi.fn(() => Promise.resolve("mock-access-token")),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const credentials: AppleAdsCredentials = {
  clientId: "SEARCHADS.abc",
  teamId: "SEARCHADS.team",
  keyId: "key",
  privateKeyPath: "/ads-key.pem",
  adAccountId: "42",
};

function okJson(payload: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(payload) };
}

const POPULARITY_PATH = "/v1/insights/apps/search-term-popularity/query";

describe("AppleAdsClient", () => {
  let client: AppleAdsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AppleAdsClient(credentials);
  });

  it("builds the documented Platform API URL", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ data: [] }));

    await client.query(POPULARITY_PATH);

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.ads.apple.com/v1/insights/apps/search-term-popularity/query",
    );
  });

  it("sends the bearer token and adAccountId context header", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ data: { id: 1 } }));

    await client.get("/v1/acls");

    expect(mockFetch).toHaveBeenCalledWith(
      `${DEFAULT_ADS_BASE_URL}/v1/acls`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-access-token",
          // Platform API 1.0 scopes by ad account, not orgId as v4/v5 did.
          "X-AP-Context": "adAccountId=42",
        }),
      }),
    );
  });

  it("unwraps the data envelope", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ data: { id: 7, name: "Acct" }, error: null }));

    expect(await client.get("/v1/acls")).toEqual({ id: 7, name: "Acct" });
  });

  it("appends query parameters", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ data: [] }));

    await client.get("/v1/acls", { limit: "5" });

    expect(mockFetch.mock.calls[0][0]).toBe(`${DEFAULT_ADS_BASE_URL}/v1/acls?limit=5`);
  });

  it("honours a custom base URL and strips its trailing slash", async () => {
    const custom = new AppleAdsClient(credentials, "https://sandbox.example.com/");
    mockFetch.mockResolvedValueOnce(okJson({ data: {} }));

    await custom.get("/v1/acls");

    expect(mockFetch.mock.calls[0][0]).toBe("https://sandbox.example.com/v1/acls");
  });

  describe("error handling", () => {
    it("surfaces the message from an errors array", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { errors: [{ messageCode: "UNAUTHORIZED", message: "Invalid ad account" }] },
          }),
      });

      await expect(client.get("/v1/acls")).rejects.toThrow(/Invalid ad account/);
    });

    it("falls back to a top-level message field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: "timeRange is required" } }),
      });

      await expect(client.query(POPULARITY_PATH)).rejects.toThrow(/timeRange is required/);
    });

    it("treats an error envelope on a 200 as a failure", async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          data: null,
          error: { errors: [{ messageCode: "INVALID_INPUT", message: "Bad filter" }] },
        }),
      );

      await expect(client.query(POPULARITY_PATH)).rejects.toThrow(/Bad filter/);
    });

    it("preserves the HTTP status on the thrown error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { message: "Forbidden" } }),
      });

      await expect(client.get("/v1/acls")).rejects.toMatchObject({
        name: "AppleAdsError",
        status: 403,
      });
    });
  });

  describe("rate limiting", () => {
    it("retries after Retry-After on 429", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "0" }),
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce(okJson({ data: { id: 1 } }));

      expect(await client.get("/v1/acls")).toEqual({ id: 1 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("gives up after 5 retries rather than looping forever", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "0" }),
        json: () => Promise.resolve({}),
      });

      await expect(client.get("/v1/acls")).rejects.toThrow(AppleAdsError);
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });
  });

  describe("query", () => {
    it("merges pagination into the caller's body", async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          data: [{ searchTerm: "meal tracker", searchPopularity1to5: 4 }],
          pagination: { totalResults: 1 },
        }),
      );

      const result = await client.query(POPULARITY_PATH, {
        timeRange: { start: "2026-08-02", end: "2026-08-08", granularity: "WEEKLY_SUN_SAT" },
        fields: ["searchPopularity1to5"],
      });

      expect(result.items).toEqual([{ searchTerm: "meal tracker", searchPopularity1to5: 4 }]);
      expect(result.totalResults).toBe(1);

      const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sent.fields).toEqual(["searchPopularity1to5"]);
      expect(sent.timeRange.granularity).toBe("WEEKLY_SUN_SAT");
      expect(sent.pagination).toEqual({ offset: 0, pageSize: 5000 });
    });

    it("walks the offset cursor across pages", async () => {
      const fullPage = Array.from({ length: 5000 }, (_, i) => ({ n: i }));
      mockFetch
        .mockResolvedValueOnce(okJson({ data: fullPage, pagination: { totalResults: 5002 } }))
        .mockResolvedValueOnce(
          okJson({ data: [{ n: 5000 }, { n: 5001 }], pagination: { totalResults: 5002 } }),
        );

      const result = await client.query(POPULARITY_PATH);

      expect(result.items).toHaveLength(5002);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(mockFetch.mock.calls[1][1].body).pagination).toEqual({
        offset: 5000,
        pageSize: 5000,
      });
    });

    it("stops at the requested limit", async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({ data: [{ n: 1 }, { n: 2 }], pagination: { totalResults: 500 } }),
      );

      const result = await client.query(POPULARITY_PATH, {}, 2);

      expect(result.items).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).pagination.pageSize).toBe(2);
    });
  });
});
