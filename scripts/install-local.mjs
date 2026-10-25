#!/usr/bin/env node
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  symlinkSync,
  lstatSync,
  readlinkSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(
  process.env.ASC_PLUGIN_ROOT ||
    resolve(homedir(), ".agents/plugins/plugins/appstoreconnect"),
);
const binDir = resolve(
  process.env.ASC_BIN_DIR || resolve(homedir(), ".local/bin"),
);
if (!existsSync(resolve(root, "build/index.js")))
  throw new Error("Run npm ci && npm run build first");
mkdirSync(resolve(pluginRoot, ".codex-plugin"), { recursive: true });
copyFileSync(
  resolve(root, "codex-plugin/plugin.json"),
  resolve(pluginRoot, ".codex-plugin/plugin.json"),
);
copyFileSync(resolve(root, "plugin.json"), resolve(pluginRoot, "plugin.json"));
cpSync(resolve(root, "skills"), resolve(pluginRoot, "skills"), {
  recursive: true,
});
const server = {
  command: process.execPath,
  args: [resolve(root, "scripts/launch.mjs")],
};
writeFileSync(
  resolve(pluginRoot, ".mcp.json"),
  JSON.stringify({ mcpServers: { appstoreconnect: server } }, null, 2) + "\n",
);
writeFileSync(
  resolve(pluginRoot, "mcp.json"),
  JSON.stringify(
    { mcpServers: { appstoreconnect: { type: "stdio", ...server } } },
    null,
    2,
  ) + "\n",
);
mkdirSync(binDir, { recursive: true });
for (const [name, target] of [
  ["asc-api", "build/cli.js"],
  ["appstoreconnect-mcp", "scripts/launch.mjs"],
]) {
  const destination = resolve(binDir, name),
    source = resolve(root, target);
  if (
    existsSync(destination) ||
    (() => {
      try {
        lstatSync(destination);
        return true;
      } catch {
        return false;
      }
    })()
  ) {
    if (
      !lstatSync(destination).isSymbolicLink() ||
      readlinkSync(destination) !== source
    )
      throw new Error(`Existing unrelated executable: ${destination}`);
  } else symlinkSync(source, destination);
}
if (process.argv.includes("--shared-skill")) {
  const skillsDir = resolve(process.env.ASC_SKILLS_DIR || resolve(homedir(), ".agents/skills"));
  mkdirSync(skillsDir, { recursive: true });
  const destination = resolve(skillsDir, "appstoreconnect");
  const source = resolve(root, "skills/appstoreconnect");
  let existing;
  try { existing = lstatSync(destination); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && (!existing.isSymbolicLink() || readlinkSync(destination) !== source)) {
    if (!existing.isSymbolicLink()) throw new Error("Shared skill is a real directory; preserve it before changing its source");
    const backup = resolve(skillsDir, ".appstoreconnect-before-0.2.0");
    try { lstatSync(backup); throw new Error(`Previous skill backup already exists: ${backup}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    renameSync(destination, backup);
    symlinkSync(source, destination);
  } else if (!existing) symlinkSync(source, destination);
}
console.log(
  JSON.stringify({
    pluginRoot,
    binDir,
    version: JSON.parse(readFileSync(resolve(root, "package.json"))).version,
  }),
);
console.log(
  "Refresh the existing personal plugin with: codex plugin add appstoreconnect@personal --json",
);
console.log(
  "Claude registrations pointing at scripts/launch.mjs use this build on reconnect. Start a new Codex chat to refresh discovered tools.",
);
