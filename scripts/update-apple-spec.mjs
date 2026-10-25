#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
if (!process.argv[2])
  throw new Error(
    "Download the official Apple specification ZIP, extract openapi.oas.json, then run: node scripts/update-apple-spec.mjs path/to/openapi.oas.json",
  );
const bytes = readFileSync(process.argv[2]);
const spec = JSON.parse(bytes);
if (
  spec.info?.title !== "App Store Connect API" ||
  !spec.paths ||
  !spec.components?.schemas
)
  throw new Error("Not an Apple ASC specification");
writeFileSync(
  new URL("../data/apple-openapi.json.gz", import.meta.url),
  gzipSync(bytes, { level: 9 }),
);
writeFileSync(
  new URL("../data/apple-openapi-source.json", import.meta.url),
  JSON.stringify(
    {
      url: "https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip",
      retrieved: new Date().toISOString().slice(0, 10),
      version: spec.info.version,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Pinned Apple API ${spec.info.version}. Run build, tests and smoke checks before releasing.`,
);
