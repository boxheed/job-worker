import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Executes a job by reading its definition from workDir and running steps.
 * @param {string} workDir - The directory where the job should be executed.
 * @param {string} id - The unique identifier for the job.
 * @param {object} [overrideConfig] - Optional job configuration to use instead of job.json.
 * @returns {{status: string, exitCode: number, manifest: object}}
 */
export function executeJob(workDir, id, overrideConfig = null) {
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

      try {
        const logFd = fs.openSync(logPath, 'w');
        try {
          execSync(stepCommand, { stdio: ['ignore', logFd, logFd] });
          stepResult.status = 'success';
          stepResult.exitCode = 0;
        } catch (error) {
          stepResult.status = 'failed';
          stepResult.exitCode = error.status || 1;
          overallExitCode = stepResult.exitCode;
          throw error; // Break the loop
        } finally {
          fs.closeSync(logFd);
          stepResult.durationMs = Date.now() - stepStartTime;
        }
      } catch (error) {
        // If it's the execSync error, we've already handled status. 
        // If it's a file error, we set it here.
        if (stepResult.status === 'running') {
          stepResult.status = 'failed';
          stepResult.exitCode = 1;
          overallExitCode = 1;
        }
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
    manifest.timing.durationMs = endTime.getTime() - new Date(startTime).getTime();

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
