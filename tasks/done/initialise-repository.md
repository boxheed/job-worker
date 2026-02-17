# Task: Initialise Repository

## Requirements

- Scaffold out the repository with best practices for a command line executable node package.
- Include a structure for unit testing using Vitest.
- Create an outline `package.json`.
- Generate a hello-world application with unit tests.
- Ensure the package is installable directly from GitHub using `npm install`.
- Create suitable markdown files for instructing Gemini (AGENTS.md).
- Include task documentation in `./tasks/done`.
- Perform a critical review and update as appropriate.

## Implementation Details

### Project Structure
- `src/`: Source code in TypeScript.
- `tests/`: Unit tests using Vitest.
- `dist/`: Compiled JavaScript.
- `tasks/done/`: Task completion records.

### Technologies
- **Node.js**: Runtime environment.
- **TypeScript**: For type-safe development.
- **Vitest**: For fast unit testing.
- **NPM**: Package management.

### Key Configurations
- `package.json`:
    - `type: "module"` for ESM support.
    - `bin` field to define the CLI executable.
    - `prepare` script to ensure `npm install` from GitHub builds the project.
- `tsconfig.json`: Configured for ESM with `NodeNext` module resolution and `dist` output.

### Hello World Application
- `src/lib.ts`: Core logic.
- `src/index.ts`: CLI entry point with shebang.
- `tests/lib.test.ts`: Unit tests for the core logic.

### Installation from GitHub
Users can install this package using:
```bash
npm install git+https://github.com/boxheed/job-worker.git
```
The `prepare` script `npm run build` ensures that the `dist` folder is populated upon installation.

## Critical Review Findings
- Initial shebang was included in `src/index.ts`.
- `package.json` was updated to include `bin` and `files` fields.
- ESM compatibility was ensured by using `.js` extensions in imports within TypeScript files, as required by Node.js when running compiled ESM code without a bundler.
- Added `AGENTS.md` for better collaboration with other AI agents.
- Updated `tsconfig.json` to use `NodeNext` for better ESM compatibility.
- Ensured dependency versions are valid and used ESLint flat config.
