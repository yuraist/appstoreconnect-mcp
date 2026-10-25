#!/usr/bin/env python3
"""Compatibility entrypoint for the local plugin installer."""
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
node = shutil.which('node')
if not node:
    raise SystemExit('Install Node.js before enabling the MCP plugin.')
subprocess.run([node, str(root / 'scripts/install-local.mjs'), *sys.argv[1:]], check=True)
local_codex = Path.home() / '.local/bin/codex'
codex = str(local_codex) if local_codex.exists() else shutil.which('codex')
if not codex:
    raise SystemExit('Plugin files installed. Install Codex, then run codex plugin add appstoreconnect@personal --json.')
subprocess.run([codex, 'plugin', 'add', 'appstoreconnect@personal', '--json'], check=True)
print('Start a new Codex chat to load the updated tools.')
