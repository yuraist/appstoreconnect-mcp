# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript MCP server wrapping Apple's App Store Connect API v2. Provides tools for IAP management, subscription pricing, product page optimization, and release monitoring. Designed for local use with Claude Code / Claude Desktop, structured for eventual npm publishing.

**Current status:** Design phase. The design document is at `docs/plans/2026-02-14-appstoreconnect-mcp-design.md`. No implementation code exists yet.

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

**Tools (`src/tools/`):** MCP tools organized by domain — apps, iap, subscriptions, product-pages, review, builds. 43+ tools total covering app listing, IAP CRUD, subscription management, A/B experiments, review submissions, and TestFlight.

**Types (`src/types/index.ts`):** Shared TypeScript type definitions.

## Error Handling Pattern

API errors are mapped to readable messages with structured responses: `{ error: true, code: "CONFLICT", message: "...", details: [...] }`. Network failures get one retry before surfacing.
