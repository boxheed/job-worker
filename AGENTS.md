# AI Agent Instructions

This repository is a Node.js CLI tool written in JavaScript.

## Project Structure

- `src/`: Contains the source code.
- `tests/`: Contains Vitest unit tests.
- `tasks/`: Contains task records.

## Development Workflow

- Run `npm install` to install dependencies.
- Run `npm test` to run unit tests using Vitest.
- Run `npm run dev` to run tests in watch mode.

## Coding Standards

- Use ES Modules (ESM).
- All new features should have corresponding unit tests in the `tests/` directory.
- Imports in `.js` files should use `.js` extensions.
- Core logic should be placed in `src/lib/`.

## Executor Logic

- The `executeJob(workDir, id)` function in `src/lib/executor.js` is the core engine.
- It expects a `job.json` in the `workDir`.
- It creates a `result.json` manifest and redirects output for each step to individual log files (`step_N.log`) in the `workDir`.

## CLI Execution

The main entry point for the CLI is `bin/worker.js`.
The package is designed to be executable via `npx` or by installing it globally using the command `nats-fs-worker`.
