# Task: Dry Run Mode

## Description

Added a "Dry Run" mode to the CLI to allow testing the shell environment and file system permissions without requiring an MQTT broker.

## Requirements

- Add a `--dry-run` flag to the CLI.
- If the flag is present:
    - Look for a local `test-payload.json` file.
    - Execute the steps defined in that file.
    - Write to `job.log`.
    - Print the result JSON to the console.
- Update documentation.
- Ensure unit tests pass.

## Changes

### `src/lib/executor.js`
- Updated `executeJob` to support an optional `overrideConfig` parameter. If provided, it uses this configuration instead of reading `job.json` from the `workDir`.

### `src/lib/worker.js`
- Added `--dry-run` option using `commander`.
- Implemented logic to read `test-payload.json` and call `executeJob` with the steps from the payload.
- Added graceful handling and reporting of results to the console in dry-run mode.

### `README.md`
- Added a new section for "Dry Run Mode" explaining how to use it and providing an example `test-payload.json`.

### `tests/dry-run.test.js`
- Created a new test suite to verify the dry-run mode, including error handling for missing or invalid payload files.

## Verification Results

- All unit tests passed, including the new dry-run tests.
- Verified that `executeJob` correctly handles both the traditional `job.json` approach and the new optional config approach.
