import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppStoreConnectClient } from "../../src/api/client.js";

vi.mock("../../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-jwt-token"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("AppStoreConnectClient", () => {
  let client: AppStoreConnectClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AppStoreConnectClient("issuer-id", "key-id", "/key.p8");
  });

  it("makes GET requests with Authorization header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });

    await client.get("/v1/apps");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.appstoreconnect.apple.com/v1/apps",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-jwt-token",
        }),
      }),
    );
  });

  it("unwraps single JSON:API resource into flat object", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            id: "123",
            type: "apps",
            attributes: { name: "MyApp", bundleId: "com.test.app" },
          },
        }),
    });

    const result = await client.get("/v1/apps/123");
    expect(result).toEqual({
      id: "123",
      type: "apps",
      name: "MyApp",
      bundleId: "com.test.app",
    });
  });

  it("unwraps JSON:API collection into flat array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            { id: "1", type: "apps", attributes: { name: "App1" } },
            { id: "2", type: "apps", attributes: { name: "App2" } },
          ],
        }),
    });

    const result = await client.get("/v1/apps");
    expect(result).toEqual([
      { id: "1", type: "apps", name: "App1" },
      { id: "2", type: "apps", name: "App2" },
    ]);
  });

  it("follows pagination links", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ id: "1", type: "apps", attributes: { name: "App1" } }],
            links: { next: "https://api.appstoreconnect.apple.com/v1/apps?cursor=abc" },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [{ id: "2", type: "apps", attributes: { name: "App2" } }],
            links: {},
          }),
      });

    const result = await client.get("/v1/apps");
    expect(result).toEqual([
      { id: "1", type: "apps", name: "App1" },
      { id: "2", type: "apps", name: "App2" },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("makes POST requests with JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          data: { id: "new-1", type: "inAppPurchases", attributes: { name: "Gems" } },
        }),
    });

    const body = {
      data: {
        type: "inAppPurchases",
        attributes: { name: "Gems", productId: "com.test.gems" },
      },
    };
    const result = await client.post("/v2/inAppPurchases", body);
    expect(result).toEqual({ id: "new-1", type: "inAppPurchases", name: "Gems" });
  });

  it("throws structured error on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          errors: [
            {
              status: "409",
              code: "STATE_ERROR",
              title: "The request is not valid",
              detail: "This resource is in a state that does not allow this action.",
            },
          ],
        }),
    });

    await expect(client.get("/v1/apps/123")).rejects.toThrow(/409/);
  });

  it("handles rate limiting with Retry-After header", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "1" }),
        json: () => Promise.resolve({ errors: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: { id: "1", type: "apps", attributes: { name: "App1" } },
          }),
      });

    const result = await client.get("/v1/apps/1");
    expect(result).toEqual({ id: "1", type: "apps", name: "App1" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
