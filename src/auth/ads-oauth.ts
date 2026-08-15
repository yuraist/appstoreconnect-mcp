import jwt from "jsonwebtoken";
import fs from "node:fs";

/**
 * Apple Ads uses a two-step OAuth2 client-credentials flow, which is entirely
 * separate from the App Store Connect JWT in `jwt.ts`:
 *
 *   1. Sign a long-lived `client_secret` JWT (ES256) with the private key whose
 *      public half was uploaded in the Apple Ads UI.
 *   2. Exchange that secret at Apple ID's token endpoint for a short-lived
 *      access token, which is what actually goes in the Authorization header.
 *
 * The two sets of credentials are not interchangeable — an App Store Connect
 * `.p8` will not authenticate against Apple Ads and vice versa.
 */

export const APPLE_ID_TOKEN_URL = "https://appleid.apple.com/auth/oauth2/token";
export const APPLE_ADS_SCOPE = "searchadsorg";

/** Apple caps the client secret at 180 days; we stay comfortably under it. */
const CLIENT_SECRET_LIFETIME_SECONDS = 86400 * 180;

/** Refresh the access token a minute early so an in-flight request never 401s. */
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;

export interface AppleAdsCredentials {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKeyPath: string;
  /** Omit while bootstrapping — `GET /v1/acls` reports the available IDs. */
  adAccountId?: string;
}

let cachedPrivateKey: string | null = null;
let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;

export function resetAdsTokenCache(): void {
  cachedPrivateKey = null;
  cachedAccessToken = null;
  cachedAccessTokenExpiry = 0;
}

function readPrivateKey(privateKeyPath: string): string {
  if (cachedPrivateKey) return cachedPrivateKey;

  try {
    cachedPrivateKey = fs.readFileSync(privateKeyPath, "utf8");
  } catch (err) {
    throw new Error(
      `Failed to read Apple Ads private key at ${privateKeyPath}: ${(err as Error).message}`,
    );
  }

  return cachedPrivateKey;
}

/**
 * Builds the self-signed JWT that Apple ID accepts as `client_secret`.
 * Note the unusual claim mapping: the team ID is the issuer and the client ID
 * is the subject — the reverse of what the names suggest.
 */
export function generateClientSecret(credentials: AppleAdsCredentials): string {
  const { clientId, teamId, keyId, privateKeyPath } = credentials;
  const privateKey = readPrivateKey(privateKeyPath);

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    issuer: teamId,
    subject: clientId,
    audience: APPLE_ID_TOKEN_URL,
    expiresIn: CLIENT_SECRET_LIFETIME_SECONDS,
    header: {
      alg: "ES256",
      kid: keyId,
    },
  });
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * Returns a cached access token, minting a new one when the current token is
 * missing or close to expiry.
 */
export async function getAccessToken(
  credentials: AppleAdsCredentials,
): Promise<string> {
  const now = Date.now();

  if (cachedAccessToken && now < cachedAccessTokenExpiry) {
    return cachedAccessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: generateClientSecret(credentials),
    scope: APPLE_ADS_SCOPE,
  });

  const response = await fetch(APPLE_ID_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Host: "appleid.apple.com",
    },
    body: body.toString(),
  });

  const json = (await response.json()) as TokenResponse;

  if (!response.ok || !json.access_token) {
    const reason = json.error_description || json.error || "unknown error";
    throw new Error(
      `Apple Ads OAuth token request failed (${response.status}): ${reason}`,
    );
  }

  const lifetimeMs = (json.expires_in ?? 3600) * 1000;
  cachedAccessToken = json.access_token;
  cachedAccessTokenExpiry = now + lifetimeMs - TOKEN_EXPIRY_SKEW_MS;

  return cachedAccessToken;
}
