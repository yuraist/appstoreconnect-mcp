# Tool Reference

All tools available through the App Store Connect MCP server, grouped by domain.

## Apps

| Tool | Description |
|------|-------------|
| `list_apps` | List all apps (name, bundle ID, platform, status) |
| `get_app` | Get details for a specific app by ID or bundle ID |
| `list_app_versions` | List all versions for an app (platform, state, version string) |

## In-App Purchases

| Tool | Description |
|------|-------------|
| `list_iaps` | List all IAPs for an app |
| `get_iap` | Details for a specific IAP |
| `create_iap` | Create a new IAP (consumable, non-consumable, or non-renewing subscription) |
| `update_iap` | Update reference name, review notes, screenshot |
| `delete_iap` | Delete a draft IAP |
| `list_iap_localizations` | Display names and descriptions per locale |
| `set_iap_localization` | Create or update localized name/description |
| `set_iap_price` | Set or update price point |
| `submit_iap_for_review` | Submit an IAP for review independently |

## Subscriptions

| Tool | Description |
|------|-------------|
| `list_subscription_groups` | List subscription groups for an app |
| `create_subscription_group` | Create a new group |
| `list_subscriptions` | List subscriptions within a group |
| `create_subscription` | Create a subscription (product ID, duration, group) |
| `update_subscription` | Update subscription details |
| `set_subscription_localization` | Localized name/description per locale |
| `set_subscription_price` | Set price points per territory |
| `list_subscription_offers` | List promotional/offer codes |
| `create_subscription_offer` | Create an offer (trial, pay-up-front, pay-as-you-go) |

## Product Page Optimization

| Tool | Description |
|------|-------------|
| `list_custom_product_pages` | List all custom product pages |
| `create_custom_product_page` | Create a new custom product page |
| `get_custom_product_page` | Details and performance for a page |
| `update_custom_product_page` | Update name or visibility |
| `list_experiments` | List all A/B test experiments |
| `get_experiment` | Experiment details (state, traffic proportion, dates) |
| `create_experiment` | Create a new A/B test |
| `start_experiment` | Begin running an experiment |
| `stop_experiment` | End an experiment |
| `get_experiment_results` | Conversion rates and improvements per variant |

## Builds & TestFlight

| Tool | Description |
|------|-------------|
| `list_builds` | Builds for an app, filterable by version/processing state |
| `get_build` | Details for a specific build |
| `list_beta_groups` | List TestFlight groups |
| `add_build_to_beta_group` | Assign a build to a beta group |
| `list_beta_testers` | List testers, filterable by group |

## App Review & Submissions

| Tool | Description |
|------|-------------|
| `get_review_status` | Current review state for an app version |
| `get_review_submission` | Latest submission details including rejection reasons |
| `list_app_store_version_localizations` | What's New text, description, keywords per locale |
| `submit_for_review` | Submit a version for App Review |

## App Store Localizations

| Tool | Description |
|------|-------------|
| `update_app_description` | Update description for a locale |
| `update_whats_new` | Update "What's New" text |
| `update_keywords` | Update keywords for a locale |
| `upload_screenshot` | Upload a screenshot for a locale/display type |
| `upload_preview` | Upload an app preview video |
