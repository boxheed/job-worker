import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Executes a single step of a job.
 * @param {string} command - The command to execute.
 * @param {string} logPath - Path to the log file for this step.
 * @returns {Promise<number>} Resolves with the exit code.
 */
async function executeStep(command, logPath, cwd) {
  return new Promise((resolve, reject) => {
    const logStream = fs.createWriteStream(logPath);
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: cwd,
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    let exitCode = null;
    let streamFinished = false;
    let processExited = false;

    const tryResolve = () => {
      if (streamFinished && processExited) {
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

    logStream.on('error', (err) => {
      console.error(`LogStream error:`, err);
      streamFinished = true;
      tryResolve();
    });
  });
}

/**
 * Executes a job by staging its source to a local workspace and running steps.
 * @param {string} jobsRoot - The root directory for job sources (Shared).
 * @param {string} workspacesRoot - The root directory for execution workspaces (Local).
 * @param {string} id - The unique identifier for the job.
 * @param {object} [overrideConfig] - Optional job configuration.
 * @returns {Promise<{status: string, exitCode: number, manifest: object}>}
 */
export async function executeJob(jobsRoot, workspacesRoot, id, overrideConfig = null) {
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
  const resultsDir = path.join(sourceDir, 'results');

  try {
    // 1. Prepare Workspace and Results directory
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspaceDir, { recursive: true });

    // 2. Stage files from Source to Workspace
    if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
      // Copy contents from sourceDir to workspaceDir (excluding 'results' if it exists there)
      const entries = fs.readdirSync(sourceDir);
      for (const entry of entries) {
        if (entry === 'results') continue;
        const src = path.join(sourceDir, entry);
        const dest = path.join(workspaceDir, entry);
        try {
          fs.cpSync(src, dest, { recursive: true });
        } catch (cpErr) {
          console.error(`Failed to copy ${src} to ${dest}:`, cpErr);
        }
      }
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
      const logPath = path.join(resultsDir, logFileName); // Log directly to shared results folder

      const stepResult = {
        index: i,
        command: stepCommand,
        status: 'running',
        exitCode: null,
        durationMs: 0,
        log: logFileName,
      };

      manifest.steps.push(stepResult);

      const exitCode = await executeStep(stepCommand, logPath, workspaceDir);
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
    const workspaceEntries = fs.readdirSync(workspaceDir);
    for (const entry of workspaceEntries) {
      const src = path.join(workspaceDir, entry);
      const dest = path.join(resultsDir, entry);
      
      // Don't overwrite job.json if it was a source file, unless you want that.
      // For now, copy everything new/modified.
      if (!fs.existsSync(dest)) {
        fs.cpSync(src, dest, { recursive: true });
      }
    }

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
      fs.writeFileSync(
        path.join(resultsDir, 'result.json'),
        JSON.stringify(manifest, null, 2),
      );
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
