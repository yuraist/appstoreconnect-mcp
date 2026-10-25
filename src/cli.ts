#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { getCatalog, type ApiInput } from "./api/catalog.js";
import { createClient } from "./env.js";
import { uploadBuild, type BuildUploadInput } from "./api/uploads.js";

const help = `asc-api — App Store Connect API, sharing the MCP client's credentials and catalog

  asc-api search [terms]                     Search operations (offline)
  asc-api describe OPERATION_ID              Show input schemas (offline)
  asc-api read OPERATION_ID [INPUT.json|-]    Execute one GET page
  asc-api write OPERATION_ID INPUT.json|- [--dry-run]
  asc-api upload INPUT.json|-                Upload signed build; input contains
                                            appId, filePath, version, buildNumber, platform

JSON input: {"path":{"id":"..."},"query":{"limit":10},"body":{"data":...}}
Use '-' for stdin. Secrets load from ASC_ENV_FILE or ~/Developer/.secrets/.env.
Writes affect Apple's production data. Dry-run validates offline without credentials.
`;

async function main() {
  const [command, target, inputFile, ...flags] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(help);
    return;
  }
  if (command === "--version") {
    console.log("0.2.0");
    return;
  }
  const catalog = getCatalog();
  const readInput = (file: string) =>
    JSON.parse(readFileSync(file === "-" ? 0 : file, "utf8"));
  let response: unknown;
  switch (command) {
    case "search":
      response = catalog.search(process.argv.slice(3).join(" "));
      break;
    case "describe":
      if (!target) throw new Error("Operation ID required");
      response = catalog.describe(target);
      break;
    case "read":
    case "write": {
      if (!target) throw new Error("Operation ID required");
      const input: ApiInput = {
        ...(inputFile && inputFile !== "--dry-run" ? readInput(inputFile) : {}),
        operationId: target,
      };
      const dryRun = inputFile === "--dry-run" || flags.includes("--dry-run");
      if (dryRun) {
        const p = catalog.prepare(input);
        if ((p.operation.method === "GET") !== (command === "read"))
          throw new Error("Use the matching read/write command");
        response = {
          dryRun: true,
          method: p.operation.method,
          path: p.url,
          body: p.body,
        };
      } else response = await catalog.execute(createClient(), input, command);
      break;
    }
    case "upload":
      if (!target) throw new Error("Upload input JSON required");
      response = await uploadBuild(
        createClient(),
        readInput(target) as BuildUploadInput,
      );
      break;
    default:
      throw new Error(`Unknown command: ${command}. Run asc-api --help`);
  }
  console.log(JSON.stringify(response, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Command failed");
  process.exitCode = 1;
});
