import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { AppStoreConnectClient } from "./api/client.js";

export function createClient() {
  try {
    const values = parse(
      readFileSync(
        process.env.ASC_ENV_FILE ||
          resolve(homedir(), "Developer/.secrets/.env"),
      ),
    );
    for (const [key, value] of Object.entries(values))
      if (/^ASC_/.test(key) && process.env[key] === undefined)
        process.env[key] = value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const { ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH } = process.env;
  if (!ASC_ISSUER_ID || !ASC_KEY_ID || !ASC_PRIVATE_KEY_PATH)
    throw new Error(
      "Set ASC_ISSUER_ID, ASC_KEY_ID and ASC_PRIVATE_KEY_PATH, or configure ASC_ENV_FILE",
    );
  return new AppStoreConnectClient(
    ASC_ISSUER_ID,
    ASC_KEY_ID,
    ASC_PRIVATE_KEY_PATH,
  );
}
