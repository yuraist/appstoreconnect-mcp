# App Store Connect MCP Server

<p align="center">
  <img src="docs/hero.jpg" alt="App Store Connect MCP Server" width="700">
</p>

A [Model Context Protocol](https://modelcontextprotocol.io/) server that wraps Apple's App Store Connect API v2. Gives Claude (or any MCP client) direct access to manage apps, in-app purchases, subscriptions, TestFlight, product page experiments, and App Review submissions.

## What You Can Do

**Apps** — List apps, view details, check version history and statuses.

**In-App Purchases** — Create, update, delete IAPs. Manage localizations and pricing. Submit for review.

**Subscriptions** — Manage subscription groups and products. Set prices per territory. Create introductory and promotional offers.

**Product Page Optimization** — Create custom product pages. Run A/B test experiments and check results.

**Builds & TestFlight** — List builds, manage beta groups and testers, distribute builds to test groups.

**App Review** — Check review status, view rejection reasons, submit versions for review. Update descriptions, keywords, and What's New text per locale.

See the full [tool reference](docs/tools.md) for all 43+ available tools.

## Prerequisites

- Node.js 18+
- An [Apple Developer](https://developer.apple.com/) account with App Store Connect access
- An App Store Connect API key (`.p8` file) — [how to create one](https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api)

## Setup

1. Clone and install:

```bash
git clone https://github.com/yuraist/appstoreconnect-mcp.git
cd appstoreconnect-mcp
npm install
npm run build
```

2. Create a `.env` file from the example:

```bash
cp .env.example .env
```

3. Fill in your API credentials:

```
ASC_ISSUER_ID=your-issuer-id
ASC_KEY_ID=your-key-id
ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
```

You'll find the Issuer ID and Key ID on the [App Store Connect API Keys](https://appstoreconnect.apple.com/access/integrations/api) page.

## Usage with Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "appstoreconnect": {
      "command": "node",
      "args": ["/absolute/path/to/appstoreconnect-mcp/build/index.js"],
      "env": {
        "ASC_ISSUER_ID": "your-issuer-id",
        "ASC_KEY_ID": "your-key-id",
        "ASC_PRIVATE_KEY_PATH": "/path/to/AuthKey_XXXXXXXXXX.p8"
      }
    }
  }
}
```

Restart Claude Desktop. The App Store Connect tools will appear in the tool list.

## Usage with Claude Code

Add the server to your project:

```bash
claude mcp add appstoreconnect -- node /absolute/path/to/appstoreconnect-mcp/build/index.js
```

Or add it globally:

```bash
claude mcp add --scope user appstoreconnect -- node /absolute/path/to/appstoreconnect-mcp/build/index.js
```

Make sure the environment variables are set in your shell, or use the `.env` file in the project directory.

## Example Prompts

Once connected, try asking Claude:

- "List all my apps in App Store Connect"
- "Show me the current review status for my app"
- "Create a new consumable IAP called 'Premium Gems' with product ID com.example.gems"
- "What subscription groups do I have for app X?"
- "Add this build to the External Testers beta group"
- "Start an A/B test experiment on the current version"

## Security

Your API key (`.p8` file) never leaves your machine. The MCP server runs locally, authenticating directly with Apple's API using short-lived JWTs.

## License

MIT
