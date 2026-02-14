import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProductPagesTools } from "../../src/tools/product-pages.js";
import { AppStoreConnectClient } from "../../src/api/client.js";

vi.mock("../../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-token"),
}));

describe("Product Pages Tools", () => {
  let server: McpServer;
  let client: AppStoreConnectClient;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.1" });
    client = new AppStoreConnectClient("issuer", "key", "/key.p8");
  });

  it("registers all product page and experiment tools", () => {
    const spy = vi.spyOn(server, "registerTool");
    registerProductPagesTools({ server, client });

    const toolNames = spy.mock.calls.map((call) => call[0]);
    expect(toolNames).toContain("list_custom_product_pages");
    expect(toolNames).toContain("create_custom_product_page");
    expect(toolNames).toContain("get_custom_product_page");
    expect(toolNames).toContain("update_custom_product_page");
    expect(toolNames).toContain("list_experiments");
    expect(toolNames).toContain("get_experiment");
    expect(toolNames).toContain("create_experiment");
    expect(toolNames).toContain("start_experiment");
    expect(toolNames).toContain("stop_experiment");
    expect(toolNames).toContain("get_experiment_results");
    expect(toolNames).toContain("update_app_description");
    expect(toolNames).toContain("update_whats_new");
    expect(toolNames).toContain("update_keywords");
  });
});
