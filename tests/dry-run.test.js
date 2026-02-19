import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { startWorker } from '../src/lib/worker.js';
import * as executor from '../src/lib/executor.js';

vi.mock('../src/lib/executor.js');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn((p) => {
        if (p.toString().includes('package.json')) return true;
        return actual.default.existsSync(p);
      }),
      readFileSync: vi.fn((p, opts) => {
        if (p.toString().includes('package.json')) {
          return JSON.stringify({ version: '1.0.0' });
        }
        return actual.default.readFileSync(p, opts);
      }),
    },
    existsSync: vi.fn((p) => {
      if (p.toString().includes('package.json')) return true;
      return actual.existsSync(p);
    }),
    readFileSync: vi.fn((p, opts) => {
      if (p.toString().includes('package.json')) {
        return JSON.stringify({ version: '1.0.0' });
      }
      return actual.readFileSync(p, opts);
    }),
  };
});

describe('Dry Run Mode', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default mock for package.json
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p.toString().includes('package.json')) {
        return JSON.stringify({ version: '1.0.0' });
      }
      return null;
    });
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p.toString().includes('package.json')) return true;
      return false;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute job from test-payload.json when --dry-run is present', async () => {
    const mockPayload = {
      id: 'test-dry-run',
      workDir: './test-dir',
      steps: ['echo hello'],
    };

    vi.mocked(fs.existsSync).mockImplementation(
      (p) =>
        p.toString().includes('test-payload.json') ||
        p.toString().includes('package.json'),
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p.toString().includes('test-payload.json'))
        return JSON.stringify(mockPayload);
      if (p.toString().includes('package.json'))
        return JSON.stringify({ version: '1.0.0' });
      return null;
    });
    vi.mocked(executor.executeJob).mockResolvedValue({
      status: 'success',
      exitCode: 0,
    });

    await startWorker(['node', 'worker.js', '--dry-run']);

    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining('test-payload.json'),
    );
    expect(executor.executeJob).toHaveBeenCalledWith(
      './test-dir',
      'test-dry-run',
      { steps: ['echo hello'] },
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"status": "success"'),
    );
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should use defaults if id and workDir are missing in test-payload.json', async () => {
    const mockPayload = {
      steps: ['echo hello'],
    };

    vi.mocked(fs.existsSync).mockImplementation(
      (p) =>
        p.toString().includes('test-payload.json') ||
        p.toString().includes('package.json'),
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p.toString().includes('test-payload.json'))
        return JSON.stringify(mockPayload);
      if (p.toString().includes('package.json'))
        return JSON.stringify({ version: '1.0.0' });
      return null;
    });
    vi.mocked(executor.executeJob).mockResolvedValue({
      status: 'success',
      exitCode: 0,
    });

    await startWorker(['node', 'worker.js', '--dry-run']);

    expect(executor.executeJob).toHaveBeenCalledWith('.', 'dry-run', {
      steps: ['echo hello'],
    });
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should exit with error if test-payload.json is missing', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      p.toString().includes('package.json'),
    );

    await startWorker(['node', 'worker.js', '--dry-run']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Dry run failed'),
      expect.any(Error),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should exit with error if test-payload.json is invalid JSON', async () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) =>
        p.toString().includes('test-payload.json') ||
        p.toString().includes('package.json'),
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p.toString().includes('test-payload.json')) return 'invalid json';
      if (p.toString().includes('package.json'))
        return JSON.stringify({ version: '1.0.0' });
      return null;
    });

    await startWorker(['node', 'worker.js', '--dry-run']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Dry run failed'),
      expect.any(Error),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
