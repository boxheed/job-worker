# Task: Explicit MQTT Authentication Support

## Description
Updated the MQTT worker to support explicit username and password configuration through CLI arguments and environment variables. This removes the reliance on embedding credentials directly in the MQTT URL.

## Changes

### `src/lib/worker.js`
- Added `-n, --username` and `-p, --password` CLI options using `commander`.
- These options also check for `MQTT_USERNAME` and `MQTT_PASSWORD` environment variables.
- The `mqtt.connect` call now includes `username` and `password` in the options object if they are provided.

### `README.md`
- Updated the configuration table to include the new `-n/--username` and `-p/--password` arguments and their corresponding environment variables.

### `tests/worker.test.js`
- Added `mqtt.connect.mockClear()` to `beforeEach` to ensure clean state between tests.
- Updated environment variable default tests to include `MQTT_USERNAME` and `MQTT_PASSWORD`.
- Added a new test case `should override credentials with CLI arguments` to verify that CLI flags correctly pass credentials to the MQTT client.

## Verification Results
- All unit tests passed: `npm test`
- Verified that credentials from both environment variables and CLI flags are correctly passed to the MQTT connection logic.
