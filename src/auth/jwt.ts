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
