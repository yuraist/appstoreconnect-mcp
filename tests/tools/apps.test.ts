import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppsTools } from "../../src/tools/apps.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

vi.mock("../../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-token"),
}));

describe("Apps Tools", () => {
  let server: McpServer;
  let client: AppStoreConnectClient;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    client = new AppStoreConnectClient("issuer", "key", "/key.p8");
  });

  it("registers list_apps, get_app, and list_app_versions tools", () => {
    const spy = vi.spyOn(server, "registerTool");
    registerAppsTools({ server, client });

    const toolNames = spy.mock.calls.map((call) => call[0]);
    expect(toolNames).toContain("list_apps");
    expect(toolNames).toContain("get_app");
    expect(toolNames).toContain("list_app_versions");
  });
});
