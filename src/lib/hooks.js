import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Runs a lifecycle hook if it exists.
 * @param {string} hooksDir - Directory containing hook scripts.
 * @param {string} hookName - Name of the hook (e.g., 'post-sync').
 * @param {object} context - Job context to pass as environment variables.
 * @returns {Promise<void>}
 */
export async function runHook(hooksDir, hookName, context) {
  if (!hooksDir) return;

  const hookPath = path.resolve(hooksDir, hookName);
  
  // Check if hook exists and is executable
  if (!fs.existsSync(hookPath)) {
    return;
  }

  console.log(`Running hook: ${hookName}...`);

  const env = {
    ...process.env,
    JOB_ID: context.id,
    JOB_STATUS: context.status || '',
    JOB_EXIT_CODE: String(context.exitCode ?? ''),
    JOB_WORKSPACE_DIR: context.workspaceDir || '',
    JOB_SOURCE_DIR: context.sourceDir || '',
    JOB_RESULTS_DIR: context.resultsDir || '',
  };

  return new Promise((resolve, reject) => {
    const child = spawn(hookPath, [], {
      shell: true,
      stdio: 'inherit',
      env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error(`Hook ${hookName} failed with exit code ${code}`);
        reject(new Error(`Hook ${hookName} failed`));
      }
    });

    child.on('error', (err) => {
      console.error(`Failed to start hook ${hookName}:`, err);
      reject(err);
    });
  });
}
