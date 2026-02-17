import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startWorker } from '../src/lib/worker.js';
import * as executor from '../src/lib/executor.js';

vi.mock('../src/lib/executor.js');
vi.mock('node:fs');

describe('Dry Run Mode', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute job from test-payload.json when --dry-run is present', () => {
    const mockPayload = {
      id: 'test-dry-run',
      workDir: './test-dir',
      steps: ['echo hello']
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPayload));
    vi.mocked(executor.executeJob).mockReturnValue({ status: 'success', exitCode: 0 });

    startWorker(['node', 'worker.js', '--dry-run']);

    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('test-payload.json'));
    expect(executor.executeJob).toHaveBeenCalledWith('./test-dir', 'test-dry-run', { steps: ['echo hello'] });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"status": "success"'));
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should use defaults if id and workDir are missing in test-payload.json', () => {
    const mockPayload = {
      steps: ['echo hello']
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPayload));
    vi.mocked(executor.executeJob).mockReturnValue({ status: 'success', exitCode: 0 });

    startWorker(['node', 'worker.js', '--dry-run']);

    expect(executor.executeJob).toHaveBeenCalledWith('.', 'dry-run', { steps: ['echo hello'] });
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should exit with error if test-payload.json is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    startWorker(['node', 'worker.js', '--dry-run']);

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit with error if test-payload.json is invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

    startWorker(['node', 'worker.js', '--dry-run']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse test-payload.json'),
      expect.any(Error),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
