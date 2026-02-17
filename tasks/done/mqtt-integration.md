# Task: MQTT Integration & Lifecycle Management

## Description

Implemented MQTT worker logic in `./bin/worker.js` to connect to a broker, subscribe to jobs, execute them, and exit gracefully.

## Changes

### `bin/worker.js`
- Created a new worker script that:
  - Connects to MQTT broker using `MQTT_URL` and `WORKER_ID` environment variables.
  - Supports persistent sessions with `clean: false` and fixed `clientId`.
  - Subscribes to `jobs/pending` with QoS 1.
  - On message:
    - Parses job payload.
    - Calls `executeJob` from `src/lib/executor.js`.
    - Publishes result to `jobs/results/{id}`.
    - Disconnects gracefully and exits with `process.exit(0)`.

### `package.json`
- Added `mqtt` dependency.
- Updated `bin` entry `job-worker` to point to `./bin/worker.js`.

### `tests/worker.test.js`
- Added unit tests for the worker logic using Vitest and mocks.

## Verification Results

- Unit tests passed: `npm test tests/worker.test.js`
- Full test suite passed: `npm test`
