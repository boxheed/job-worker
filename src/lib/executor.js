import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { syncDir } from './sync.js';
import { runHook } from './hooks.js';

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
  hooksDir = null,
  retryConfig = { maxAttempts: 10, delay: 500 },
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

  const context = {
    id,
    workspaceDir,
    sourceDir,
    resultsDir,
  };

  try {
    // 0. Pre-stage Hook
    await runHook(hooksDir, 'pre-stage', context);

    // Wait for source directory to be visible (NFS eventual consistency)
    let attempts = 0;
    const { maxAttempts, delay } = retryConfig;
    
    while (attempts < maxAttempts) {
        if (fs.existsSync(sourceDir) && fs.readdirSync(sourceDir).length > 0) {
            break;
        }
        attempts++;
        if (attempts < maxAttempts) {
            console.log(`Source directory ${sourceDir} not visible or empty. Retrying in ${delay}ms... (Attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source directory ${sourceDir} not found after ${maxAttempts * delay}ms`);
    }

    // Ensure results directory exists
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

    // 2.1 Post-stage Hook
    await runHook(hooksDir, 'post-stage', context);

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

      const exitCode = await executeStep(
        stepCommand,
        logPath,
        workspaceDir,
        signal,
      );
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
    context.status = manifest.status;
    context.exitCode = overallExitCode;

    // 3.1 Pre-sync Hook
    await runHook(hooksDir, 'pre-sync', context);
  } catch (err) {
    manifest.status = 'failed';
    overallExitCode = overallExitCode || 1;
    manifest.error = err.message;
    context.status = 'failed';
    context.exitCode = overallExitCode;

    await runHook(hooksDir, 'on-error', context).catch(() => {});
  } finally {
    const endTime = new Date();
    manifest.timing.end = endTime.toISOString();
    manifest.timing.durationMs =
      endTime.getTime() - new Date(startTime).getTime();

    // 4. Write manifest and perform Final Sync
    try {
      if (fs.existsSync(workspaceDir)) {
        // Write the result.json manifest to the LOCAL workspace first
        const resultPath = path.join(workspaceDir, 'result.json');
        fs.writeFileSync(resultPath, JSON.stringify(manifest, null, 2));

        // Sync everything (including result.json) back to the shared results folder
        syncDir(workspaceDir, resultsDir, { overwrite: false });
      }
    } catch (syncErr) {
      console.error('Failed to sync results to shared drive:', syncErr);
    }

    // 5. Post-sync Hook
    await runHook(hooksDir, 'post-sync', context).catch(() => {});

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
