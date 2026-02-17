import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeJob } from '../src/lib/executor.js';

describe('executeJob', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-worker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute steps successfully and log output', () => {
    const jobConfig = {
      id: 'test-job-1',
      steps: ['echo "Step 1"', 'echo "Step 2"'],
    };
    fs.writeFileSync(path.join(tmpDir, 'job.json'), JSON.stringify(jobConfig));

    const result = executeJob(tmpDir, 'test-job-1');

    expect(result.status).toBe('success');
    expect(result.exitCode).toBe(0);

    const logContent = fs.readFileSync(path.join(tmpDir, 'job.log'), 'utf8');
    expect(logContent).toContain('Step 1');
    expect(logContent).toContain('Step 2');
  });

  it('should fail if a step fails', () => {
    const jobConfig = {
      id: 'test-job-fail',
      steps: ['echo "Before fail"', 'exit 1', 'echo "After fail"'],
    };
    fs.writeFileSync(path.join(tmpDir, 'job.json'), JSON.stringify(jobConfig));

    const result = executeJob(tmpDir, 'test-job-fail');

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);

    const logContent = fs.readFileSync(path.join(tmpDir, 'job.log'), 'utf8');
    expect(logContent).toContain('Before fail');
    expect(logContent).not.toContain('After fail');
  });

  it('should fail if job.json is missing', () => {
    const result = executeJob(tmpDir, 'test-job-missing');
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
  });

  it('should fail if job.json is invalid', () => {
    fs.writeFileSync(path.join(tmpDir, 'job.json'), 'invalid json');
    const result = executeJob(tmpDir, 'test-job-invalid');
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
  });

  it('should fail if steps is not an array', () => {
    const jobConfig = {
      id: 'test-job-no-array',
      steps: 'not an array',
    };
    fs.writeFileSync(path.join(tmpDir, 'job.json'), JSON.stringify(jobConfig));
    const result = executeJob(tmpDir, 'test-job-no-array');
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
  });

  it('should handle relative paths for workDir', () => {
    const relativeDir = path.join('.', path.relative(process.cwd(), tmpDir));
    const jobConfig = {
      id: 'test-job-relative',
      steps: ['echo "Relative Path Test"'],
    };
    fs.writeFileSync(path.join(tmpDir, 'job.json'), JSON.stringify(jobConfig));

    const result = executeJob(relativeDir, 'test-job-relative');

    expect(result.status).toBe('success');
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'job.log'))).toBe(true);
  });

  it('should succeed if steps is empty', () => {
    const jobConfig = {
      id: 'test-job-empty',
      steps: [],
    };
    fs.writeFileSync(path.join(tmpDir, 'job.json'), JSON.stringify(jobConfig));
    const result = executeJob(tmpDir, 'test-job-empty');
    expect(result.status).toBe('success');
    expect(result.exitCode).toBe(0);
  });
});
