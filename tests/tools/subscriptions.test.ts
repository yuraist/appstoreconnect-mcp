import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSubscriptionsTools } from "../../src/tools/subscriptions.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

vi.mock("../../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-token"),
}));

describe("Subscriptions Tools", () => {
  let server: McpServer;
  let client: AppStoreConnectClient;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    client = new AppStoreConnectClient("issuer", "key", "/key.p8");
  });

  it("registers all subscription tools", () => {
    const spy = vi.spyOn(server, "registerTool");
    registerSubscriptionsTools({ server, client });

    const toolNames = spy.mock.calls.map((call) => call[0]);
    expect(toolNames).toContain("list_subscription_groups");
    expect(toolNames).toContain("create_subscription_group");
    expect(toolNames).toContain("list_subscriptions");
    expect(toolNames).toContain("create_subscription");
    expect(toolNames).toContain("update_subscription");
    expect(toolNames).toContain("set_subscription_localization");
    expect(toolNames).toContain("set_subscription_price");
    expect(toolNames).toContain("list_subscription_offers");
    expect(toolNames).toContain("create_subscription_offer");
  });
});
