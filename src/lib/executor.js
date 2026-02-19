import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Executes a single step of a job.
 * @param {string} command - The command to execute.
 * @param {string} logPath - Path to the log file for this step.
 * @returns {Promise<number>} Resolves with the exit code.
 */
async function executeStep(command, logPath) {
  return new Promise((resolve) => {
    const logStream = fs.createWriteStream(logPath);
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    let exitCode = null;

    child.on('close', (code) => {
      exitCode = code ?? 1;
      logStream.end();
    });

    child.on('error', (err) => {
      console.error(`Spawn error for command "${command}":`, err);
      logStream.write(`\nSpawn error: ${err.message}\n`);
      exitCode = 1;
      logStream.end();
    });

    logStream.on('finish', () => {
      resolve(exitCode ?? 1);
    });
  });
}

/**
 * Executes a job by reading its definition from workDir and running steps.
 * @param {string} workDir - The directory where the job should be executed.
 * @param {string} id - The unique identifier for the job.
 * @param {object} [overrideConfig] - Optional job configuration to use instead of job.json.
 * @returns {Promise<{status: string, exitCode: number, manifest: object}>}
 */
export async function executeJob(workDir, id, overrideConfig = null) {
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
  let absoluteWorkDir;

  try {
    absoluteWorkDir = path.resolve(workDir);
    process.chdir(absoluteWorkDir);

    let jobConfig;
    if (overrideConfig) {
      jobConfig = overrideConfig;
    } else {
      const configPath = path.join(absoluteWorkDir, 'job.json');
      if (!fs.existsSync(configPath)) {
        throw new Error(`Job definition not found at ${configPath}`);
      }
      jobConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    if (!Array.isArray(jobConfig.steps)) {
      throw new Error('Job configuration must contain a "steps" array');
    }

    for (let i = 0; i < jobConfig.steps.length; i++) {
      const stepCommand = jobConfig.steps[i];
      const stepStartTime = Date.now();
      const logFileName = `step_${i}.log`;
      const logPath = path.join(absoluteWorkDir, logFileName);

      const stepResult = {
        index: i,
        command: stepCommand,
        status: 'running',
        exitCode: null,
        durationMs: 0,
        log: logFileName,
      };

      manifest.steps.push(stepResult);

      const exitCode = await executeStep(stepCommand, logPath);
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
  } catch (err) {
    manifest.status = 'failed';
    overallExitCode = overallExitCode || 1;
    manifest.error = err.message;
  } finally {
    const endTime = new Date();
    manifest.timing.end = endTime.toISOString();
    manifest.timing.durationMs =
      endTime.getTime() - new Date(startTime).getTime();

    // Write the result.json manifest
    if (absoluteWorkDir) {
      try {
        fs.writeFileSync(
          path.join(absoluteWorkDir, 'result.json'),
          JSON.stringify(manifest, null, 2),
        );
      } catch (writeErr) {
        console.error('Failed to write result.json:', writeErr);
      }
    }

    try {
      process.chdir(originalCwd);
    } catch {
      // ignore
    }
  }

  return { status: manifest.status, exitCode: overallExitCode, manifest };
}
