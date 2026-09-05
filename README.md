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

**Keyword Research (Apple Ads)** — Apple's own App Store search term popularity, keyword suggestions, and impression share. Optional, and needs separate credentials — see [Apple Ads setup](#apple-ads-setup-optional).

See the full [tool reference](docs/tools.md) for all 51+ available tools.

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

## Apple Ads Setup (optional)

In August 2026 Apple released the [Apple Ads Platform API 1.0](https://developer.apple.com/documentation/apple-ads-platform-api), which exposes **App Store search term popularity** — first-party keyword demand data that ASO tools previously could only estimate from models and historical data. This server can query it, along with keyword and phrase suggestions.

These tools are off unless you configure them, so the server works fine with App Store Connect alone.

**These are not your App Store Connect credentials.** Apple Ads uses a different host, a different key registry, and a different auth model (OAuth2 client-credentials, where the JWT is only the client secret rather than the bearer token itself). Your `.p8` will not work here.

**You must be on [Apple Ads Advanced](https://ads.apple.com/app-store/help/apple-ads-basic/0001-compare-apple-ads-solutions), not Basic.** Apple's comparison page is explicit that Basic gets "no keyword data or access to the Apple Ads Platform API" — it is disqualified twice over. Pick Advanced at signup.

**You do not need a company.** Apple's [setup guide](https://ads.apple.com/app-store/help/get-started/0004-set-up-an-account) says that if you're a sole proprietor you answer "No" to the business-entity question and use your own legal name as the legal entity name. No D-U-N-S number is involved anywhere in this flow, and an Individual Apple Developer account is fine.

**What you need:**

- An [Apple Ads Advanced account](https://ads.apple.com). Creating one requires a live iPhone or iPad app on the App Store, an Apple Account with an email address (phone-number-only accounts are rejected), and an App Store Connect role of Admin, Legal, App Manager, or Marketing to link the two.
- A valid credit or debit card. Prepaid cards, gift cards, and digital wallets like PayPal are explicitly rejected. No minimum spend or deposit is documented — a working card on file is the real requirement.
- API access created by an Account Admin at ads.apple.com → Account Settings → API, where you upload the public half of an EC P-256 key pair and receive a client ID, team ID, and key ID.

Two settings are permanent once chosen: **account currency and time zone**. Changing currency later means creating a new account. Supported currencies are AUD, GBP, CAD, RMB (mainland China), EUR, INR (UPI only), JPY, MXN, NZD, and USD — check [countries and regions](https://ads.apple.com/app-store/countries-and-regions), which lists permitted advertiser-residence countries separately from the storefronts you can advertise in.

Generate the key pair with:

```bash
openssl ecparam -genkey -name prime256v1 -noout -out apple-ads-private-key.pem
openssl ec -in apple-ads-private-key.pem -pubout -out apple-ads-public-key.pem
```

Then add to `.env`:

```
APPLE_ADS_CLIENT_ID=SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_ADS_TEAM_ID=SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_ADS_KEY_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_ADS_PRIVATE_KEY_PATH=/path/to/apple-ads-private-key.pem
APPLE_ADS_AD_ACCOUNT_ID=your-ad-account-id
```

Don't know your ad account ID? Leave it unset, start the server, and run the `list_ad_accounts` tool — it's the one call that works without it.

**What the data looks like.** `get_search_term_popularity` returns up to the top 500 search terms per country and genre, scored 1–100 (within genre and overall) and 1–5 (matching the figure in the Apple Ads UI). Only terms with at least 500 searches appear. Scoping is per storefront, not per language. Weekly data is published Mondays at 07:00 UTC with 65 weeks of history; monthly data on the 5th of each month with 15 months. No advertising campaign is required to query it.

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


## Codex and other local MCP clients

Build once with `npm ci && npm run build`. Launch with `node scripts/launch.mjs`.
The launcher loads only `ASC_*` and `APPLE_ADS_*` variables from
`~/Developer/.secrets/.env`, or the file selected by `ASC_ENV_FILE`.
Explicit process environment values take precedence. Key material stays local.
The stdio protocol works from any working directory.

For Codex CLI, register with `codex mcp add appstoreconnect -- node /absolute/path/to/appstoreconnect-mcp/scripts/launch.mjs`.
Use either this registration or the personal Codex plugin, so tools appear once.
For Claude Code, use the same command and arguments in the `appstoreconnect`
MCP entry. No credentials need to be embedded in the client configuration.

`npm run smoke` checks protocol initialization, tool discovery, and annotations.
`npm run smoke:live` additionally calls the read-only `list_apps` endpoint and
prints only the count. Neither command changes App Store Connect data.

This is a local connector. A remotely hosted connector would separately need
Streamable HTTP, client authentication/OAuth, per-user Apple credential storage,
and a deployment. The personal Codex plugin does not expose a public endpoint.
