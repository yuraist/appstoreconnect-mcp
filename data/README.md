# Apple API specification

`apple-openapi.json.gz` is a compressed, otherwise unmodified copy of Apple's official public App Store Connect OpenAPI specification. `apple-openapi-source.json` records the download URL, retrieval date, API version and SHA-256 of the uncompressed JSON. API resource names and documentation remain Apple's material.

Download the ZIP from the recorded Apple URL, extract `openapi.oas.json`, and run `npm run spec:update -- path/to/openapi.oas.json`. Commit both generated files after running build, tests and both protocol smoke checks. The server does not download or change its API catalog at runtime.
