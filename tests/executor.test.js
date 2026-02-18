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

  it('should execute steps successfully and create segmented logs and manifest', () => {
    const jobConfig = {
      id: 'test-job-1',
      steps: ['echo "Step 1"', 'echo "Step 2"'],
    };
    fs.writeFileSync(path.join(tmpDir, 'job.json'), JSON.stringify(jobConfig));

    const result = executeJob(tmpDir, 'test-job-1');

    expect(result.status).toBe('success');
    expect(result.exitCode).toBe(0);

    // Verify result.json
    const manifestPath = path.join(tmpDir, 'result.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.jobId).toBe('test-job-1');
    expect(manifest.status).toBe('success');
    expect(manifest.steps).toHaveLength(2);
    expect(manifest.steps[0].log).toBe('step_0.log');
    expect(manifest.steps[1].log).toBe('step_1.log');

    // Verify individual logs
    const log0 = fs.readFileSync(path.join(tmpDir, 'step_0.log'), 'utf8');
    expect(log0).toContain('Step 1');
    const log1 = fs.readFileSync(path.join(tmpDir, 'step_1.log'), 'utf8');
    expect(log1).toContain('Step 2');
  });

  it('should fail if a step fails and record correct manifest status', () => {
    const jobConfig = {
      id: 'test-job-fail',
      steps: ['echo "Before fail"', 'exit 1', 'echo "After fail"'],
    };
    fs.writeFileSync(path.join(tmpDir, 'job.json'), JSON.stringify(jobConfig));

    const result = executeJob(tmpDir, 'test-job-fail');

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);

    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'result.json'), 'utf8'));
    expect(manifest.status).toBe('failed');
    expect(manifest.steps[1].status).toBe('failed');
    expect(manifest.steps).toHaveLength(2); // Should stop after fail

    expect(fs.existsSync(path.join(tmpDir, 'step_0.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'step_1.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'step_2.log'))).toBe(false);
  });

  it('should fail if job.json is missing', () => {
    const result = executeJob(tmpDir, 'test-job-missing');
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    
    // Even if job.json is missing, result.json should be created if workDir is valid
    expect(fs.existsSync(path.join(tmpDir, 'result.json'))).toBe(true);
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
    expect(fs.existsSync(path.join(tmpDir, 'result.json'))).toBe(true);
  });
});
