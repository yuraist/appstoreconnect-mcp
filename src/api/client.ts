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
