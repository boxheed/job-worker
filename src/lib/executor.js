import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Executes a job by reading its definition from workDir and running steps.
 * @param {string} workDir - The directory where the job should be executed.
 * @param {string} id - The unique identifier for the job.
 * @param {object} [overrideConfig] - Optional job configuration to use instead of job.json.
 * @returns {{status: string, exitCode: number}}
 */
export function executeJob(workDir, id, overrideConfig = null) {
  let logFd;
  const originalCwd = process.cwd();

  try {
    // Resolve workDir to absolute path before changing directory
    // This avoids issues if workDir is a relative path.
    const absoluteWorkDir = path.resolve(workDir);

    // 1. Change process directory to workDir
    process.chdir(absoluteWorkDir);

    // 2. Get the job definition
    let jobConfig;
    if (overrideConfig) {
      jobConfig = overrideConfig;
    } else {
      // We assume the file is named 'job.json' as per the architecture.
      const configPath = path.join(absoluteWorkDir, 'job.json');
      if (!fs.existsSync(configPath)) {
        throw new Error(`Job definition not found at ${configPath}`);
      }
      jobConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // Validate that steps is an array
    if (!Array.isArray(jobConfig.steps)) {
      throw new Error('Job configuration must contain a "steps" array');
    }

    // 3. Open a write stream to a file named job.log inside that workDir
    const logPath = path.join(absoluteWorkDir, 'job.log');
    logFd = fs.openSync(logPath, 'w');

    // Write a header to the log
    fs.writeSync(logFd, `Job ID: ${id}\n`);
    fs.writeSync(logFd, `Working Directory: ${absoluteWorkDir}\n`);
    fs.writeSync(logFd, `----------------------------------------\n`);

    // 4. Iterate over each step executing it
    for (const step of jobConfig.steps) {
      try {
        // 5. Redirect both stdout and stderr directly into the job.log file
        execSync(step, { stdio: ['ignore', logFd, logFd] });
      } catch (error) {
        // 6. If any step exits with a non zero value it should end the execution
        return { status: 'failed', exitCode: error.status || 1 };
      }
    }

    // 7. Return status success
    return { status: 'success', exitCode: 0 };
  } catch {
    return { status: 'failed', exitCode: 1 };
  } finally {
    // Cleanup: close log file descriptor
    if (logFd !== undefined) {
      try {
        fs.closeSync(logFd);
      } catch {
        // ignore close errors
      }
    }
    // Restore CWD (essential for maintaining state in tests)
    try {
      process.chdir(originalCwd);
    } catch {
      // ignore chdir errors
    }
  }
}
