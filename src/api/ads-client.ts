import { getAccessToken, type AppleAdsCredentials } from "../auth/ads-oauth.js";

/**
 * Apple Ads Platform API 1.0 — released August 2026, supersedes the Campaign
 * Management API (v4/v5), which sunsets 2027-01-26.
 *
 * Two things differ from the old Campaign Management API and are easy to get
 * wrong: the host is `api.ads.apple.com` (not `api.searchads.apple.com`), and
 * the context header carries `adAccountId=` where v4/v5 carried `orgId=`.
 */
export const DEFAULT_ADS_BASE_URL = "https://api.ads.apple.com";

/** Apple caps a single page at 5000 rows on the query endpoints. */
export const MAX_PAGE_SIZE = 5000;

export class AppleAdsError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: unknown[] = [],
  ) {
    super(message);
    this.name = "AppleAdsError";
  }
}

interface AdsEnvelope<T = unknown> {
  data?: T;
  pagination?: {
    totalResults?: number;
    offset?: number;
    pageSize?: number;
  } | null;
  error?: unknown;
}

export interface AdsQueryResult<T = unknown> {
  items: T[];
  totalResults?: number;
}

/**
 * Pulls a human-readable message out of an Apple Ads error payload. The shape
 * varies across endpoints, so this probes the documented variants rather than
 * assuming one.
 */
function describeError(payload: unknown): { message: string; details: unknown[] } {
  const err = (payload as AdsEnvelope)?.error ?? payload;

  if (!err || typeof err !== "object") {
    return { message: "Unknown error", details: [] };
  }

  const record = err as Record<string, unknown>;
  const errors = Array.isArray(record.errors) ? record.errors : [];
  const first = errors[0] as Record<string, unknown> | undefined;

  const message =
    (first?.message as string) ||
    (first?.messageCode as string) ||
    (record.message as string) ||
    (record.error_description as string) ||
    (record.code as string) ||
    "Unknown error";

  return { message, details: errors.length > 0 ? errors : [err] };
}

export class AppleAdsClient {
  private credentials: AppleAdsCredentials;
  private baseUrl: string;

  constructor(credentials: AppleAdsCredentials, baseUrl = DEFAULT_ADS_BASE_URL) {
    this.credentials = credentials;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async headers(): Promise<Record<string, string>> {
    const token = await getAccessToken(this.credentials);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // A handful of endpoints — notably GET /v1/acls, which is how you look up
    // your ad account ID in the first place — are exempt from the context
    // header. Omitting it when unconfigured lets that bootstrap call succeed.
    if (this.credentials.adAccountId) {
      headers["X-AP-Context"] = `adAccountId=${this.credentials.adAccountId}`;
    }

    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
    attempt = 0,
  ): Promise<AdsEnvelope<T>> {
    let url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      url += `?${new URLSearchParams(params).toString()}`;
    }

    const response = await fetch(url, {
      method,
      headers: await this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429) {
      // Apple asks for exponential backoff doubling to ~16s, preferring
      // Retry-After when present.
      const retryAfter = response.headers?.get("Retry-After");
      const backoffSeconds = retryAfter
        ? parseInt(retryAfter, 10)
        : Math.min(16, 2 ** attempt);

      if (attempt >= 5) {
        throw new AppleAdsError(429, "Apple Ads API rate limit exceeded after 5 retries");
      }

      await new Promise((resolve) => setTimeout(resolve, backoffSeconds * 1000));
      return this.request<T>(method, path, body, params, attempt + 1);
    }

    if (response.status === 204) {
      return { data: undefined };
    }

    const json = (await response.json()) as AdsEnvelope<T>;

    if (!response.ok || json.error) {
      const { message, details } = describeError(json);
      throw new AppleAdsError(
        response.status,
        `Apple Ads API error (${response.status}): ${message}`,
        details,
      );
    }

    return json;
  }

  /** GET returning the unwrapped `data` payload. */
  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T | undefined> {
    const json = await this.request<T>("GET", path, undefined, params);
    return json.data;
  }

  /** POST returning the unwrapped `data` payload, with no pagination handling. */
  async post<T = unknown>(path: string, body: unknown): Promise<T | undefined> {
    const json = await this.request<T>("POST", path, body);
    return json.data;
  }

  /**
   * POST against one of the `.../query` endpoints, walking the offset cursor
   * until every row is collected or `limit` rows have been gathered.
   *
   * `body` carries the endpoint-specific members (fields, filters, sorting,
   * timeRange); pagination is managed here and must not be passed in.
   */
  async query<T = unknown>(
    path: string,
    body: Record<string, unknown> = {},
    limit = Infinity,
  ): Promise<AdsQueryResult<T>> {
    const items: T[] = [];
    let offset = 0;
    let totalResults: number | undefined;

    while (items.length < limit) {
      const pageSize = Math.min(MAX_PAGE_SIZE, limit - items.length);

      const json = await this.request<T[]>("POST", path, {
        ...body,
        pagination: { offset, pageSize },
      });

      const page = Array.isArray(json.data) ? json.data : [];
      items.push(...page);

      totalResults = json.pagination?.totalResults ?? totalResults;

      // A short page means we've reached the end.
      if (page.length < pageSize) break;

      offset += page.length;
      if (totalResults !== undefined && offset >= totalResults) break;
    }

    return { items, totalResults };
  }
}
