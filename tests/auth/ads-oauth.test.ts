import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import {
  generateClientSecret,
  getAccessToken,
  resetAdsTokenCache,
  APPLE_ID_TOKEN_URL,
  type AppleAdsCredentials,
} from "../../src/auth/ads-oauth.js";

// ES256 test key pair — generated for tests only, never used against Apple.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgjfRC/H2i/lA80jGb
k+i/n4HaTTPUvRKtjD8Zx05D8X2hRANCAARTA89S+ySDPCaN0y6PVO27+ww8dR0S
pQIfqSQv2Zure1Em4S4uLGu3RleEdcLUpp7iGNJmi5o0IlWI1X6G8o/k
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEUwPPUvskgzwmjdMuj1Ttu/sMPHUd
EqUCH6kkL9mbq3tRJuEuLixrt0ZXhHXC1Kae4hjSZouaNCJViNV+hvKP5A==
-----END PUBLIC KEY-----`;

vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(() => TEST_PRIVATE_KEY),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const credentials: AppleAdsCredentials = {
  clientId: "SEARCHADS.abc-123",
  teamId: "SEARCHADS.team-456",
  keyId: "key-789",
  privateKeyPath: "/ads-key.pem",
  adAccountId: "999888",
};

describe("Apple Ads OAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAdsTokenCache();
  });

  describe("generateClientSecret", () => {
    it("signs an ES256 JWT verifiable with the matching public key", () => {
      const secret = generateClientSecret(credentials);
      const verified = jwt.verify(secret, TEST_PUBLIC_KEY, {
        algorithms: ["ES256"],
        audience: APPLE_ID_TOKEN_URL,
      }) as jwt.JwtPayload;

      expect(verified.iss).toBe(credentials.teamId);
      expect(verified.sub).toBe(credentials.clientId);
    });

    it("puts the key ID in the JWT header", () => {
      const secret = generateClientSecret(credentials);
      const decoded = jwt.decode(secret, { complete: true });

      expect(decoded?.header.alg).toBe("ES256");
      expect(decoded?.header.kid).toBe(credentials.keyId);
    });

    it("sets an expiry within Apple's 180-day ceiling", () => {
      const secret = generateClientSecret(credentials);
      const decoded = jwt.decode(secret) as jwt.JwtPayload;
      const lifetimeDays = (decoded.exp! - decoded.iat!) / 86400;

      expect(lifetimeDays).toBeGreaterThan(0);
      expect(lifetimeDays).toBeLessThanOrEqual(180);
    });
  });

  describe("getAccessToken", () => {
    it("exchanges the client secret at Apple ID's token endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: "access-abc", expires_in: 3600 }),
      });

      const token = await getAccessToken(credentials);

      expect(token).toBe("access-abc");
      expect(mockFetch).toHaveBeenCalledWith(
        APPLE_ID_TOKEN_URL,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }),
      );

      const sentBody = mockFetch.mock.calls[0][1].body as string;
      const params = new URLSearchParams(sentBody);
      expect(params.get("grant_type")).toBe("client_credentials");
      expect(params.get("client_id")).toBe(credentials.clientId);
      expect(params.get("scope")).toBe("searchadsorg");
      expect(params.get("client_secret")).toBeTruthy();
    });

    it("caches the token across calls", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: "access-abc", expires_in: 3600 }),
      });

      await getAccessToken(credentials);
      await getAccessToken(credentials);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("re-mints the token once the cached one has expired", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          // expires_in shorter than the 60s skew forces an immediate refresh
          json: () =>
            Promise.resolve({ access_token: "access-old", expires_in: 30 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ access_token: "access-new", expires_in: 3600 }),
        });

      expect(await getAccessToken(credentials)).toBe("access-old");
      expect(await getAccessToken(credentials)).toBe("access-new");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("surfaces Apple's error description on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "invalid_client",
            error_description: "Client authentication failed",
          }),
      });

      await expect(getAccessToken(credentials)).rejects.toThrow(
        /Client authentication failed/,
      );
    });
  });
});
