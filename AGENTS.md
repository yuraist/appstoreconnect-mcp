# Agent instructions

These instructions apply to coding agents working in this repository.

## Project Overview

TypeScript MCP server wrapping two Apple APIs: the App Store Connect API v2 (IAP management, subscription pricing, product page optimization, release monitoring) and, optionally, the Apple Ads Platform API 1.0 (search term popularity and keyword research for ASO). Designed for local use with Claude Code / Claude Desktop, structured for eventual npm publishing.

## Stack

- TypeScript + Node.js
- `@modelcontextprotocol/sdk` — official MCP SDK
- `jsonwebtoken` — ES256 JWT signing
- `dotenv` — environment variable loading
- Native `fetch` for HTTP (no axios/node-fetch)

## Architecture

**Entry point:** `src/index.ts` — MCP server bootstrap

**Auth (`src/auth/jwt.ts`):** Reads `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY_PATH` from environment. Generates ES256-signed JWTs from `.p8` private key, cached for 15 minutes with auto-refresh.

**API Client (`src/api/client.ts`):** Single `AppStoreConnectClient` class. Unwraps JSON:API envelopes into flat objects. Handles cursor-based pagination (auto-fetch-all by default), rate limiting via `Retry-After` headers, and single retry with exponential backoff.

**Ads Auth (`src/auth/ads-oauth.ts`):** Apple Ads uses OAuth2 client-credentials, *not* the ASC scheme. A long-lived ES256 JWT (`iss`=teamId, `sub`=clientId, `aud`=appleid.apple.com, ≤180 days) serves as the `client_secret`, which is exchanged at `appleid.apple.com/auth/oauth2/token` for a 1-hour access token. The two credential sets are not interchangeable.

**Ads Client (`src/api/ads-client.ts`):** `AppleAdsClient`. Base `https://api.ads.apple.com`, paths carry their own `/v1/` prefix. Unwraps the `{data, pagination, error}` envelope. Note the context header is `X-AP-Context: adAccountId=…` — the old Campaign Management v4/v5 `orgId=` form is wrong for Platform API 1.0. `query()` walks the `{offset, pageSize}` cursor (max 5000/page); 429s back off exponentially and give up after 5 retries.

**Tools (`src/tools/`):** MCP tools organized by domain — apps, iap, subscriptions, product-pages, review, builds, ads. 48+ tools. The `ads` tools register only when the `APPLE_ADS_*` env vars are set, so the server stays usable with App Store Connect alone.

**Types (`src/types/index.ts`):** Shared TypeScript type definitions. `ToolContext` for ASC tools, `AdsToolContext` for Apple Ads tools.

## Error Handling Pattern

API errors are mapped to readable messages with structured responses: `{ error: true, code: "CONFLICT", message: "...", details: [...] }`. Network failures get one retry before surfacing.

## Agent skills

For engineering workflows, read `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md` as needed. Shared skills live in `~/.agents/skills`.
