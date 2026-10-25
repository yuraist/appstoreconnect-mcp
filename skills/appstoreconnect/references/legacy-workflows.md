---
name: appstoreconnect
description: Use when working with App Store Connect — checking app status, managing subscriptions, IAPs, builds, review submissions, or updating metadata and pricing via the appstoreconnect MCP server
---

# App Store Connect MCP

## Overview

Use the personal `appstoreconnect` MCP server for App Store Connect and optional Apple Ads operations.

## Tool discovery

Discover available tools by server name and operation through the active client's tool search. In Claude, use ToolSearch if available. In Codex, search the callable tool catalog or plugin tools. Tool prefixes vary between clients, so use the names returned by discovery instead of assuming a fixed prefix.

The local server is at `~/Developer/appstoreconnect-mcp`. Its shared launcher is `node scripts/launch.mjs`; it loads only ASC/Apple Ads credentials from the local secret store. Run `npm run smoke:live` there to diagnose a connection with a read-only request. Apple Ads tools appear only when their separate credentials are configured.

Read current state and resolve IDs before writing. Carry out writes that the user has authorized; tool availability alone does not authorize pricing changes, deletion, or review submission.

## Workflows

### Check App Status

```
list_apps → get app ID
list_app_versions(appId, platform="IOS") → get version ID + state
get_review_submission(appId, platform="IOS") → submission state + rejection reasons
get_review_status(versionId) → detailed review state
```

### Manage Subscriptions

```
list_subscription_groups(appId) → get group ID
list_subscriptions(groupId) → get subscription IDs, states, group levels
update_subscription(subscriptionId, groupLevel, familySharable, reviewNote, name)
```

**Localizations (display name + description):**
```
list_subscription_localizations(subscriptionId) → get localization IDs
set_subscription_localization(subscriptionId, localizationId, locale, name, description)
```
- Create: omit `localizationId`, provide `subscriptionId` + `locale`
- Update: provide `localizationId` (required to update existing)

**Pricing:**
```
list_subscription_price_points(subscriptionId, territory="USA") → find price point ID
set_subscription_price(subscriptionId, pricePointId)
```

### Manage IAPs

```
list_iaps(appId) → get IAP IDs
get_iap(iapId) → details
create_iap(appId, name, productId, inAppPurchaseType)
list_iap_localizations(iapId) → localization IDs
set_iap_localization(iapId, locale, name, description)
set_iap_price(iapId, pricePointId)
submit_iap_for_review(iapId)
```

### Builds & TestFlight

```
list_builds(appId, processingState?, version?)
get_build(buildId)
list_beta_groups(appId)
add_build_to_beta_group(buildId, betaGroupId)
list_beta_testers(appId, betaGroupId?)
```

### App Store Listing

```
list_app_store_version_localizations(versionId) → localization IDs
update_app_description(localizationId, description)
update_whats_new(localizationId, whatsNew)
update_keywords(localizationId, keywords)
```

### Submit for Review

```
submit_for_review(appId, platform="IOS")
```

## Quick Reference — All Tools

| Domain | Tools |
|--------|-------|
| **Apps** | `list_apps`, `get_app`, `list_app_versions` |
| **Subscriptions** | `list_subscription_groups`, `create_subscription_group`, `list_subscriptions`, `create_subscription`, `update_subscription` |
| **Sub Localizations** | `list_subscription_localizations`, `set_subscription_localization` |
| **Sub Pricing** | `list_subscription_price_points`, `set_subscription_price` |
| **Sub Offers** | `list_subscription_offers`, `create_subscription_offer` |
| **IAP** | `list_iaps`, `get_iap`, `create_iap`, `update_iap`, `delete_iap` |
| **IAP Metadata** | `list_iap_localizations`, `set_iap_localization`, `set_iap_price`, `submit_iap_for_review` |
| **Builds** | `list_builds`, `get_build`, `list_beta_groups`, `add_build_to_beta_group`, `list_beta_testers` |
| **Review** | `get_review_status`, `get_review_submission`, `submit_for_review` |
| **Listing** | `list_app_store_version_localizations`, `update_app_description`, `update_whats_new`, `update_keywords` |
| **Product Pages** | `list_custom_product_pages`, `create_custom_product_page`, `get_custom_product_page`, `update_custom_product_page` |
| **Experiments** | `list_experiments`, `get_experiment`, `create_experiment`, `start_experiment`, `stop_experiment`, `get_experiment_results` |

## Gotchas

- **Subscription description max 55 characters.** ASC rejects longer strings with a 409 error.
- **Price points return huge lists.** Always filter by `territory` (e.g. "USA") to avoid 180K+ character responses. Parse results with `jq` or Python if needed.
- **Localization updates need IDs.** You must `list_*_localizations` first to get the existing localization ID, then pass it to the `set_*` tool. Creating a new localization for an existing locale returns a 409.
- **Group level 1 = highest priority.** Annual should typically be Level 1 (users upgrade monthly to annual). Lower number = higher tier.
- **MISSING_METADATA state** usually means missing localizations, pricing, or both. Check all three: localization name, description, and price.
- **Review notes** are per-subscription, not per-app. Each subscription product has its own review note field.
- **`familySharable`** is spelled with one 'l' in the ASC API (not "familyShareable").
