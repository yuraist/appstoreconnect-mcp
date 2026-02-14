import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIapTools } from "../../src/tools/iap.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

vi.mock("../../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-token"),
}));

describe("IAP Tools", () => {
  let server: McpServer;
  let client: AppStoreConnectClient;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    client = new AppStoreConnectClient("issuer", "key", "/key.p8");
  });

  it("registers all IAP tools", () => {
    const spy = vi.spyOn(server, "registerTool");
    registerIapTools({ server, client });

    const toolNames = spy.mock.calls.map((call) => call[0]);
    expect(toolNames).toContain("list_iaps");
    expect(toolNames).toContain("get_iap");
    expect(toolNames).toContain("create_iap");
    expect(toolNames).toContain("update_iap");
    expect(toolNames).toContain("delete_iap");
    expect(toolNames).toContain("list_iap_localizations");
    expect(toolNames).toContain("set_iap_localization");
    expect(toolNames).toContain("set_iap_price");
    expect(toolNames).toContain("submit_iap_for_review");
  });
});
