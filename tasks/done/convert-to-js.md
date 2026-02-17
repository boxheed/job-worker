# Task: Convert to JS project

The project has been converted from TypeScript to JavaScript.

## Changes

- Renamed all `.ts` files to `.js`.
- Removed type annotations from source code.
- Updated `package.json`:
    - Changed `main` and `bin` to point to `src/index.js`.
    - Removed `build` and `prepare` scripts.
    - Updated `lint`, `format`, and `start` scripts.
    - Removed TypeScript-related dependencies.
- Removed `tsconfig.json`.
- Updated `eslint.config.js` to support JavaScript and Node.js globals.
- Updated `AGENTS.md` and `README.md` documentation.
- Verified that tests pass and CLI works.
