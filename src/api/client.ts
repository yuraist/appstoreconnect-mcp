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

export interface JsonApiResponse {
  data: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
  links?: { next?: string };
  errors?: Array<{
    status: string;
    code: string;
    title: string;
    detail: string;
  }>;
}

function flatten(resource: JsonApiResource): Record<string, unknown> {
  return {
    id: resource.id,
    type: resource.type,
    ...resource.attributes,
    ...(resource.relationships
      ? { relationships: resource.relationships }
      : {}),
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
    attempt = 0,
  ): Promise<JsonApiResponse> {
    const target = new URL(url, BASE_URL);
    if (target.origin !== BASE_URL || target.username || target.password) {
      throw new Error(
        "Requests and pagination must stay on api.appstoreconnect.apple.com",
      );
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.getToken()}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(target.href, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });

    if (response.status === 429 && attempt < 3) {
      const header = response.headers.get("Retry-After") || "1";
      const seconds = /^\d+$/.test(header)
        ? Number(header)
        : (Date.parse(header) - Date.now()) / 1000;
      const retryAfter = Number.isFinite(seconds)
        ? Math.max(0, Math.min(30, seconds))
        : 1;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.request(method, url, body, attempt + 1);
    }

    if (response.status === 204) {
      return { data: [] };
    }

    const contentType =
      response.headers?.get("content-type") || "application/json";
    if (response.ok && !contentType.includes("json")) {
      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        data: null,
        ...{
          contentType,
          encoding: "base64",
          bytes: bytes.length,
          content: bytes.toString("base64"),
        },
      };
    }
    let json: JsonApiResponse;
    try {
      json = (await response.json()) as JsonApiResponse;
    } catch {
      throw new AppStoreConnectError(
        response.status,
        "INVALID_RESPONSE",
        `Apple returned a non-JSON response (${response.status})`,
      );
    }

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

  /** One page, preserving JSON:API relationships, included resources and links. */
  async raw(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<JsonApiResponse> {
    return this.request(method, new URL(path, BASE_URL).href, body);
  }

  async get(
    path: string,
    params?: Record<string, string>,
    page = 0,
  ): Promise<unknown> {
    if (page >= 100)
      throw new Error("Pagination exceeded 100 pages; narrow the query");
    let url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const json = await this.request("GET", url);

    if (Array.isArray(json.data)) {
      let results = json.data.map(flatten);

      if (json.links?.next) {
        const nextResults = (await this.get(
          json.links.next,
          undefined,
          page + 1,
        )) as Record<string, unknown>[];
        results = results.concat(nextResults);
      }

      return results;
    }

    return json.data ? flatten(json.data) : null;
  }

  async post(path: string, body: unknown): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const json = await this.request("POST", url, body);

    if (Array.isArray(json.data)) {
      return json.data.map(flatten);
    }
    return json.data ? flatten(json.data) : null;
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const json = await this.request("PATCH", url, body);

    if (Array.isArray(json.data)) {
      return json.data.map(flatten);
    }
    return json.data ? flatten(json.data) : null;
  }

  async delete(path: string): Promise<void> {
    const url = `${BASE_URL}${path}`;
    await this.request("DELETE", url);
  }
}
