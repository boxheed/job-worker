# CLI Argument Parsing

Added support for command-line argument parsing using the `commander` library.

## Changes
- Installed `commander` as a dependency.
- Refactored worker logic from `bin/worker.js` to `src/lib/worker.js` to improve testability and modularity.
- Updated `bin/worker.js` to be a thin wrapper that calls the worker entry point.
- Added support for the following CLI flags:
    - `-u, --url`: MQTT Broker URL (defaults to `MQTT_URL` env or `mqtt://localhost:1883`).
    - `-n, --username`: MQTT Username (defaults to `MQTT_USERNAME` env).
    - `-p, --password`: MQTT Password (defaults to `MQTT_PASSWORD` env).
    - `-i, --id`: Unique Worker ID (defaults to `WORKER_ID` env or `worker-01`).
    - `-t, --topic`: Subscription topic (defaults to `jobs/pending`).
- Updated `README.md` to document the new CLI options and configuration.
- Added unit tests in `tests/worker.test.js` to verify CLI argument parsing and environment variable defaults.
- Verified that the help menu correctly displays the options using `node bin/worker.js --help`.
