import { describe, it, expect, vi } from "vitest";
import { AppleCatalog } from "../../src/api/catalog.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

const catalog = new AppleCatalog();
const client = new AppStoreConnectClient("i", "k", "/unused");
const group = {
  data: {
    type: "betaGroups",
    attributes: { name: "External" },
    relationships: { app: { data: { type: "apps", id: "app" } } },
  },
};

describe("Apple OpenAPI execution", () => {
  it("covers every pinned operation and exposes request definitions without response bloat", () => {
    expect(catalog.search().total).toBe(1303);
    expect(
      catalog.search("betaGroups", "POST").operations.length,
    ).toBeGreaterThan(0);
    const d = catalog.describe("betaGroups_createInstance");
    expect(d.components.schemas.BetaGroupCreateRequest).toBeDefined();
    expect(d.components.schemas.BetaGroupResponse).toBeUndefined();
    expect(catalog.search("", undefined, 1300, 20).nextOffset).toBeNull();
  });
  it("validates enums, required relationships, parameters and email before network access", () => {
    expect(() =>
      catalog.prepare({
        operationId: "betaGroups_createInstance",
        body: group,
      }),
    ).not.toThrow();
    expect(() =>
      catalog.prepare({
        operationId: "betaGroups_createInstance",
        body: { data: { type: "betaGroups", attributes: { name: "X" } } },
      }),
    ).toThrow(/relationships/);
    expect(() =>
      catalog.prepare({
        operationId: "builds_updateInstance",
        path: { id: "build" },
        body: {
          data: {
            id: "build",
            type: "builds",
            attributes: { usesNonExemptEncryption: "false" },
          },
        },
      }),
    ).toThrow(/boolean/);
    expect(() =>
      catalog.prepare({
        operationId: "apps_getCollection",
        query: { limit: 999 },
      }),
    ).toThrow(/200/);
    expect(() =>
      catalog.prepare({
        operationId: "apps_getCollection",
        query: { fake: "x" },
      }),
    ).toThrow(/Unknown query/);
    expect(() => catalog.prepare({ operationId: "apps_getInstance" })).toThrow(
      /Missing path/,
    );
    expect(() => catalog.prepare({ operationId: "not_real" })).toThrow(
      /Unknown Apple/,
    );
  });
  it("encodes IDs, serializes array query parameters and supports pagination cursors", () => {
    const p = catalog.prepare({
      operationId: "apps_getInstance",
      path: { id: "a/b" },
      query: { include: ["builds", "betaGroups"] },
    });
    expect(p.url).toContain("/apps/a%2Fb?");
    expect(
      new URL(p.url, "https://example.com").searchParams.get("include"),
    ).toBe("builds,betaGroups");
    expect(
      catalog.prepare({
        operationId: "apps_getCollection",
        query: { cursor: "a+b" },
      }).url,
    ).toContain("cursor=a%2Bb");
    expect(() =>
      catalog.prepare({ operationId: "apps_getInstance", path: { id: ".." } }),
    ).toThrow(/Invalid path/);
  });
  it("separates read/write tools and never sends dry runs", async () => {
    const raw = vi.spyOn(client, "raw").mockResolvedValue({ data: [] });
    await expect(
      catalog.execute(
        client,
        { operationId: "betaGroups_createInstance", body: group },
        "read",
      ),
    ).rejects.toThrow(/write interface/);
    await expect(
      catalog.execute(client, { operationId: "apps_getCollection" }, "write"),
    ).rejects.toThrow(/read interface/);
    await expect(
      catalog.execute(
        client,
        { operationId: "betaGroups_createInstance", body: group },
        "write",
        true,
      ),
    ).resolves.toMatchObject({ dryRun: true, method: "POST" });
    expect(raw).not.toHaveBeenCalled();
    await catalog.execute(
      client,
      { operationId: "apps_getCollection", query: { limit: 1 } },
      "read",
    );
    expect(raw).toHaveBeenCalledWith("GET", "/v1/apps?limit=1", undefined);
  });
});
