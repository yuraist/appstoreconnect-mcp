# API-first Apple workflows

The product has three interfaces to one Apple API implementation: an MCP server for agents, a CLI for scripts and large uploads, and a plugin containing MCP wiring plus a workflow skill. A separate HTTP deployment is unnecessary for local Codex/Claude use. The current stdio server remains local to this Mac.

## Discover and execute

1. Search `search_api_operations` for a resource (for example `betaAppLocalizations`, `bundleIds`, `userInvitations`, `appStoreVersionLocalizations`, `appScreenshotSets`).
2. Read `get_api_operation` using the exact operationId. It includes request definitions from Apple's pinned specification.
3. Resolve IDs and current state with `read_api`.
4. Execute authorized mutations with `write_api`. Use `dryRun: true` to validate inputs offline first.
5. Read resulting state to confirm completion. Receiving a creation response is not the same as Apple finishing processing or review.

Every operation in Apple's pinned OpenAPI file is addressable. This is catalog coverage, not a claim that all operations have been exercised against a live account: role permissions, resource states, required metadata and Apple-side availability still apply. Apple Ads remains a separate optional API and is not part of the ASC OpenAPI catalog.

Generic responses preserve `data`, `relationships`, `included`, `links` and metadata. Reads fetch one page. Extract `cursor` from `links.next` and pass it in the next call's query. Reports served as non-JSON are returned as `{data: null, contentType, encoding: "base64", bytes, content}`. Existing named list tools continue their legacy flattening and automatic pagination, bounded at 100 pages.

Writes use separate MCP tools so client approval policy can distinguish reads and mutations. No blanket approval is installed. Authentication is restricted to Apple's API origin; asset delivery uses only HTTPS upload instructions read from Apple's API, without forwarding the ASC bearer token. Rate-limit retries are bounded. Ambiguous network failures on writes are surfaced rather than automatically repeated.

## CLI

`asc-api --help` lists commands. Search/describe and dry-run require no Apple credentials. A JSON input file (or `-` for stdin) contains `path`, `query`, and optional `body`:

```json
{
  "query": { "limit": 10, "filter[bundleId]": "com.example.app" }
}
```

```bash
asc-api read apps_getCollection request.json
asc-api describe betaGroups_createInstance
asc-api write betaGroups_createInstance group.json --dry-run
asc-api write betaGroups_createInstance group.json
```

CLI credentials load from explicit `ASC_*` environment values or the ASC entries in `ASC_ENV_FILE` (default `~/Developer/.secrets/.env`). Explicit values take precedence. The existing MCP launcher loads ASC and optional Apple Ads credentials for the corresponding services.

## Signed build → external TestFlight

Compile/archive/sign with Xcode or CI first. `upload_build` / `asc-api upload signed-build.json` takes:

```json
{
  "appId": "APPLE_APP_ID",
  "filePath": "/absolute/path/App.ipa",
  "version": "1.0",
  "buildNumber": "42",
  "platform": "IOS"
}
```

The uploader creates BuildUpload and BuildUploadFile reservations, streams Apple's chunk ranges with bounded memory, and commits a whole-file SHA-256. It returns both reservation IDs. Processing continues asynchronously at Apple. Query `buildUploads_getInstance` until it finishes, then resolve the build ID. A failed transfer returns existing reservation IDs; inspect and resume the reservation with `upload_reserved_asset` rather than blindly creating a duplicate. For transport or Apple-specific incompatibilities, Xcode/Transporter remain command-line fallbacks.

Populate beta app description/feedback contact (`betaAppLocalizations`), beta review contact/demo-account details (`betaAppReviewDetails`), localized What to Test (`set_beta_build_localization`) and actual export compliance (`set_build_export_compliance`). Read existing localization IDs before updating an existing locale. Create/resolve groups, attach the build, submit `submit_beta_review`, and read `get_beta_review_status`. Enable the external group's public link if requested. Apple approval remains asynchronous.

Internal testers need existing eligible ASC team accounts. Team invitations (`userInvitations`) and TestFlight tester invitations (`betaTesters`) are different resources. Invitations can send email; execute them in the scope the user requested. Builds marked Internal Only cannot be distributed externally.

## Screenshots, previews and review attachments

Use the catalog to create the appropriate parent set and file reservation with the real file name, size and required metadata. Deliver its bytes using `upload_reserved_asset` with `resourceType` (`appScreenshots`, `appPreviews`, `appStoreReviewAttachments`, `buildUploadFiles`), `resourceId` and `filePath`. The helper fetches Apple's upload operations, validates full byte coverage, streams ranges and commits the checksum. Read processing state after committing. Other binary assets can use their documented Apple upload flow; a JSON request alone does not transfer file bytes.

## App Store submission

`submit_for_review` is distinct from TestFlight review. It verifies the app/platform/version, reuses one editable draft or creates one, attaches the requested app version if needed, and patches `submitted=true`. Supplying `versionId` and `submissionId` makes selection explicit and allows a failed attempt to resume. Missing metadata is returned as Apple's error; the draft ID is retained. Review/release prerequisites still need to be completed through the catalog or existing tools.

## Website boundary

Apple exposes no public operation to create the initial ASC app record. Use its website for that step. Registering a Bundle ID, creating later App Store versions and uploading a binary are separate API-supported tasks. Account agreements and other website-only flows may also require the account holder or browser. Prefer the public API/CLI whenever it exposes the requested operation.

## Verification and maintenance

Run build, tests, `npm run smoke`, `npm run smoke:legacy`, and read-only `npm run smoke:live`. `scripts/update-apple-spec.mjs` updates the pinned compressed Apple specification from an extracted official JSON; provenance includes its version and checksum. Run compatibility checks before publishing a refreshed catalog.
