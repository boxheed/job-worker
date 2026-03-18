# Task: Separate NATS Input and Output Streams

## Description
Updated the worker to use separate NATS JetStream streams for input and output, improving isolation and reliability in shared NATS environments.

## Changes

### `src/lib/worker.js`
- Changed default input stream from `JOBS` to `AGENT_JOBS`.
- Added a new `AGENT_RESULTS` output stream (configurable via `--output-stream` or `NATS_OUTPUT_STREAM`).
- Refactored startup logic to ensure both streams exist and are correctly configured with their respective subjects.
- Enhanced logging to show both input and output stream details.

### `README.md`
- Updated the configuration table to reflect the new defaults and the additional output stream option.
- Updated examples to use the new stream names.

### `tests/worker.test.js`
- Added environment variable stub for `NATS_OUTPUT_STREAM`.
- Added test cases to verify the automatic creation of both input and output streams when they are missing.
- Updated existing tests to handle the dual-stream verification process.

## Verification Results
- All 25 unit tests passed (`npm test`).
- Verified CLI argument parsing and environment variable overrides for both streams.
- Verified idempotent stream creation logic.
