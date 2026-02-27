# Task: Explicit NATS Authentication Support

## Description
Updated the NATS worker to support explicit username, password, and token configuration through CLI arguments and environment variables. This removes the reliance on embedding credentials directly in the NATS URL.

## Changes

### `src/lib/worker.js`
- Added `-n, --username`, `-p, --password`, and `-t, --token` CLI options using `commander`.
- These options also check for `NATS_USERNAME`, `NATS_PASSWORD`, and `NATS_TOKEN` environment variables.
- The `nats.connect` call now includes `user`, `pass`, or `token` in the options object if they are provided.

### `README.md`
- Updated the configuration table to include the new arguments and their corresponding environment variables.

### `tests/worker.test.js`
- Updated environment variable default tests to include `NATS_USERNAME` and `NATS_PASSWORD`.
- Added a new test case `should override credentials with CLI arguments` to verify that CLI flags correctly pass credentials to the NATS client.

## Verification Results
- All unit tests passed: `npm test`
- Verified that credentials from both environment variables and CLI flags are correctly passed to the NATS connection logic.
