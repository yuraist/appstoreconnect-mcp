#!/usr/bin/env python3
"""Install or refresh the personal local Codex plugin from this checkout."""
from pathlib import Path
import json, shutil, subprocess
root=Path(__file__).resolve().parent.parent
home=Path.home()
helpers=home/'.codex/skills/.system/plugin-creator/scripts'
plugin=home/'plugins/appstoreconnect'
if not (plugin/'.codex-plugin/plugin.json').exists():
    subprocess.run(['python3',str(helpers/'create_basic_plugin.py'),'appstoreconnect','--with-mcp','--with-marketplace'],check=True)
name=subprocess.check_output(['python3',str(helpers/'read_marketplace_name.py')],text=True).strip()
shutil.copy2(root/'codex-plugin/plugin.json',plugin/'.codex-plugin/plugin.json')
node=shutil.which('node')
if not node:raise SystemExit('Install Node.js before enabling the MCP plugin.')
(plugin/'.mcp.json').write_text(json.dumps({'mcpServers':{'appstoreconnect':{'command':node,'args':[str(root/'scripts/launch.mjs')]}}},indent=2)+'\n')
subprocess.run(['python3',str(helpers/'update_plugin_cachebuster.py'),str(plugin)],check=True)
subprocess.run(['python3',str(helpers/'validate_plugin.py'),str(plugin)],check=True)
subprocess.run(['codex','plugin','add','appstoreconnect@'+name,'--json'],check=True)
print('Start a new Codex task to load the updated plugin.')

