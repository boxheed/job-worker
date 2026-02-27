# Task: NATS JetStream Integration & Lifecycle Management

## Description

Implemented NATS JetStream worker logic in `src/lib/worker.js` and `bin/worker.js` to connect to a server, consume jobs from a stream, execute them, and exit gracefully.

## Changes

### `src/lib/worker.js`
- Created a new worker script that:
  - Connects to NATS server using `NATS_URL` and `WORKER_ID` environment variables.
  - Supports JetStream pull consumers with durable names.
  - Fetches 1 message from the stream.
  - On message:
    - Parses job payload (JSON decoded).
    - Calls `executeJob` from `src/lib/executor.js`.
    - Publishes result to `jobs.results.{id}`.
    - Acknowledges the message.
    - Closes connection and exits with `process.exit(0)`.

### `package.json`
- Replaced `mqtt` with `nats` dependency.
- Updated `bin` entry `nats-fs-worker` to point to `./bin/worker.js`.

### `tests/worker.test.js`
- Rewrote unit tests for the worker logic using Vitest and NATS mocks.

## Verification Results

- Unit tests passed: `npm test tests/worker.test.js`
- Full test suite passed: `npm test`
