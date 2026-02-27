# CLI Argument Parsing

Added support for command-line argument parsing using the `commander` library.

## Changes
- Installed `commander` as a dependency.
- Refactored worker logic from `bin/worker.js` to `src/lib/worker.js` to improve testability and modularity.
- Updated `bin/worker.js` to be a thin wrapper that calls the worker entry point.
- Added support for the following CLI flags:
    - `-u, --url`: NATS Server URL (defaults to `NATS_URL` env or `nats://localhost:4222`).
    - `-n, --username`: NATS Username (defaults to `NATS_USERNAME` env).
    - `-p, --password`: NATS Password (defaults to `NATS_PASSWORD` env).
    - `-t, --token`: NATS Auth Token (defaults to `NATS_TOKEN` env).
    - `-i, --id`: Unique Worker ID (defaults to `WORKER_ID` env or `worker-01`).
    - `-s, --stream`: NATS JetStream Stream Name (defaults to `NATS_STREAM` env or `JOBS`).
    - `-k, --input-subject`: NATS Subject to consume from (defaults to `NATS_INPUT_SUBJECT` env or `jobs.pending`).
    - `-r, --output-subject`: NATS Subject to publish results to (defaults to `NATS_OUTPUT_SUBJECT` env or `jobs.results`).
- Updated `README.md` to document the new CLI options and configuration.
- Added unit tests in `tests/worker.test.js` to verify CLI argument parsing and environment variable defaults.
- Verified that the help menu correctly displays the options using `node bin/worker.js --help`.
