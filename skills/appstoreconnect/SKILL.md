---
name: appstoreconnect
description: Manage App Store Connect apps, TestFlight builds and testers, provisioning, metadata, subscriptions and releases through the local Apple API MCP or CLI.
---

# App Store Connect

Prefer the Apple API for supported operations. The local server provides a pinned official OpenAPI catalog, named TestFlight tools, and `asc-api` for scripts and long uploads. Discover tool names through the active client's catalog; prefixes vary.

## Route the task

- Frequent TestFlight work: `list_builds`, `list_beta_groups`, `create_beta_group`, `update_beta_group`, `create_beta_tester`, `add_testers_to_beta_group`, `remove_testers_from_beta_group`, `add_build_to_beta_group`, `set_beta_build_localization`, `set_build_export_compliance`, `submit_beta_review`, `get_beta_review_status`.
- Other Apple operations: `search_api_operations` → `get_api_operation` → `read_api` or `write_api`. Use the exact operationId, path/query parameters and JSON:API body from the schema. This covers provisioning, users, metadata, pricing, screenshots, analytics, Xcode Cloud, webhooks and other API domains.
- Signed binaries: `upload_build`, or `asc-api upload input.json` for long uploads. Input: appId, filePath, version, buildNumber, platform. Xcode/CI performs compilation and signing first.
- Screenshots, previews and review attachments: reserve with the corresponding create operation through `write_api`, then call `upload_reserved_asset` with resource type, resource ID and local file path. Read the asset processing state afterward.
- Existing IAP/subscription workflows and pricing gotchas: read [references/legacy-workflows.md](references/legacy-workflows.md) when needed.

## Execution

Resolve IDs and current state before writes, then perform changes within the user's request. `write_api` supports dryRun for schema validation. Generic reads return one JSON:API page, preserving relationships and included resources. Pass the cursor from links.next for subsequent pages. Binary reports use base64 in the returned envelope.

Internal testers must be eligible ASC team users. External testers use TestFlight invitations/public links. Invitations may send email; perform them when the user asks to invite or add testers. Team invitations are a separate API domain.

`submit_beta_review` is TestFlight external review. Complete beta app localizations, review contact/demo-account information and export compliance first. The catalog exposes those resources. `submit_for_review` performs App Store submission by creating/reusing the draft, attaching the version and submitting it. On an interrupted upload or review submission, inspect the returned reservation/submission IDs and resume existing work before creating duplicates. Validate success by reading the resulting Apple state.

Apple requires its website to create the initial app record. Bundle ID registration is a separate supported API operation. Use browser automation for that initial record and other tasks the public API does not expose.

## Local installation

The shared launcher is `~/Developer/appstoreconnect-mcp/scripts/launch.mjs`. `asc-api --help` documents CLI inputs; `asc-api search` and `describe` work offline. Credentials stay in the local secret store and are loaded by the launcher/CLI. Read-only connection check: `npm run smoke:live` from the MCP checkout. A new Codex chat or Claude MCP reconnect loads updated tools; use the CLI while the current chat retains its old tool catalog.
