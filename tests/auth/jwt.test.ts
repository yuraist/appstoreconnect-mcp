import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

// Generate a valid ES256 (P-256) key pair for testing
const { privateKey: TEST_PRIVATE_KEY } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "sec1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// Mock fs before importing the module under test
vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { generateToken, resetTokenCache } from "../../src/auth/jwt.js";

const mockedReadFileSync = vi.mocked(fs.readFileSync);

describe("generateToken", () => {
  const ISSUER_ID = "test-issuer-id";
  const KEY_ID = "TEST_KEY_123";
  const KEY_PATH = "/path/to/AuthKey.p8";

  beforeEach(() => {
    resetTokenCache();
    vi.clearAllMocks();
    mockedReadFileSync.mockReturnValue(TEST_PRIVATE_KEY);
  });

  it("generates a valid JWT with correct claims", () => {
    const token = generateToken(ISSUER_ID, KEY_ID, KEY_PATH);

    // Decode without verification to inspect claims
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded).not.toBeNull();

    // Header checks
    expect(decoded!.header.alg).toBe("ES256");
    expect(decoded!.header.kid).toBe(KEY_ID);
    expect(decoded!.header.typ).toBe("JWT");

    // Payload checks
    const payload = decoded!.payload as jwt.JwtPayload;
    expect(payload.iss).toBe(ISSUER_ID);
    expect(payload.aud).toBe("appstoreconnect-v1");
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
  });

  it("caches tokens — second call returns the same token and reads key file only once", () => {
    const token1 = generateToken(ISSUER_ID, KEY_ID, KEY_PATH);
    const token2 = generateToken(ISSUER_ID, KEY_ID, KEY_PATH);

    expect(token1).toBe(token2);
    expect(mockedReadFileSync).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the private key file is missing", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(() => generateToken(ISSUER_ID, KEY_ID, "/nonexistent/key.p8")).toThrow(
      /Failed to read private key at \/nonexistent\/key\.p8/,
    );
  });
});
