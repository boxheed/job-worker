import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeJob } from '../src/lib/executor.js';

describe('executeJob (Managed Workspace)', () => {
  let jobsRoot;
  let workspacesRoot;

  beforeEach(() => {
    jobsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'job-worker-jobs-'));
    workspacesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'job-worker-workspaces-'),
    );
  });

  afterEach(() => {
    fs.rmSync(jobsRoot, { recursive: true, force: true });
    fs.rmSync(workspacesRoot, { recursive: true, force: true });
  });

  it('should stage files, execute, stream logs to results, and sync artifacts', async () => {
    const jobId = 'test-job-1';
    const sourceDir = path.join(jobsRoot, jobId);
    fs.mkdirSync(sourceDir, { recursive: true });

    // Create a source file and job.json
    fs.writeFileSync(path.join(sourceDir, 'input.txt'), 'hello world');
    const jobConfig = {
      steps: ['cat input.txt', 'pwd'],
    };
    fs.writeFileSync(
      path.join(sourceDir, 'job.json'),
      JSON.stringify(jobConfig),
    );

    const result = await executeJob(jobsRoot, workspacesRoot, jobId);

    expect(result.status).toBe('success');
    expect(result.exitCode).toBe(0);

    const resultsDir = path.join(sourceDir, 'results');
    expect(fs.existsSync(resultsDir)).toBe(true);

    // Verify logs and manifest in results folder
    expect(fs.existsSync(path.join(resultsDir, 'result.json'))).toBe(true);
    expect(fs.existsSync(path.join(resultsDir, 'step_0.log'))).toBe(true);
    expect(fs.existsSync(path.join(resultsDir, 'step_1.log'))).toBe(true);

    const log0 = fs.readFileSync(path.join(resultsDir, 'step_0.log'), 'utf8');
    expect(log0).toContain('hello world');

    // Verify synced artifacts
    expect(fs.existsSync(path.join(resultsDir, 'input.txt'))).toBe(true);
    expect(
      fs.readFileSync(path.join(resultsDir, 'input.txt'), 'utf8'),
    ).toContain('hello world');

    // Verify workspace is cleaned up
    expect(fs.existsSync(path.join(workspacesRoot, jobId))).toBe(false);
  });

  it('should fail if job.json is missing in Source', async () => {
    const jobId = 'test-job-missing';
    const sourceDir = path.join(jobsRoot, jobId);
    fs.mkdirSync(sourceDir, { recursive: true });

    const result = await executeJob(jobsRoot, workspacesRoot, jobId);
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);

    const resultsDir = path.join(sourceDir, 'results');
    expect(fs.existsSync(path.join(resultsDir, 'result.json'))).toBe(true);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(resultsDir, 'result.json'), 'utf8'),
    );
    expect(manifest.error).toContain('Job definition not found');
  });

  it('should prefer overrideConfig over job.json', async () => {
    const jobId = 'test-job-override';
    const sourceDir = path.join(jobsRoot, jobId);
    fs.mkdirSync(sourceDir, { recursive: true });

    const overrideConfig = {
      steps: ['echo "override"'],
    };

    const result = await executeJob(
      jobsRoot,
      workspacesRoot,
      jobId,
      overrideConfig,
    );

    expect(result.status).toBe('success');
    const resultsDir = path.join(sourceDir, 'results');
    const log0 = fs.readFileSync(path.join(resultsDir, 'step_0.log'), 'utf8');
    expect(log0).toContain('override');
  });
});
