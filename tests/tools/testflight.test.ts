import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { AppStoreConnectClient } from "../../src/api/client.js";
import { registerTestFlightTools } from "../../src/tools/testflight.js";

describe("named TestFlight workflows", () => {
  it("executes each helper against its actual Apple schema", async () => {
    const server = new McpServer({ name: "test", version: "0" });
    const spy = vi.spyOn(server, "registerTool");
    const client = new AppStoreConnectClient("i", "k", "/unused");
    const raw = vi.spyOn(client, "raw").mockResolvedValue({ data: [] });
    registerTestFlightTools({ server, client });
    const calls = new Map(spy.mock.calls.map((c) => [c[0], c]));
    const cases: [string, Record<string, unknown>, string, string][] = [
      [
        "create_beta_group",
        {
          appId: "app",
          name: "External",
          isInternalGroup: false,
          publicLinkEnabled: true,
          publicLinkLimit: 100,
        },
        "POST",
        "/v1/betaGroups",
      ],
      [
        "update_beta_group",
        { betaGroupId: "group", publicLinkEnabled: false },
        "PATCH",
        "/v1/betaGroups/group",
      ],
      [
        "create_beta_tester",
        { email: "tester@example.com", betaGroupIds: ["group"] },
        "POST",
        "/v1/betaTesters",
      ],
      [
        "add_testers_to_beta_group",
        { betaGroupId: "group", betaTesterIds: ["tester"] },
        "POST",
        "/v1/betaGroups/group/relationships/betaTesters",
      ],
      [
        "remove_testers_from_beta_group",
        { betaGroupId: "group", betaTesterIds: ["tester"] },
        "DELETE",
        "/v1/betaGroups/group/relationships/betaTesters",
      ],
      [
        "submit_beta_review",
        { buildId: "build" },
        "POST",
        "/v1/betaAppReviewSubmissions",
      ],
      [
        "get_beta_review_status",
        { buildId: "build" },
        "GET",
        "/v1/betaAppReviewSubmissions?filter%5Bbuild%5D=build",
      ],
      [
        "set_build_export_compliance",
        { buildId: "build", usesNonExemptEncryption: false },
        "PATCH",
        "/v1/builds/build",
      ],
      [
        "set_beta_build_localization",
        { buildId: "build", locale: "en-US", whatsNew: "Test camera" },
        "POST",
        "/v1/betaBuildLocalizations",
      ],
      [
        "set_beta_build_localization",
        {
          buildId: "build",
          localizationId: "locale",
          locale: "en-US",
          whatsNew: "Test camera",
        },
        "PATCH",
        "/v1/betaBuildLocalizations/locale",
      ],
    ];
    for (const [name, input, method, url] of cases) {
      const handler = calls.get(name)![2] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
      await handler(input);
      expect(raw.mock.lastCall?.slice(0, 2)).toEqual([method, url]);
    }
  });
});
