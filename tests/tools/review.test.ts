import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReviewTools } from "../../src/tools/review.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

vi.mock("../../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-token"),
}));

describe("Review Tools", () => {
  let server: McpServer;
  let client: AppStoreConnectClient;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    client = new AppStoreConnectClient("issuer", "key", "/key.p8");
  });

  it("registers all review tools", () => {
    const spy = vi.spyOn(server, "registerTool");
    registerReviewTools({ server, client });

    const toolNames = spy.mock.calls.map((call) => call[0]);
    expect(toolNames).toContain("get_review_status");
    expect(toolNames).toContain("get_review_submission");
    expect(toolNames).toContain("list_app_store_version_localizations");
    expect(toolNames).toContain("submit_for_review");
  });
});
