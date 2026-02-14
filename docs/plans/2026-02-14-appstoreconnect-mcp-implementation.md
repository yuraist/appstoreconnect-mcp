# App Store Connect MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript MCP server wrapping App Store Connect API v2 with tools for apps, builds, review, IAPs, subscriptions, and product page optimization.

**Architecture:** MCP server using stdio transport. A central `AppStoreConnectClient` class handles JWT auth, JSON:API unwrapping, pagination, rate limiting, and retries. Each tool module registers tools on the `McpServer` instance and delegates API calls to the client.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk` v1.26+, `jsonwebtoken`, `dotenv`, `zod`, `vitest` for testing.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "appstoreconnect-mcp",
  "version": "0.1.0",
  "description": "MCP server for App Store Connect API",
  "type": "module",
  "bin": {
    "appstoreconnect-mcp": "./build/index.js"
  },
  "scripts": {
    "build": "tsc && chmod 755 build/index.js",
    "start": "node build/index.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "files": ["build"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "dotenv": "^16.4.0",
    "jsonwebtoken": "^9.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create .env.example**

```
ASC_ISSUER_ID=your-issuer-id
ASC_KEY_ID=your-key-id
ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
```

**Step 4: Create .gitignore**

```
node_modules/
build/
.env
*.p8
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated.

**Step 6: Verify TypeScript compiles**

Create a placeholder `src/index.ts`:

```typescript
#!/usr/bin/env node
console.error("appstoreconnect-mcp starting...");
```

Run: `npm run build`
Expected: `build/index.js` created with no errors.

**Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .env.example .gitignore src/index.ts
git commit -m "chore: scaffold project with TypeScript, MCP SDK, and dependencies"
```

---

### Task 2: JWT Auth Module

**Files:**
- Create: `src/auth/jwt.ts`
- Create: `tests/auth/jwt.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/auth/jwt.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateToken, resetTokenCache } from "../src/auth/jwt.js";
import jwt from "jsonwebtoken";
import fs from "node:fs";

// Mock a valid ES256 private key (generate a test one)
const TEST_PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIBkg4LVWM9nuwNSk3yByxZpYRTBnVJkMjiSFMN0P7GXaoAcGBSuBBAAi
oWQDYgAEY1GlPyRPrzIhfA8uss6qgFMD/oFGWQBG0bOXMTBgydSt0HPnPHELJwkj
2N0MjQYPjW3GU0sY+xGHyfnOsEoTf7Yx0SSMQQ8nBnSAcksHxM3wAqf0wNE5Eo0
kR7bkkrF
-----END EC PRIVATE KEY-----`;

describe("JWT Auth", () => {
  beforeEach(() => {
    resetTokenCache();
    vi.restoreAllMocks();
  });

  it("generates a valid JWT with correct claims", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(TEST_PRIVATE_KEY);

    const token = generateToken("issuer-123", "key-456", "/fake/path.p8");
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded?.header.alg).toBe("ES256");
    expect(decoded?.header.kid).toBe("key-456");
    expect(decoded?.header.typ).toBe("JWT");
    expect((decoded?.payload as jwt.JwtPayload).iss).toBe("issuer-123");
    expect((decoded?.payload as jwt.JwtPayload).aud).toBe("appstoreconnect-v1");
  });

  it("caches tokens and returns the same token within cache window", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(TEST_PRIVATE_KEY);

    const token1 = generateToken("issuer-123", "key-456", "/fake/path.p8");
    const token2 = generateToken("issuer-123", "key-456", "/fake/path.p8");

    expect(token1).toBe(token2);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when private key file is missing", () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(() => generateToken("issuer-123", "key-456", "/missing.p8")).toThrow(
      /Failed to read private key/
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/auth/jwt.test.ts`
Expected: FAIL — module `../src/auth/jwt.js` not found.

**Step 3: Write the implementation**

```typescript
// src/auth/jwt.ts
import jwt from "jsonwebtoken";
import fs from "node:fs";

let cachedToken: string | null = null;
let cachedTokenExpiry = 0;
let cachedPrivateKey: string | null = null;

const TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes

export function resetTokenCache(): void {
  cachedToken = null;
  cachedTokenExpiry = 0;
  cachedPrivateKey = null;
}

export function generateToken(
  issuerId: string,
  keyId: string,
  privateKeyPath: string,
): string {
  const now = Date.now();

  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  if (!cachedPrivateKey) {
    try {
      cachedPrivateKey = fs.readFileSync(privateKeyPath, "utf8");
    } catch (err) {
      throw new Error(
        `Failed to read private key at ${privateKeyPath}: ${(err as Error).message}`,
      );
    }
  }

  const nowSeconds = Math.floor(now / 1000);
  const token = jwt.sign({}, cachedPrivateKey, {
    algorithm: "ES256",
    expiresIn: "20m",
    issuer: issuerId,
    audience: "appstoreconnect-v1",
    header: {
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    },
  });

  cachedToken = token;
  cachedTokenExpiry = now + TOKEN_LIFETIME_MS;

  return token;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/auth/jwt.test.ts`
Expected: All 3 tests PASS.

Note: The test key is a valid EC P-384 key. If ES256 requires P-256 specifically, generate a proper test key during implementation:
```bash
openssl ecparam -name prime256v1 -genkey -noout -out /tmp/test-key.pem
```
Then read that in the test or inline the output. Adjust the test fixture key as needed to make the tests pass.

**Step 5: Commit**

```bash
git add src/auth/jwt.ts tests/auth/jwt.test.ts
git commit -m "feat: add JWT auth module with token caching"
```

---

### Task 3: API Client

**Files:**
- Create: `src/api/client.ts`
- Create: `tests/api/client.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/api/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppStoreConnectClient } from "../src/api/client.js";

// Mock the auth module
vi.mock("../src/auth/jwt.js", () => ({
  generateToken: vi.fn(() => "mock-jwt-token"),
}));

// Mock global fetch
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/client.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/api/client.ts
import { generateToken } from "../auth/jwt.js";

const BASE_URL = "https://api.appstoreconnect.apple.com";

export class AppStoreConnectError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Array<{ code: string; title: string; detail: string }> = [],
  ) {
    super(message);
    this.name = "AppStoreConnectError";
  }
}

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

interface JsonApiResponse {
  data: JsonApiResource | JsonApiResource[];
  links?: { next?: string };
  errors?: Array<{ status: string; code: string; title: string; detail: string }>;
}

function flatten(resource: JsonApiResource): Record<string, unknown> {
  return {
    id: resource.id,
    type: resource.type,
    ...resource.attributes,
  };
}

export class AppStoreConnectClient {
  private issuerId: string;
  private keyId: string;
  private privateKeyPath: string;

  constructor(issuerId: string, keyId: string, privateKeyPath: string) {
    this.issuerId = issuerId;
    this.keyId = keyId;
    this.privateKeyPath = privateKeyPath;
  }

  private getToken(): string {
    return generateToken(this.issuerId, this.keyId, this.privateKeyPath);
  }

  private async request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<JsonApiResponse> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getToken()}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "1", 10);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.request(method, url, body);
    }

    if (response.status === 204) {
      return { data: [] };
    }

    const json = (await response.json()) as JsonApiResponse;

    if (!response.ok) {
      const firstError = json.errors?.[0];
      throw new AppStoreConnectError(
        response.status,
        firstError?.code || "UNKNOWN",
        `App Store Connect API error (${response.status}): ${firstError?.detail || firstError?.title || "Unknown error"}`,
        json.errors || [],
      );
    }

    return json;
  }

  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    let url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const json = await this.request("GET", url);

    if (Array.isArray(json.data)) {
      let results = json.data.map(flatten);

      if (json.links?.next) {
        const nextResults = (await this.get(json.links.next)) as Record<string, unknown>[];
        results = results.concat(nextResults);
      }

      return results;
    }

    return flatten(json.data);
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const json = await this.request("POST", url, body);

    if (Array.isArray(json.data)) {
      return json.data.map(flatten);
    }
    return flatten(json.data);
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const json = await this.request("PATCH", url, body);

    if (Array.isArray(json.data)) {
      return json.data.map(flatten);
    }
    return flatten(json.data);
  }

  async delete(path: string): Promise<void> {
    const url = `${BASE_URL}${path}`;
    await this.request("DELETE", url);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/client.test.ts`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add src/api/client.ts tests/api/client.test.ts
git commit -m "feat: add App Store Connect API client with pagination, rate limiting, and error handling"
```

---

### Task 4: Shared Types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Write the types**

```typescript
// src/types/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AppStoreConnectClient } from "../api/client.js";

export interface ToolContext {
  server: McpServer;
  client: AppStoreConnectClient;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared types for tool context"
```

---

### Task 5: Apps Tools

**Files:**
- Create: `src/tools/apps.ts`
- Create: `tests/tools/apps.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/tools/apps.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppsTools } from "../src/tools/apps.js";
import { AppStoreConnectClient } from "../src/api/client.js";

vi.mock("../src/auth/jwt.js", () => ({
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/apps.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/tools/apps.ts
import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerAppsTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_apps",
    {
      description: "List all apps in your App Store Connect account",
    },
    async () => {
      const apps = await client.get("/v1/apps");
      return { content: [{ type: "text" as const, text: JSON.stringify(apps, null, 2) }] };
    },
  );

  server.registerTool(
    "get_app",
    {
      description: "Get details for a specific app by its App Store Connect ID",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const app = await client.get(`/v1/apps/${appId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(app, null, 2) }] };
    },
  );

  server.registerTool(
    "list_app_versions",
    {
      description: "List all App Store versions for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Filter by platform"),
      },
    },
    async ({ appId, platform }) => {
      const params: Record<string, string> = {};
      if (platform) params["filter[platform]"] = platform;
      const versions = await client.get(
        `/v1/apps/${appId}/appStoreVersions`,
        params,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(versions, null, 2) }] };
    },
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/apps.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/tools/apps.ts tests/tools/apps.test.ts
git commit -m "feat: add apps tools (list_apps, get_app, list_app_versions)"
```

---

### Task 6: Builds & TestFlight Tools

**Files:**
- Create: `src/tools/builds.ts`
- Create: `tests/tools/builds.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/tools/builds.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBuildsTools } from "../src/tools/builds.js";
import { AppStoreConnectClient } from "../src/api/client.js";

vi.mock("../src/auth/jwt.js", () => ({
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/builds.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/tools/builds.ts
import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerBuildsTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_builds",
    {
      description: "List builds for an app, optionally filtered by version or processing state",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        version: z.string().optional().describe("Filter by version string"),
        processingState: z
          .enum(["PROCESSING", "FAILED", "INVALID", "VALID"])
          .optional()
          .describe("Filter by processing state"),
      },
    },
    async ({ appId, version, processingState }) => {
      const params: Record<string, string> = { "filter[app]": appId };
      if (version) params["filter[version]"] = version;
      if (processingState) params["filter[processingState]"] = processingState;
      const builds = await client.get("/v1/builds", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(builds, null, 2) }] };
    },
  );

  server.registerTool(
    "get_build",
    {
      description: "Get details for a specific build",
      inputSchema: {
        buildId: z.string().describe("The build ID"),
      },
    },
    async ({ buildId }) => {
      const build = await client.get(`/v1/builds/${buildId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(build, null, 2) }] };
    },
  );

  server.registerTool(
    "list_beta_groups",
    {
      description: "List TestFlight beta groups for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const params: Record<string, string> = { "filter[app]": appId };
      const groups = await client.get("/v1/betaGroups", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }] };
    },
  );

  server.registerTool(
    "add_build_to_beta_group",
    {
      description: "Assign a build to a TestFlight beta group",
      inputSchema: {
        betaGroupId: z.string().describe("The beta group ID"),
        buildId: z.string().describe("The build ID to add"),
      },
    },
    async ({ betaGroupId, buildId }) => {
      await client.post(`/v1/betaGroups/${betaGroupId}/relationships/builds`, {
        data: [{ id: buildId, type: "builds" }],
      });
      return {
        content: [
          { type: "text" as const, text: `Build ${buildId} added to beta group ${betaGroupId}` },
        ],
      };
    },
  );

  server.registerTool(
    "list_beta_testers",
    {
      description: "List TestFlight beta testers, optionally filtered by beta group",
      inputSchema: {
        betaGroupId: z.string().optional().describe("Filter by beta group ID"),
      },
    },
    async ({ betaGroupId }) => {
      const params: Record<string, string> = {};
      if (betaGroupId) params["filter[betaGroups]"] = betaGroupId;
      const testers = await client.get("/v1/betaTesters", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(testers, null, 2) }] };
    },
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/builds.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/tools/builds.ts tests/tools/builds.test.ts
git commit -m "feat: add builds & TestFlight tools"
```

---

### Task 7: Review Tools

**Files:**
- Create: `src/tools/review.ts`
- Create: `tests/tools/review.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/tools/review.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReviewTools } from "../src/tools/review.js";
import { AppStoreConnectClient } from "../src/api/client.js";

vi.mock("../src/auth/jwt.js", () => ({
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/review.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/tools/review.ts
import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerReviewTools({ server, client }: ToolContext): void {
  server.registerTool(
    "get_review_status",
    {
      description: "Get the current review status for an app store version",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
      },
    },
    async ({ versionId }) => {
      const version = await client.get(`/v1/appStoreVersions/${versionId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(version, null, 2) }] };
    },
  );

  server.registerTool(
    "get_review_submission",
    {
      description:
        "Get the latest review submission for an app, including rejection reasons if any",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Filter by platform"),
      },
    },
    async ({ appId, platform }) => {
      const params: Record<string, string> = { "filter[app]": appId };
      if (platform) params["filter[platform]"] = platform;
      const submissions = await client.get("/v1/reviewSubmissions", params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(submissions, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_app_store_version_localizations",
    {
      description:
        "List localizations for an app store version (descriptions, what's new, keywords per locale)",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
      },
    },
    async ({ versionId }) => {
      const localizations = await client.get(
        `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(localizations, null, 2) }],
      };
    },
  );

  server.registerTool(
    "submit_for_review",
    {
      description: "Submit an app version for App Store review",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .optional()
          .describe("Platform to submit for"),
      },
    },
    async ({ appId, platform }) => {
      const body: Record<string, unknown> = {
        data: {
          type: "reviewSubmissions",
          attributes: platform ? { platform } : {},
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      };
      const result = await client.post("/v1/reviewSubmissions", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/review.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/tools/review.ts tests/tools/review.test.ts
git commit -m "feat: add review status and submission tools"
```

---

### Task 8: In-App Purchases Tools

**Files:**
- Create: `src/tools/iap.ts`
- Create: `tests/tools/iap.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/tools/iap.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIapTools } from "../src/tools/iap.js";
import { AppStoreConnectClient } from "../src/api/client.js";

vi.mock("../src/auth/jwt.js", () => ({
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/iap.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/tools/iap.ts
import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerIapTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_iaps",
    {
      description: "List all in-app purchases for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const iaps = await client.get(`/v1/apps/${appId}/inAppPurchasesV2`);
      return { content: [{ type: "text" as const, text: JSON.stringify(iaps, null, 2) }] };
    },
  );

  server.registerTool(
    "get_iap",
    {
      description: "Get details for a specific in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      const iap = await client.get(`/v2/inAppPurchases/${iapId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(iap, null, 2) }] };
    },
  );

  server.registerTool(
    "create_iap",
    {
      description: "Create a new in-app purchase",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        name: z.string().describe("Reference name for the IAP"),
        productId: z.string().describe("Product ID (e.g. com.app.gems_pack)"),
        inAppPurchaseType: z
          .enum(["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"])
          .describe("Type of in-app purchase"),
      },
    },
    async ({ appId, name, productId, inAppPurchaseType }) => {
      const result = await client.post("/v2/inAppPurchases", {
        data: {
          type: "inAppPurchases",
          attributes: { name, productId, inAppPurchaseType },
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_iap",
    {
      description: "Update an existing in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
        name: z.string().optional().describe("New reference name"),
        reviewNote: z.string().optional().describe("Review notes for App Review"),
      },
    },
    async ({ iapId, name, reviewNote }) => {
      const attributes: Record<string, string> = {};
      if (name) attributes.name = name;
      if (reviewNote) attributes.reviewNote = reviewNote;
      const result = await client.patch(`/v2/inAppPurchases/${iapId}`, {
        data: { type: "inAppPurchases", id: iapId, attributes },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "delete_iap",
    {
      description: "Delete a draft in-app purchase (only works if not yet submitted for review)",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      await client.delete(`/v2/inAppPurchases/${iapId}`);
      return {
        content: [
          { type: "text" as const, text: `In-app purchase ${iapId} deleted successfully` },
        ],
      };
    },
  );

  server.registerTool(
    "list_iap_localizations",
    {
      description: "List localizations (display names, descriptions) for an in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      const localizations = await client.get(
        `/v2/inAppPurchases/${iapId}/inAppPurchaseLocalizations`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(localizations, null, 2) }],
      };
    },
  );

  server.registerTool(
    "set_iap_localization",
    {
      description: "Create or update a localization for an in-app purchase",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID (used for creating new localizations)"),
        localizationId: z
          .string()
          .optional()
          .describe("Existing localization ID (provide to update instead of create)"),
        locale: z.string().describe("Locale code (e.g. en-US, de-DE)"),
        name: z.string().describe("Display name for this locale"),
        description: z.string().optional().describe("Description for this locale"),
      },
    },
    async ({ iapId, localizationId, locale, name, description }) => {
      if (localizationId) {
        const result = await client.patch(
          `/v1/inAppPurchaseLocalizations/${localizationId}`,
          {
            data: {
              type: "inAppPurchaseLocalizations",
              id: localizationId,
              attributes: { name, description },
            },
          },
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      const result = await client.post("/v1/inAppPurchaseLocalizations", {
        data: {
          type: "inAppPurchaseLocalizations",
          attributes: { locale, name, description },
          relationships: {
            inAppPurchaseV2: { data: { id: iapId, type: "inAppPurchases" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "set_iap_price",
    {
      description: "Set or update the price for an in-app purchase using a price point ID",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
        pricePointId: z
          .string()
          .describe(
            "The price point ID (get available price points via the App Store Connect API)",
          ),
      },
    },
    async ({ iapId, pricePointId }) => {
      const result = await client.post(
        `/v2/inAppPurchases/${iapId}/pricePoints`,
        {
          data: {
            type: "inAppPurchasePricePoints",
            relationships: {
              inAppPurchasePricePoint: {
                data: { id: pricePointId, type: "inAppPurchasePricePoints" },
              },
            },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "submit_iap_for_review",
    {
      description: "Submit an in-app purchase for review independently of the app version",
      inputSchema: {
        iapId: z.string().describe("The in-app purchase ID"),
      },
    },
    async ({ iapId }) => {
      const result = await client.post("/v1/inAppPurchaseSubmissions", {
        data: {
          type: "inAppPurchaseSubmissions",
          relationships: {
            inAppPurchaseV2: { data: { id: iapId, type: "inAppPurchases" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/iap.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/tools/iap.ts tests/tools/iap.test.ts
git commit -m "feat: add in-app purchase tools (CRUD, localizations, pricing, review)"
```

---

### Task 9: Subscriptions Tools

**Files:**
- Create: `src/tools/subscriptions.ts`
- Create: `tests/tools/subscriptions.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/tools/subscriptions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSubscriptionsTools } from "../src/tools/subscriptions.js";
import { AppStoreConnectClient } from "../src/api/client.js";

vi.mock("../src/auth/jwt.js", () => ({
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/subscriptions.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/tools/subscriptions.ts
import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerSubscriptionsTools({ server, client }: ToolContext): void {
  server.registerTool(
    "list_subscription_groups",
    {
      description: "List subscription groups for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const groups = await client.get(`/v1/apps/${appId}/subscriptionGroups`);
      return { content: [{ type: "text" as const, text: JSON.stringify(groups, null, 2) }] };
    },
  );

  server.registerTool(
    "create_subscription_group",
    {
      description: "Create a new subscription group for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        referenceName: z.string().describe("Reference name for the subscription group"),
      },
    },
    async ({ appId, referenceName }) => {
      const result = await client.post("/v1/subscriptionGroups", {
        data: {
          type: "subscriptionGroups",
          attributes: { referenceName },
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "list_subscriptions",
    {
      description: "List subscriptions within a subscription group",
      inputSchema: {
        groupId: z.string().describe("The subscription group ID"),
      },
    },
    async ({ groupId }) => {
      const subs = await client.get(
        `/v1/subscriptionGroups/${groupId}/subscriptions`,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(subs, null, 2) }] };
    },
  );

  server.registerTool(
    "create_subscription",
    {
      description: "Create a new auto-renewable subscription",
      inputSchema: {
        groupId: z.string().describe("The subscription group ID"),
        name: z.string().describe("Reference name"),
        productId: z.string().describe("Product ID (e.g. com.app.monthly)"),
        subscriptionPeriod: z
          .enum([
            "ONE_WEEK",
            "ONE_MONTH",
            "TWO_MONTHS",
            "THREE_MONTHS",
            "SIX_MONTHS",
            "ONE_YEAR",
          ])
          .describe("Subscription duration"),
      },
    },
    async ({ groupId, name, productId, subscriptionPeriod }) => {
      const result = await client.post("/v1/subscriptions", {
        data: {
          type: "subscriptions",
          attributes: { name, productId, subscriptionPeriod },
          relationships: {
            group: {
              data: { id: groupId, type: "subscriptionGroups" },
            },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_subscription",
    {
      description: "Update an existing subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
        name: z.string().optional().describe("New reference name"),
        reviewNote: z.string().optional().describe("Review note for App Review"),
      },
    },
    async ({ subscriptionId, name, reviewNote }) => {
      const attributes: Record<string, string> = {};
      if (name) attributes.name = name;
      if (reviewNote) attributes.reviewNote = reviewNote;
      const result = await client.patch(`/v1/subscriptions/${subscriptionId}`, {
        data: { type: "subscriptions", id: subscriptionId, attributes },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "set_subscription_localization",
    {
      description: "Create or update a localization for a subscription",
      inputSchema: {
        subscriptionId: z
          .string()
          .describe("The subscription ID (used for creating new localizations)"),
        localizationId: z
          .string()
          .optional()
          .describe("Existing localization ID (provide to update instead of create)"),
        locale: z.string().describe("Locale code (e.g. en-US)"),
        name: z.string().describe("Display name"),
        description: z.string().optional().describe("Description"),
      },
    },
    async ({ subscriptionId, localizationId, locale, name, description }) => {
      if (localizationId) {
        const result = await client.patch(
          `/v1/subscriptionLocalizations/${localizationId}`,
          {
            data: {
              type: "subscriptionLocalizations",
              id: localizationId,
              attributes: { name, description },
            },
          },
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      const result = await client.post("/v1/subscriptionLocalizations", {
        data: {
          type: "subscriptionLocalizations",
          attributes: { locale, name, description },
          relationships: {
            subscription: {
              data: { id: subscriptionId, type: "subscriptions" },
            },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "set_subscription_price",
    {
      description: "Set a price point for a subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
        pricePointId: z.string().describe("The subscription price point ID"),
        startDate: z
          .string()
          .optional()
          .describe("Start date for the price (YYYY-MM-DD), null for immediate"),
      },
    },
    async ({ subscriptionId, pricePointId, startDate }) => {
      const attributes: Record<string, unknown> = {};
      if (startDate) attributes.startDate = startDate;
      const result = await client.post(
        `/v1/subscriptions/${subscriptionId}/prices`,
        {
          data: {
            type: "subscriptionPrices",
            attributes,
            relationships: {
              subscriptionPricePoint: {
                data: {
                  id: pricePointId,
                  type: "subscriptionPricePoints",
                },
              },
            },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "list_subscription_offers",
    {
      description: "List promotional offers for a subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
      },
    },
    async ({ subscriptionId }) => {
      const offers = await client.get(
        `/v1/subscriptions/${subscriptionId}/promotionalOffers`,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(offers, null, 2) }] };
    },
  );

  server.registerTool(
    "create_subscription_offer",
    {
      description: "Create a promotional offer for a subscription",
      inputSchema: {
        subscriptionId: z.string().describe("The subscription ID"),
        name: z.string().describe("Offer reference name"),
        offerCode: z.string().describe("Unique offer code"),
        duration: z
          .enum([
            "ONE_WEEK",
            "ONE_MONTH",
            "TWO_MONTHS",
            "THREE_MONTHS",
            "SIX_MONTHS",
            "ONE_YEAR",
          ])
          .describe("Offer duration"),
        offerMode: z
          .enum(["PAY_AS_YOU_GO", "PAY_UP_FRONT", "FREE_TRIAL"])
          .describe("Offer mode"),
        numberOfPeriods: z.number().describe("Number of periods for the offer"),
      },
    },
    async ({ subscriptionId, name, offerCode, duration, offerMode, numberOfPeriods }) => {
      const result = await client.post(
        `/v1/subscriptions/${subscriptionId}/promotionalOffers`,
        {
          data: {
            type: "subscriptionPromotionalOffers",
            attributes: { name, offerCode, duration, offerMode, numberOfPeriods },
            relationships: {
              subscription: {
                data: { id: subscriptionId, type: "subscriptions" },
              },
            },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/subscriptions.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/tools/subscriptions.ts tests/tools/subscriptions.test.ts
git commit -m "feat: add subscription tools (groups, products, pricing, offers)"
```

---

### Task 10: Product Pages Tools

**Files:**
- Create: `src/tools/product-pages.ts`
- Create: `tests/tools/product-pages.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/tools/product-pages.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProductPagesTools } from "../src/tools/product-pages.js";
import { AppStoreConnectClient } from "../src/api/client.js";

vi.mock("../src/auth/jwt.js", () => ({
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/product-pages.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/tools/product-pages.ts
import { z } from "zod";
import type { ToolContext } from "../types/index.js";

export function registerProductPagesTools({ server, client }: ToolContext): void {
  // --- Custom Product Pages ---

  server.registerTool(
    "list_custom_product_pages",
    {
      description: "List all custom product pages for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
      },
    },
    async ({ appId }) => {
      const pages = await client.get(`/v1/apps/${appId}/appCustomProductPages`);
      return { content: [{ type: "text" as const, text: JSON.stringify(pages, null, 2) }] };
    },
  );

  server.registerTool(
    "create_custom_product_page",
    {
      description: "Create a new custom product page for an app",
      inputSchema: {
        appId: z.string().describe("The App Store Connect app ID"),
        name: z.string().describe("Name of the custom product page"),
      },
    },
    async ({ appId, name }) => {
      const result = await client.post("/v1/appCustomProductPages", {
        data: {
          type: "appCustomProductPages",
          attributes: { name },
          relationships: {
            app: { data: { id: appId, type: "apps" } },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "get_custom_product_page",
    {
      description: "Get details for a specific custom product page",
      inputSchema: {
        pageId: z.string().describe("The custom product page ID"),
      },
    },
    async ({ pageId }) => {
      const page = await client.get(`/v1/appCustomProductPages/${pageId}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }] };
    },
  );

  server.registerTool(
    "update_custom_product_page",
    {
      description: "Update a custom product page name or visibility",
      inputSchema: {
        pageId: z.string().describe("The custom product page ID"),
        name: z.string().optional().describe("New name"),
        visible: z.boolean().optional().describe("Whether the page is visible"),
      },
    },
    async ({ pageId, name, visible }) => {
      const attributes: Record<string, unknown> = {};
      if (name !== undefined) attributes.name = name;
      if (visible !== undefined) attributes.visible = visible;
      const result = await client.patch(`/v1/appCustomProductPages/${pageId}`, {
        data: { type: "appCustomProductPages", id: pageId, attributes },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Experiments (A/B Tests) ---

  server.registerTool(
    "list_experiments",
    {
      description: "List all A/B test experiments for an app store version",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
      },
    },
    async ({ versionId }) => {
      const experiments = await client.get(
        `/v2/appStoreVersions/${versionId}/appStoreVersionExperiments`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(experiments, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_experiment",
    {
      description: "Get details for a specific A/B test experiment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const experiment = await client.get(
        `/v2/appStoreVersionExperiments/${experimentId}`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(experiment, null, 2) }],
      };
    },
  );

  server.registerTool(
    "create_experiment",
    {
      description: "Create a new A/B test experiment for an app store version",
      inputSchema: {
        versionId: z.string().describe("The app store version ID"),
        name: z.string().describe("Experiment name"),
        trafficProportion: z
          .number()
          .min(0)
          .max(100)
          .describe("Percentage of traffic for the experiment (0-100)"),
        platform: z
          .enum(["IOS", "MAC_OS", "TV_OS", "VISION_OS"])
          .describe("Platform for this experiment"),
      },
    },
    async ({ versionId, name, trafficProportion, platform }) => {
      const result = await client.post("/v2/appStoreVersionExperiments", {
        data: {
          type: "appStoreVersionExperiments",
          attributes: { name, trafficProportion, platform },
          relationships: {
            appStoreVersion: {
              data: { id: versionId, type: "appStoreVersions" },
            },
          },
        },
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "start_experiment",
    {
      description: "Start running an A/B test experiment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const result = await client.patch(
        `/v2/appStoreVersionExperiments/${experimentId}`,
        {
          data: {
            type: "appStoreVersionExperiments",
            id: experimentId,
            attributes: { state: "READY_FOR_REVIEW" },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "stop_experiment",
    {
      description: "Stop a running A/B test experiment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const result = await client.patch(
        `/v2/appStoreVersionExperiments/${experimentId}`,
        {
          data: {
            type: "appStoreVersionExperiments",
            id: experimentId,
            attributes: { state: "STOPPED" },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "get_experiment_results",
    {
      description:
        "Get results for an A/B test experiment including conversion rates per treatment",
      inputSchema: {
        experimentId: z.string().describe("The experiment ID"),
      },
    },
    async ({ experimentId }) => {
      const treatments = await client.get(
        `/v2/appStoreVersionExperiments/${experimentId}/appStoreVersionExperimentTreatments`,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(treatments, null, 2) }],
      };
    },
  );

  // --- App Store Version Localizations ---

  server.registerTool(
    "update_app_description",
    {
      description: "Update the app description for a specific locale",
      inputSchema: {
        localizationId: z.string().describe("The app store version localization ID"),
        description: z.string().describe("New app description"),
      },
    },
    async ({ localizationId, description }) => {
      const result = await client.patch(
        `/v1/appStoreVersionLocalizations/${localizationId}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: localizationId,
            attributes: { description },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_whats_new",
    {
      description: "Update the 'What's New' text for a specific locale",
      inputSchema: {
        localizationId: z.string().describe("The app store version localization ID"),
        whatsNew: z.string().describe("New 'What's New' text"),
      },
    },
    async ({ localizationId, whatsNew }) => {
      const result = await client.patch(
        `/v1/appStoreVersionLocalizations/${localizationId}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: localizationId,
            attributes: { whatsNew },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "update_keywords",
    {
      description: "Update the keywords for a specific locale",
      inputSchema: {
        localizationId: z.string().describe("The app store version localization ID"),
        keywords: z.string().describe("Comma-separated keywords"),
      },
    },
    async ({ localizationId, keywords }) => {
      const result = await client.patch(
        `/v1/appStoreVersionLocalizations/${localizationId}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: localizationId,
            attributes: { keywords },
          },
        },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
```

Note: `upload_screenshot` and `upload_preview` are omitted from this task. They require a multi-step reserve-then-upload flow with binary file uploads, which is significantly more complex. These can be added as a follow-up task once the core tools are working.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/product-pages.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/tools/product-pages.ts tests/tools/product-pages.test.ts
git commit -m "feat: add product page and experiment tools"
```

---

### Task 11: Server Entry Point

**Files:**
- Modify: `src/index.ts`
- Create: `tests/index.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/index.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock dotenv before importing
vi.mock("dotenv/config", () => ({}));

// Mock environment variables
vi.stubEnv("ASC_ISSUER_ID", "test-issuer");
vi.stubEnv("ASC_KEY_ID", "test-key");
vi.stubEnv("ASC_PRIVATE_KEY_PATH", "/test/key.p8");

// Mock the MCP SDK
const mockConnect = vi.fn();
const mockRegisterTool = vi.fn();

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn(() => ({
    registerTool: mockRegisterTool,
    connect: mockConnect,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

// Mock all tool registration modules
vi.mock("../src/tools/apps.js", () => ({
  registerAppsTools: vi.fn(),
}));
vi.mock("../src/tools/builds.js", () => ({
  registerBuildsTools: vi.fn(),
}));
vi.mock("../src/tools/review.js", () => ({
  registerReviewTools: vi.fn(),
}));
vi.mock("../src/tools/iap.js", () => ({
  registerIapTools: vi.fn(),
}));
vi.mock("../src/tools/subscriptions.js", () => ({
  registerSubscriptionsTools: vi.fn(),
}));
vi.mock("../src/tools/product-pages.js", () => ({
  registerProductPagesTools: vi.fn(),
}));

describe("Server Entry Point", () => {
  it("imports without errors when env vars are set", async () => {
    await expect(import("../src/index.js")).resolves.not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — the current `src/index.ts` doesn't import any tool modules.

**Step 3: Write the implementation**

```typescript
// src/index.ts
#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppStoreConnectClient } from "./api/client.js";
import { registerAppsTools } from "./tools/apps.js";
import { registerBuildsTools } from "./tools/builds.js";
import { registerReviewTools } from "./tools/review.js";
import { registerIapTools } from "./tools/iap.js";
import { registerSubscriptionsTools } from "./tools/subscriptions.js";
import { registerProductPagesTools } from "./tools/product-pages.js";

const issuerId = process.env.ASC_ISSUER_ID;
const keyId = process.env.ASC_KEY_ID;
const privateKeyPath = process.env.ASC_PRIVATE_KEY_PATH;

if (!issuerId || !keyId || !privateKeyPath) {
  console.error(
    "Missing required environment variables. Please set ASC_ISSUER_ID, ASC_KEY_ID, and ASC_PRIVATE_KEY_PATH.",
  );
  console.error("See .env.example for reference.");
  process.exit(1);
}

const server = new McpServer({
  name: "appstoreconnect-mcp",
  version: "0.1.0",
});

const client = new AppStoreConnectClient(issuerId, keyId, privateKeyPath);

const ctx = { server, client };

registerAppsTools(ctx);
registerBuildsTools(ctx);
registerReviewTools(ctx);
registerIapTools(ctx);
registerSubscriptionsTools(ctx);
registerProductPagesTools(ctx);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("App Store Connect MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/index.test.ts`
Expected: PASS.

**Step 5: Verify the full project builds**

Run: `npm run build`
Expected: No TypeScript errors, `build/` directory populated.

**Step 6: Run all tests**

Run: `npm test`
Expected: All tests across all files PASS.

**Step 7: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: wire up server entry point with all tool modules"
```

---

### Task 12: Integration Verification & Config Example

**Files:**
- Modify: `.env.example` (already exists)

**Step 1: Verify full build is clean**

Run: `npm run build`
Expected: No errors.

**Step 2: Run all tests one final time**

Run: `npm test`
Expected: All tests PASS.

**Step 3: Test the server starts (will exit due to missing env, but should not crash)**

Run: `ASC_ISSUER_ID=test ASC_KEY_ID=test ASC_PRIVATE_KEY_PATH=/dev/null node build/index.js`
Expected: Server starts and prints "App Store Connect MCP server running on stdio" to stderr. It will hang waiting for stdio input — that's correct. Kill it with Ctrl+C.

**Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final verification pass"
```

---

## Follow-Up Tasks (not in this plan)

These are deferred for a future iteration:

- **Screenshot/preview uploads** — requires multi-step reserve-then-upload flow with binary uploads
- **Analytics tools** — sales data, download metrics (uses a different reporting API)
- **Provisioning tools** — bundle IDs, certificates, profiles, devices
- **npm publishing setup** — prepublish scripts, README, LICENSE
