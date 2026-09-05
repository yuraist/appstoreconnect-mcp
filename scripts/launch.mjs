#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'dotenv';

// Same entrypoint for every local MCP client. Explicit env values take precedence.
const envPath = process.env.ASC_ENV_FILE || resolve(homedir(), 'Developer/.secrets/.env');
try {
  const values = parse(readFileSync(envPath));
  for (const [key, value] of Object.entries(values)) {
    if (/^(ASC_|APPLE_ADS_)/.test(key) && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(resolve(root, 'build/index.js')).href);
