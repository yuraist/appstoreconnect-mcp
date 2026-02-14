import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBuildsTools } from "../../src/tools/builds.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

vi.mock("../../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-token"),
}));

describe("Builds Tools", () => {
  let server: McpServer;
  let client: AppStoreConnectClient;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    client = new AppStoreConnectClient("issuer", "key", "/key.p8");
  });

  it("registers all builds and TestFlight tools", () => {
    const spy = vi.spyOn(server, "registerTool");
    registerBuildsTools({ server, client });

    const toolNames = spy.mock.calls.map((call) => call[0]);
    expect(toolNames).toContain("list_builds");
    expect(toolNames).toContain("get_build");
    expect(toolNames).toContain("list_beta_groups");
    expect(toolNames).toContain("add_build_to_beta_group");
    expect(toolNames).toContain("list_beta_testers");
  });
});
