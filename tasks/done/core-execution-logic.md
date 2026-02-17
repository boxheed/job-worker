# Task: Implement Core Execution Logic

Implemented the core execution logic for the job worker in `src/lib/executor.js`.

## Changes

- Created `src/lib/executor.js` with the `executeJob` function.
- `executeJob` handles:
    - Resolving `workDir` to an absolute path to handle relative path inputs correctly.
    - Changing the working directory to `workDir`.
    - Reading the job definition from `job.json`.
    - Validating that `steps` is an array.
    - Streaming all stdout/stderr to `job.log`.
    - Sequential execution of steps using `child_process.execSync`.
    - Halting execution on the first failure.
    - Returning status and exit code.
    - Restoring original working directory after execution.
- Created `tests/executor.test.js` with comprehensive unit tests, including relative path handling and error cases.
- Updated `README.md` to document the `job.json` filename.
- Updated `AGENTS.md` to include instructions about the executor.

## Verification

- All unit tests passed (9 tests total).
- Linting and formatting checked and passed.
- Manually reviewed the code for resource leaks and edge case handling.
