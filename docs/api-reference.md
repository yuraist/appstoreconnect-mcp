# App Store Connect API & MCP SDK Reference

Structured reference for implementing the App Store Connect MCP Server.

---

## Base URL & Authentication

**Base URL:** `https://api.appstoreconnect.apple.com`

All requests require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <JWT>
```

### JWT Authentication (ES256)

**Header:**
```json
{
  "alg": "ES256",
  "kid": "<ASC_KEY_ID>",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "iss": "<ASC_ISSUER_ID>",
  "iat": <current_unix_timestamp>,
  "exp": <current_unix_timestamp + 1200>,
  "aud": "appstoreconnect-v1"
}
```

- **Algorithm:** ES256 (ECDSA with P-256 and SHA-256)
- **Key format:** `.p8` file (PKCS#8 PEM-encoded EC private key)
- **Max expiry:** 20 minutes (1200 seconds) from `iat`
- **Audience:** `"appstoreconnect-v1"` (for standard accounts) or `"apple-developer-enterprise-v1"` (for enterprise)
- **Clock skew:** Subtract ~10 seconds from `iat` to account for clock drift
- **Caching:** Cache tokens for up to 15 minutes, auto-refresh before expiry

**TypeScript signing example (using `jsonwebtoken`):**
```typescript
import jwt from 'jsonwebtoken';
import fs from 'fs';

function generateToken(issuerId: string, keyId: string, privateKeyPath: string): string {
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: issuerId,
      iat: now,
      exp: now + 1200,
      aud: 'appstoreconnect-v1',
    },
    privateKey,
    {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' },
    }
  );
}
```

---

## JSON:API Envelope Format

All responses follow the JSON:API specification:

```json
{
  "data": {
    "type": "resourceType",
    "id": "string",
    "attributes": { ... },
    "relationships": { ... },
    "links": { "self": "..." }
  },
  "links": { "self": "...", "next": "..." },
  "meta": { "paging": { "total": 100, "limit": 50 } },
  "included": [ ... ]
}
```

**List responses** use `"data": [...]` (array).
**Pagination:** Follow `links.next` URL for next page, or use `?cursor=` parameter.
**Common query params:** `fields[type]`, `filter[field]`, `include`, `limit`, `sort`.

---

## 1. Apps

### List Apps
```
GET /v1/apps
```
**Query params:** `fields[apps]`, `filter[bundleId]`, `filter[name]`, `filter[sku]`, `limit` (max 200), `sort`, `include`
**Key response attributes:** `name`, `bundleId`, `sku`, `primaryLocale`, `isOrEverWasMadeForKids`, `availableInNewTerritories`
**Type string:** `"apps"`

### Get App
```
GET /v1/apps/{id}
```
**Query params:** `fields[apps]`, `include`
**Key response attributes:** same as above

### List App Versions
```
GET /v1/apps/{id}/appStoreVersions
```
**Query params:** `fields[appStoreVersions]`, `filter[platform]` (`IOS`, `MAC_OS`, `TV_OS`, `VISION_OS`), `filter[versionString]`, `filter[appStoreState]`, `limit` (max 200), `include`
**Key response attributes:** `versionString`, `platform`, `appStoreState`, `copyright`, `releaseType`, `earliestReleaseDate`, `downloadable`, `createdDate`
**Type string:** `"appStoreVersions"`

**App Store States:** `ACCEPTED`, `DEVELOPER_REMOVED_FROM_SALE`, `DEVELOPER_REJECTED`, `IN_REVIEW`, `INVALID_BINARY`, `METADATA_REJECTED`, `PENDING_APPLE_RELEASE`, `PENDING_CONTRACT`, `PENDING_DEVELOPER_RELEASE`, `PREPARE_FOR_SUBMISSION`, `PREORDER_READY_FOR_SALE`, `PROCESSING_FOR_APP_STORE`, `READY_FOR_REVIEW`, `READY_FOR_SALE`, `REJECTED`, `REMOVED_FROM_SALE`, `WAITING_FOR_EXPORT_COMPLIANCE`, `WAITING_FOR_REVIEW`, `REPLACED_WITH_NEW_VERSION`, `NOT_APPLICABLE`

---

## 2. In-App Purchases

### List IAPs
```
GET /v1/apps/{id}/inAppPurchasesV2
```
**Query params:**
- `fields[inAppPurchases]`: `name`, `productId`, `inAppPurchaseType`, `state`, `reviewNote`, `familySharable`, `contentHosting`, `inAppPurchaseLocalizations`, `pricePoints`, `content`, `appStoreReviewScreenshot`, `promotedPurchase`, `iapPriceSchedule`, `inAppPurchaseAvailability`, `images`, `offerCodes`
- `filter[inAppPurchaseType]`: `CONSUMABLE`, `NON_CONSUMABLE`, `NON_RENEWING_SUBSCRIPTION`
- `filter[name]`, `filter[productId]`, `filter[state]`
- `include`: `inAppPurchaseLocalizations`, `content`, `appStoreReviewScreenshot`, `promotedPurchase`, `iapPriceSchedule`, `inAppPurchaseAvailability`, `images`, `offerCodes`
- `limit` (max 200), `sort`: `name`, `-name`, `inAppPurchaseType`, `-inAppPurchaseType`
**Type string:** `"inAppPurchases"`

**IAP States:** `MISSING_METADATA`, `WAITING_FOR_UPLOAD`, `PROCESSING_CONTENT`, `READY_TO_SUBMIT`, `WAITING_FOR_REVIEW`, `IN_REVIEW`, `DEVELOPER_ACTION_NEEDED`, `PENDING_BINARY_APPROVAL`, `APPROVED`, `DEVELOPER_REMOVED_FROM_SALE`, `REMOVED_FROM_SALE`, `REJECTED`

### Get IAP
```
GET /v2/inAppPurchases/{id}
```

### Create IAP
```
POST /v2/inAppPurchases
```
**Request body:**
```json
{
  "data": {
    "type": "inAppPurchases",
    "attributes": {
      "name": "string (required)",
      "productId": "string (required)",
      "inAppPurchaseType": "CONSUMABLE | NON_CONSUMABLE | NON_RENEWING_SUBSCRIPTION (required)",
      "reviewNote": "string (optional)",
      "familySharable": "boolean (optional)"
    },
    "relationships": {
      "app": {
        "data": { "type": "apps", "id": "<app_id>" }
      }
    }
  }
}
```
**Response:** `201 Created` with `InAppPurchaseV2Response`

### Update IAP
```
PATCH /v2/inAppPurchases/{id}
```
**Request body:** Same structure, all attributes optional. Include only fields to update.

### Delete IAP
```
DELETE /v2/inAppPurchases/{id}
```
**Response:** `204 No Content`

### IAP Localizations

**List localizations:**
```
GET /v2/inAppPurchases/{id}/inAppPurchaseLocalizations
```

**Create localization:**
```
POST /v1/inAppPurchaseLocalizations
```
```json
{
  "data": {
    "type": "inAppPurchaseLocalizations",
    "attributes": {
      "locale": "string (required, e.g. 'en-US')",
      "name": "string (required)",
      "description": "string (optional)"
    },
    "relationships": {
      "inAppPurchaseV2": {
        "data": { "type": "inAppPurchases", "id": "<iap_id>" }
      }
    }
  }
}
```

**Update localization:**
```
PATCH /v1/inAppPurchaseLocalizations/{id}
```

**Delete localization:**
```
DELETE /v1/inAppPurchaseLocalizations/{id}
```

### IAP Price Points
```
GET /v2/inAppPurchases/{id}/pricePoints
```
**Query params:**
- `fields[inAppPurchasePricePoints]`: `customerPrice`, `proceeds`, `territory`, `equalizations`
- `filter[territory]`
- `include`: `territory`
- `limit` (max 8000)

**Key response attributes:** `customerPrice`, `proceeds`

### IAP Price Schedule
```
POST /v1/inAppPurchasePriceSchedules
```
Used to set or change prices with a schedule. The request relates to a specific IAP and includes inline price entries.

### Submit IAP for Review
```
POST /v1/inAppPurchaseSubmissions
```
```json
{
  "data": {
    "type": "inAppPurchaseSubmissions",
    "relationships": {
      "inAppPurchaseV2": {
        "data": { "type": "inAppPurchases", "id": "<iap_id>" }
      }
    }
  }
}
```
**Response:** `201 Created`

---

## 3. Subscriptions

### List Subscription Groups
```
GET /v1/apps/{id}/subscriptionGroups
```
**Query params:**
- `fields[subscriptionGroups]`: `referenceName`, `subscriptions`, `subscriptionGroupLocalizations`
- `fields[subscriptions]`: `name`, `productId`, `familySharable`, `state`, `subscriptionPeriod`, `reviewNote`, `groupLevel`, `subscriptionLocalizations`, `appStoreReviewScreenshot`, `group`, `introductoryOffers`, `promotionalOffers`, `offerCodes`, `prices`, `pricePoints`, `promotedPurchase`, `subscriptionAvailability`, `winBackOffers`, `images`
- `filter[referenceName]`, `filter[subscriptions.state]`
- `include`: `subscriptions`, `subscriptionGroupLocalizations`
- `limit` (max 200), `sort`: `referenceName`, `-referenceName`
**Type string:** `"subscriptionGroups"`

### Create Subscription Group
```
POST /v1/subscriptionGroups
```
```json
{
  "data": {
    "type": "subscriptionGroups",
    "attributes": {
      "referenceName": "string (required)"
    },
    "relationships": {
      "app": {
        "data": { "type": "apps", "id": "<app_id>" }
      }
    }
  }
}
```

### List Subscriptions in Group
```
GET /v1/subscriptionGroups/{id}/subscriptions
```
**Query params:**
- `fields[subscriptions]`: `name`, `productId`, `familySharable`, `state`, `subscriptionPeriod`, `reviewNote`, `groupLevel`, etc.
- `filter[name]`, `filter[productId]`, `filter[state]`
- `include`: `subscriptionLocalizations`, `group`, `introductoryOffers`, `promotionalOffers`, `offerCodes`, `prices`, etc.
- `limit` (max 200), `sort`: `name`, `-name`
**Type string:** `"subscriptions"`

**Subscription States:** `MISSING_METADATA`, `READY_TO_SUBMIT`, `WAITING_FOR_REVIEW`, `IN_REVIEW`, `DEVELOPER_ACTION_NEEDED`, `PENDING_BINARY_APPROVAL`, `APPROVED`, `DEVELOPER_REMOVED_FROM_SALE`, `REMOVED_FROM_SALE`, `REJECTED`

### Create Subscription
```
POST /v1/subscriptions
```
```json
{
  "data": {
    "type": "subscriptions",
    "attributes": {
      "name": "string (required)",
      "productId": "string (required)",
      "subscriptionPeriod": "ONE_WEEK | ONE_MONTH | TWO_MONTHS | THREE_MONTHS | SIX_MONTHS | ONE_YEAR (optional)",
      "familySharable": "boolean (optional)",
      "reviewNote": "string (optional)",
      "groupLevel": "integer (optional)"
    },
    "relationships": {
      "group": {
        "data": { "type": "subscriptionGroups", "id": "<group_id>" }
      }
    }
  }
}
```

### Update Subscription
```
PATCH /v1/subscriptions/{id}
```
All attributes optional. Include only fields to update.

### Subscription Localizations

**Create:**
```
POST /v1/subscriptionLocalizations
```
```json
{
  "data": {
    "type": "subscriptionLocalizations",
    "attributes": {
      "locale": "string (required, e.g. 'en-US')",
      "name": "string (required)",
      "description": "string (optional)"
    },
    "relationships": {
      "subscription": {
        "data": { "type": "subscriptions", "id": "<subscription_id>" }
      }
    }
  }
}
```

**Update:**
```
PATCH /v1/subscriptionLocalizations/{id}
```

**Delete:**
```
DELETE /v1/subscriptionLocalizations/{id}
```

### Subscription Prices
```
POST /v1/subscriptionPrices
```
Creates a price entry linking a subscription to a price point and territory. The relationship references a `subscriptionPricePoint` and optionally a `territory`.

### Subscription Price Points
```
GET /v1/subscriptions/{id}/pricePoints
```
Returns available price tiers per territory.

### Subscription Introductory Offers
```
POST   /v1/subscriptionIntroductoryOffers
PATCH  /v1/subscriptionIntroductoryOffers/{id}
DELETE /v1/subscriptionIntroductoryOffers/{id}
```

### Subscription Promotional Offers
```
POST   /v1/subscriptionPromotionalOffers
GET    /v1/subscriptionPromotionalOffers/{id}
PATCH  /v1/subscriptionPromotionalOffers/{id}
DELETE /v1/subscriptionPromotionalOffers/{id}
GET    /v1/subscriptionPromotionalOffers/{id}/prices
```

### Subscription Offer Codes
Managed under `/v1/subscriptionOfferCodes` and related endpoints.

---

## 4. Product Page Optimization

### Custom Product Pages

**List:**
```
GET /v1/apps/{id}/appCustomProductPages
```
**Query params:**
- `fields[appCustomProductPages]`: `name`, `url`, `visible`, `app`, `appCustomProductPageVersions`
- `filter[visible]`
- `include`: `app`, `appCustomProductPageVersions`
- `limit` (max 200)
**Type string:** `"appCustomProductPages"`
**Key response attributes:** `name`, `url`, `visible`

**Create:**
```
POST /v1/appCustomProductPages
```
```json
{
  "data": {
    "type": "appCustomProductPages",
    "attributes": {
      "name": "string (required)"
    },
    "relationships": {
      "app": {
        "data": { "type": "apps", "id": "<app_id>" }
      },
      "appCustomProductPageVersions": {
        "data": [
          { "type": "appCustomProductPageVersions", "id": "${new-version-id}" }
        ]
      }
    }
  }
}
```

**Get:**
```
GET /v1/appCustomProductPages/{id}
```

**Update:**
```
PATCH /v1/appCustomProductPages/{id}
```
Attributes: `name` (optional), `visible` (optional).

**Delete:**
```
DELETE /v1/appCustomProductPages/{id}
```

### Custom Product Page Versions
```
GET  /v1/appCustomProductPages/{id}/appCustomProductPageVersions
POST /v1/appCustomProductPageVersions
GET  /v1/appCustomProductPageVersions/{id}
```
**Key attributes:** `version`, `state`, `deepLink`

### Experiments (A/B Tests) -- V2 Endpoints (current)

**List experiments for a version:**
```
GET /v1/appStoreVersions/{id}/appStoreVersionExperimentsV2
```

**Create experiment:**
```
POST /v2/appStoreVersionExperiments
```
```json
{
  "data": {
    "type": "appStoreVersionExperiments",
    "attributes": {
      "name": "string (required)",
      "platform": "IOS | MAC_OS | TV_OS | VISION_OS (required)",
      "trafficProportion": "integer (required, e.g. 50 for 50%)"
    },
    "relationships": {
      "app": {
        "data": { "type": "apps", "id": "<app_id>" }
      }
    }
  }
}
```

**Get experiment:**
```
GET /v2/appStoreVersionExperiments/{id}
```

**Update experiment (start/stop):**
```
PATCH /v2/appStoreVersionExperiments/{id}
```
Use `state` attribute to control: set to `"STARTED"` to begin, update as needed to stop.

**Delete experiment:**
```
DELETE /v2/appStoreVersionExperiments/{id}
```

**List experiment treatments (variants):**
```
GET /v2/appStoreVersionExperiments/{id}/appStoreVersionExperimentTreatments
```

**Create treatment:**
```
POST /v1/appStoreVersionExperimentTreatments
```

**Treatment localizations:**
```
POST /v1/appStoreVersionExperimentTreatmentLocalizations
```

---

## 5. Review & Submissions

### Review Submissions

**Create review submission:**
```
POST /v1/reviewSubmissions
```
```json
{
  "data": {
    "type": "reviewSubmissions",
    "attributes": {
      "platform": "IOS | MAC_OS | TV_OS | VISION_OS (optional as of API 4.0)"
    },
    "relationships": {
      "app": {
        "data": { "type": "apps", "id": "<app_id>" }
      }
    }
  }
}
```
**Response:** `201 Created` with `ReviewSubmissionResponse`

**List review submissions for app:**
```
GET /v1/apps/{id}/reviewSubmissions
```

**Get review submission:**
```
GET /v1/reviewSubmissions/{id}
```

**Update review submission (to submit/cancel):**
```
PATCH /v1/reviewSubmissions/{id}
```

### Review Submission Items
```
POST /v1/reviewSubmissionItems
```
```json
{
  "data": {
    "type": "reviewSubmissionItems",
    "relationships": {
      "reviewSubmission": {
        "data": { "type": "reviewSubmissions", "id": "<submission_id>" }
      },
      "appStoreVersion": {
        "data": { "type": "appStoreVersions", "id": "<version_id>" }
      }
    }
  }
}
```
Items can also reference `appCustomProductPageVersion`, `appEvent`, `appStoreVersionExperimentV2`, or `inAppPurchaseV2` instead of (or in addition to) `appStoreVersion`.

### App Store Version Submissions (Legacy)
```
POST /v1/appStoreVersionSubmissions
```
```json
{
  "data": {
    "type": "appStoreVersionSubmissions",
    "relationships": {
      "appStoreVersion": {
        "data": { "type": "appStoreVersions", "id": "<version_id>" }
      }
    }
  }
}
```

### App Store Review Details
```
GET  /v1/appStoreReviewDetails/{id}
POST /v1/appStoreReviewDetails
```

---

## 6. Builds & TestFlight

### List Builds
```
GET /v1/builds
```
**Query params:**
- `filter[app]`: filter by app ID
- `filter[version]`: filter by version string
- `filter[processingState]`: `PROCESSING`, `FAILED`, `INVALID`, `VALID`
- `filter[expired]`, `filter[preReleaseVersion.version]`
- `fields[builds]`: `version`, `uploadedDate`, `expirationDate`, `expired`, `minOsVersion`, `processingState`, `buildAudienceType`, etc.
- `include`: `app`, `preReleaseVersion`, `betaGroups`, `individualTesters`, `buildBetaDetail`, `betaBuildLocalizations`, etc.
- `limit` (max 200), `sort`: `version`, `-version`, `uploadedDate`, `-uploadedDate`
**Type string:** `"builds"`
**Key response attributes:** `version`, `uploadedDate`, `expirationDate`, `expired`, `minOsVersion`, `processingState`, `buildAudienceType`

### Get Build
```
GET /v1/builds/{id}
```

### Update Build
```
PATCH /v1/builds/{id}
```

### List Beta Groups
```
GET /v1/betaGroups
```
**Query params:** `filter[app]`, `filter[name]`, `filter[isInternalGroup]`, `limit` (max 200)
**Key response attributes:** `name`, `isInternalGroup`, `publicLinkEnabled`, `publicLinkLimit`, `createdDate`
**Type string:** `"betaGroups"`

### Create Beta Group
```
POST /v1/betaGroups
```
```json
{
  "data": {
    "type": "betaGroups",
    "attributes": {
      "name": "string (required)",
      "isInternalGroup": "boolean (optional)",
      "publicLinkEnabled": "boolean (optional)",
      "publicLinkLimit": "integer (optional)"
    },
    "relationships": {
      "app": {
        "data": { "type": "apps", "id": "<app_id>" }
      }
    }
  }
}
```

### Add Build to Beta Group
```
POST /v1/betaGroups/{beta_group_id}/relationships/builds
```
```json
{
  "data": [
    { "type": "builds", "id": "<build_id>" }
  ]
}
```

### Remove Build from Beta Group
```
DELETE /v1/betaGroups/{beta_group_id}/relationships/builds
```
Same body structure.

### Add Builds to a Build (via relationship)
```
POST /v1/builds/{build_id}/relationships/betaGroups
```
```json
{
  "data": [
    { "type": "betaGroups", "id": "<group_id>" }
  ]
}
```

### List Beta Testers
```
GET /v1/betaTesters
```
**Query params:** `filter[email]`, `filter[firstName]`, `filter[lastName]`, `filter[apps]`, `filter[betaGroups]`, `limit` (max 200)
**Key response attributes:** `firstName`, `lastName`, `email`, `inviteType`, `state`
**Type string:** `"betaTesters"`

### Create Beta Tester
```
POST /v1/betaTesters
```
```json
{
  "data": {
    "type": "betaTesters",
    "attributes": {
      "email": "string (required)",
      "firstName": "string (optional)",
      "lastName": "string (optional)"
    },
    "relationships": {
      "betaGroups": {
        "data": [
          { "type": "betaGroups", "id": "<group_id>" }
        ]
      }
    }
  }
}
```

### Add Beta Tester to Group
```
POST /v1/betaGroups/{beta_group_id}/relationships/betaTesters
```
```json
{
  "data": [
    { "type": "betaTesters", "id": "<tester_id>" }
  ]
}
```

### Beta App Localizations
```
GET   /v1/betaAppLocalizations
POST  /v1/betaAppLocalizations
PATCH /v1/betaAppLocalizations/{id}
```

---

## 7. App Store Version Localizations

### List Localizations for a Version
```
GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations
```
**Type string:** `"appStoreVersionLocalizations"`

### Create Localization
```
POST /v1/appStoreVersionLocalizations
```
```json
{
  "data": {
    "type": "appStoreVersionLocalizations",
    "attributes": {
      "locale": "string (required, e.g. 'en-US')",
      "description": "string (optional)",
      "keywords": "string (optional)",
      "marketingUrl": "uri (optional)",
      "promotionalText": "string (optional)",
      "supportUrl": "uri (optional)",
      "whatsNew": "string (optional)"
    },
    "relationships": {
      "appStoreVersion": {
        "data": { "type": "appStoreVersions", "id": "<version_id>" }
      }
    }
  }
}
```

### Update Localization (descriptions, what's new, keywords)
```
PATCH /v1/appStoreVersionLocalizations/{id}
```
**Updatable attributes (all optional):**
```json
{
  "data": {
    "type": "appStoreVersionLocalizations",
    "id": "<localization_id>",
    "attributes": {
      "description": "string",
      "keywords": "string",
      "marketingUrl": "uri",
      "promotionalText": "string",
      "supportUrl": "uri",
      "whatsNew": "string"
    }
  }
}
```

### Delete Localization
```
DELETE /v1/appStoreVersionLocalizations/{id}
```

### Screenshots

**List screenshot sets for a localization:**
```
GET /v1/appStoreVersionLocalizations/{id}/appScreenshotSets
```

**Create screenshot set:**
```
POST /v1/appScreenshotSets
```
Relates to an `appStoreVersionLocalization` with a `screenshotDisplayType`.

**Upload screenshot (reserve then upload):**
```
POST /v1/appScreenshots
```
Reserves an upload slot. Returns `uploadOperations` with URLs and headers for multipart upload. After uploading binary data to those URLs, commit with:
```
PATCH /v1/appScreenshots/{id}
```
Set `uploaded: true` and `sourceFileChecksum` to confirm upload.

**Reorder screenshots:**
```
PATCH /v1/appScreenshotSets/{id}/relationships/appScreenshots
```

### App Previews

**List preview sets:**
```
GET /v1/appStoreVersionLocalizations/{id}/appPreviewSets
```

**Create preview set:**
```
POST /v1/appPreviewSets
```

**Upload preview (same reserve-then-upload pattern):**
```
POST /v1/appPreviews
```
Then upload binary data, then commit:
```
PATCH /v1/appPreviews/{id}
```

**Reorder previews:**
```
PATCH /v1/appPreviewSets/{id}/relationships/appPreviews
```

---

## MCP SDK for TypeScript

### Package Info
- **Stable package:** `@modelcontextprotocol/sdk` v1.26.0
- **Next-gen package:** `@modelcontextprotocol/server` v2.0.0-alpha (not yet stable)
- **Use the stable v1.x** for production

### Installation
```bash
npm install @modelcontextprotocol/sdk zod
```

### Import Paths
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
```

### Minimal MCP Server Example
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'appstoreconnect-mcp',
  version: '1.0.0',
});

// Register a tool
server.registerTool(
  'list_apps',
  {
    title: 'List Apps',
    description: 'List all apps in App Store Connect',
    inputSchema: z.object({
      limit: z.number().optional().describe('Max results to return'),
      bundleId: z.string().optional().describe('Filter by bundle ID'),
    }),
  },
  async ({ limit, bundleId }) => {
    // Implementation here - call App Store Connect API
    const result = await fetchApps({ limit, bundleId });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Key API Methods

**`McpServer` constructor:**
```typescript
new McpServer({ name: string, version: string }, options?: ServerOptions)
```

**`registerTool`:**
```typescript
server.registerTool(
  name: string,
  config: {
    title?: string;
    description?: string;
    inputSchema?: ZodSchema;    // Zod schema for input validation
    outputSchema?: ZodSchema;   // Optional Zod schema for output
    annotations?: ToolAnnotations;
  },
  handler: async (input, context) => ({
    content: Array<{ type: 'text', text: string } | { type: 'image', data: string, mimeType: string }>,
    structuredContent?: object,  // Only when outputSchema is defined
  })
)
```

**`registerResource`:**
```typescript
server.registerResource(
  name: string,
  uri: string,
  config: { title?: string; description?: string; mimeType?: string },
  handler: async (uri: URL) => ({
    contents: Array<{ uri: string; text: string } | { uri: string; blob: string }>
  })
)
```

**`registerPrompt`:**
```typescript
server.registerPrompt(
  name: string,
  config: { title?: string; description?: string; argsSchema?: ZodSchema },
  handler: (args) => ({
    messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>
  })
)
```

**Transport and connection:**
```typescript
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Logging from tool handler:**
```typescript
async (input, ctx) => {
  await ctx.mcpReq.log('info', 'Some log message');
  // ...
}
```

**Other methods:**
- `server.close()` -- Disconnect
- `server.isConnected()` -- Check connection state
- `server.sendLoggingMessage(params)` -- Send log message
- `server.sendResourceListChanged()` -- Notify resource list changed
- `server.sendToolListChanged()` -- Notify tool list changed

---

## Quick Reference: All Key Endpoints

| Category | Method | Path | Type String |
|----------|--------|------|-------------|
| Apps | GET | `/v1/apps` | `apps` |
| Apps | GET | `/v1/apps/{id}` | `apps` |
| App Versions | GET | `/v1/apps/{id}/appStoreVersions` | `appStoreVersions` |
| App Info | GET | `/v1/apps/{id}/appInfos` | `appInfos` |
| IAPs (list) | GET | `/v1/apps/{id}/inAppPurchasesV2` | `inAppPurchases` |
| IAP (CRUD) | POST/GET/PATCH/DELETE | `/v2/inAppPurchases` / `{id}` | `inAppPurchases` |
| IAP Localizations | POST/PATCH/DELETE | `/v1/inAppPurchaseLocalizations` / `{id}` | `inAppPurchaseLocalizations` |
| IAP Price Points | GET | `/v2/inAppPurchases/{id}/pricePoints` | `inAppPurchasePricePoints` |
| IAP Submission | POST | `/v1/inAppPurchaseSubmissions` | `inAppPurchaseSubmissions` |
| Sub Groups | GET | `/v1/apps/{id}/subscriptionGroups` | `subscriptionGroups` |
| Sub Groups | POST | `/v1/subscriptionGroups` | `subscriptionGroups` |
| Subscriptions | GET | `/v1/subscriptionGroups/{id}/subscriptions` | `subscriptions` |
| Subscriptions | POST/PATCH | `/v1/subscriptions` / `{id}` | `subscriptions` |
| Sub Localizations | POST/PATCH/DELETE | `/v1/subscriptionLocalizations` / `{id}` | `subscriptionLocalizations` |
| Sub Prices | POST | `/v1/subscriptionPrices` | `subscriptionPrices` |
| Sub Intro Offers | POST/PATCH/DELETE | `/v1/subscriptionIntroductoryOffers` / `{id}` | `subscriptionIntroductoryOffers` |
| Sub Promo Offers | POST/GET/PATCH/DELETE | `/v1/subscriptionPromotionalOffers` / `{id}` | `subscriptionPromotionalOffers` |
| Custom Pages | GET | `/v1/apps/{id}/appCustomProductPages` | `appCustomProductPages` |
| Custom Pages | POST/GET/PATCH/DELETE | `/v1/appCustomProductPages` / `{id}` | `appCustomProductPages` |
| Experiments (v2) | GET | `/v1/appStoreVersions/{id}/appStoreVersionExperimentsV2` | `appStoreVersionExperiments` |
| Experiments (v2) | POST/GET/PATCH/DELETE | `/v2/appStoreVersionExperiments` / `{id}` | `appStoreVersionExperiments` |
| Exp. Treatments | GET/POST | `/v2/.../{id}/appStoreVersionExperimentTreatments` | `appStoreVersionExperimentTreatments` |
| Review Submissions | POST | `/v1/reviewSubmissions` | `reviewSubmissions` |
| Review Submissions | GET | `/v1/apps/{id}/reviewSubmissions` | `reviewSubmissions` |
| Review Sub Items | POST | `/v1/reviewSubmissionItems` | `reviewSubmissionItems` |
| Version Submissions | POST | `/v1/appStoreVersionSubmissions` | `appStoreVersionSubmissions` |
| Builds | GET | `/v1/builds` | `builds` |
| Builds | GET/PATCH | `/v1/builds/{id}` | `builds` |
| Beta Groups | GET/POST | `/v1/betaGroups` / `{id}` | `betaGroups` |
| Beta Groups (builds) | POST/DELETE | `/v1/betaGroups/{id}/relationships/builds` | - |
| Beta Testers | GET/POST | `/v1/betaTesters` | `betaTesters` |
| Beta Testers (groups) | POST | `/v1/betaGroups/{id}/relationships/betaTesters` | - |
| Version Localizations | GET | `/v1/appStoreVersions/{id}/appStoreVersionLocalizations` | `appStoreVersionLocalizations` |
| Version Localizations | POST/PATCH/DELETE | `/v1/appStoreVersionLocalizations` / `{id}` | `appStoreVersionLocalizations` |
| Screenshots | POST/PATCH | `/v1/appScreenshots` / `{id}` | `appScreenshots` |
| Screenshot Sets | POST/GET | `/v1/appScreenshotSets` / `{id}` | `appScreenshotSets` |
| Previews | POST/PATCH | `/v1/appPreviews` / `{id}` | `appPreviews` |
| Preview Sets | POST/GET | `/v1/appPreviewSets` / `{id}` | `appPreviewSets` |
