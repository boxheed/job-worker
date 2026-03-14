import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { syncDir } from './sync.js';

/**
 * Executes a single step of a job.
 * @param {string} command - The command to execute.
 * @param {string} logPath - Path to the log file for this step.
 * @param {string} cwd - Current working directory.
 * @param {AbortSignal} [signal] - Optional AbortSignal to terminate the process.
 * @returns {Promise<number>} Resolves with the exit code.
 */
async function executeStep(command, logPath, cwd, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal.reason);
    }
    
    const logStream = fs.createWriteStream(logPath);
    let child;

    const onAbort = () => {
      if (child) child.kill();
      logStream.end();
      reject(signal.reason);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    logStream.on('error', (err) => {
      console.error(`Failed to create/write log stream at ${logPath}:`, err);
      if (child) child.kill();
      reject(err);
    });

    logStream.on('open', () => {
      try {
        const spawnOptions = {
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: cwd,
        };
        if (signal) {
          spawnOptions.signal = signal;
        }

        child = spawn(command, spawnOptions);

        child.stdout.pipe(logStream);
        child.stderr.pipe(logStream);

        let exitCode = null;
        let streamFinished = false;
        let processExited = false;

        const tryResolve = () => {
          if (streamFinished && processExited) {
            if (signal) {
              signal.removeEventListener('abort', onAbort);
            }
            resolve(exitCode === null ? 1 : exitCode);
          }
        };

        child.on('exit', (code) => {
          exitCode = code;
          processExited = true;
          tryResolve();
        });

        child.on('close', (code) => {
          if (exitCode === null) exitCode = code;
          processExited = true;
          logStream.end();
        });

        child.on('error', (err) => {
          if (err.name === 'AbortError') return;
          console.error(`Spawn error for command "${command}":`, err);
          logStream.write(`\nSpawn error: ${err.message}\n`);
          exitCode = 1;
          processExited = true;
          logStream.end();
        });

        logStream.on('finish', () => {
          streamFinished = true;
          tryResolve();
        });
      } catch (spawnErr) {
        if (signal) signal.removeEventListener('abort', onAbort);
        logStream.end();
        reject(spawnErr);
      }
    });
  });
}


/**
 * Executes a job by staging its source to a local workspace and running steps.
 * @param {string} jobsRoot - The root directory for job sources (Shared).
 * @param {string} workspacesRoot - The root directory for execution workspaces (Local).
 * @param {string} id - The unique identifier for the job.
 * @param {object} [overrideConfig] - Optional job configuration.
 * @param {AbortSignal} [signal] - Optional AbortSignal to terminate the job.
 * @returns {Promise<{status: string, exitCode: number, manifest: object}>}
 */
export async function executeJob(
  jobsRoot,
  workspacesRoot,
  id,
  overrideConfig = null,
  signal = null,
) {
  const originalCwd = process.cwd();
  const startTime = new Date().toISOString();
  const manifest = {
    jobId: id,
    status: 'running',
    timing: {
      start: startTime,
      end: null,
      durationMs: 0,
    },
    steps: [],
  };

  let overallExitCode = 0;
  const sourceDir = path.resolve(jobsRoot, id);
  const workspaceDir = path.resolve(workspacesRoot, id);
  const resultsDir = path.resolve(sourceDir, 'results');

  try {
    // Ensure directories exist
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });

    // 1. Prepare Workspace
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspaceDir, { recursive: true });

    // 2. Stage files from Source to Workspace
    if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
      // Copy contents from sourceDir to workspaceDir (excluding 'results' if it exists there)
      syncDir(sourceDir, workspaceDir, { exclude: ['results'] });
    }

    process.chdir(workspaceDir);

    let jobConfig;
    if (overrideConfig) {
      jobConfig = overrideConfig;
    } else {
      const configPath = path.join(workspaceDir, 'job.json');
      if (!fs.existsSync(configPath)) {
        throw new Error(`Job definition not found in ${sourceDir}`);
      }
      jobConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    if (!Array.isArray(jobConfig.steps)) {
      throw new Error('Job configuration must contain a "steps" array');
    }

    // 3. Execution
    for (let i = 0; i < jobConfig.steps.length; i++) {
      const stepCommand = jobConfig.steps[i];
      const stepStartTime = Date.now();
      const logFileName = `step_${i}.log`;
      const logPath = path.resolve(resultsDir, logFileName); // Use path.resolve for absolute path

      const stepResult = {
        index: i,
        command: stepCommand,
        status: 'running',
        exitCode: null,
        durationMs: 0,
        log: logFileName,
      };

      manifest.steps.push(stepResult);

      const exitCode = await executeStep(stepCommand, logPath, workspaceDir, signal);
      stepResult.durationMs = Date.now() - stepStartTime;
      stepResult.exitCode = exitCode;

      if (exitCode === 0) {
        stepResult.status = 'success';
      } else {
        stepResult.status = 'failed';
        overallExitCode = exitCode;
        break;
      }
    }

    manifest.status = overallExitCode === 0 ? 'success' : 'failed';

    // 4. Final Sync: Sync new/modified files back to results (except what's already there)
    syncDir(workspaceDir, resultsDir, { overwrite: false });
  } catch (err) {
    manifest.status = 'failed';
    overallExitCode = overallExitCode || 1;
    manifest.error = err.message;
  } finally {
    const endTime = new Date();
    manifest.timing.end = endTime.toISOString();
    manifest.timing.durationMs =
      endTime.getTime() - new Date(startTime).getTime();

    // Write the result.json manifest directly to the shared results folder
    try {
      const resultPath = path.join(resultsDir, 'result.json');
      const data = JSON.stringify(manifest, null, 2);
      const fd = fs.openSync(resultPath, 'w');
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      // Attempt to fsync the directory to ensure metadata visibility on the shared drive
      try {
        const dirFd = fs.openSync(resultsDir, 'r');
        fs.fsyncSync(dirFd);
        fs.closeSync(dirFd);
      } catch (dirErr) {
        // Directory fsync is not supported on all filesystems, ignore failure
      }
    } catch (writeErr) {
      console.error('Failed to write result.json:', writeErr);
    }

    // Cleanup Workspace
    try {
      if (workspaceDir && fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.error('Failed to cleanup workspace:', cleanupErr);
    }

    try {
      process.chdir(originalCwd);
    } catch {
      // ignore
    }
  }

  return { status: manifest.status, exitCode: overallExitCode, manifest };
}
