import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { syncDir, isRcloneAvailable } from '../src/lib/sync.js';
import * as child_process from 'node:child_process';

// Mock the entire module
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execSync: vi.fn(),
    spawnSync: vi.fn(),
  };
});

describe('syncDir utility', () => {
  let srcDir;
  let destDir;

  beforeEach(() => {
    srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-src-'));
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-dest-'));
    vi.resetAllMocks();
  });

  afterEach(() => {
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it('should correctly detect if rclone is available', () => {
    const { execSync } = child_process;

    vi.mocked(execSync).mockReturnValueOnce('rclone v1.60.0');
    expect(isRcloneAvailable()).toBe(true);

    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error();
    });
    expect(isRcloneAvailable()).toBe(false);
  });

  it('should sync files using fs.cpSync fallback when rclone is not available', () => {
    const { execSync } = child_process;
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error();
    });

    fs.writeFileSync(path.join(srcDir, 'file1.txt'), 'content1');
    fs.mkdirSync(path.join(srcDir, 'subdir'));
    fs.writeFileSync(path.join(srcDir, 'subdir', 'file2.txt'), 'content2');

    syncDir(srcDir, destDir);

    expect(fs.readFileSync(path.join(destDir, 'file1.txt'), 'utf8')).toBe(
      'content1',
    );
    expect(
      fs.readFileSync(path.join(destDir, 'subdir', 'file2.txt'), 'utf8'),
    ).toBe('content2');
  });

  it('should respect exclude option', () => {
    const { execSync } = child_process;
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error();
    });

    fs.writeFileSync(path.join(srcDir, 'file1.txt'), 'content1');
    fs.mkdirSync(path.join(srcDir, 'exclude_me'));
    fs.writeFileSync(path.join(srcDir, 'exclude_me', 'file2.txt'), 'content2');

    syncDir(srcDir, destDir, { exclude: ['exclude_me'] });

    expect(fs.existsSync(path.join(destDir, 'file1.txt'))).toBe(true);
    expect(fs.existsSync(path.join(destDir, 'exclude_me'))).toBe(false);
  });

  it('should respect overwrite: false option', () => {
    const { execSync } = child_process;
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error();
    });

    fs.writeFileSync(path.join(srcDir, 'file1.txt'), 'new content');
    fs.writeFileSync(path.join(destDir, 'file1.txt'), 'old content');

    syncDir(srcDir, destDir, { overwrite: false });

    expect(fs.readFileSync(path.join(destDir, 'file1.txt'), 'utf8')).toBe(
      'old content',
    );
  });

  it('should throw error if validation fails (missing file)', () => {
    const { execSync } = child_process;
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error();
    });

    // We can't easily mock fs.cpSync here if we want to use the real one in other tests,
    // but we can just not write the file in a manual loop if we were doing it manually.
    // However, syncDir uses fs.cpSync.
    // Let's mock fs.cpSync for this test.
    const cpSpy = vi.spyOn(fs, 'cpSync').mockImplementation(() => {});

    fs.writeFileSync(path.join(srcDir, 'file1.txt'), 'content');

    expect(() => syncDir(srcDir, destDir)).toThrow(
      'Validation failed: file1.txt missing in destination',
    );
    cpSpy.mockRestore();
  });

  it('should throw error if validation fails (size mismatch)', () => {
    const { execSync } = child_process;
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error();
    });

    const cpSpy = vi.spyOn(fs, 'cpSync').mockImplementation((src, dest) => {
      fs.writeFileSync(dest, 'wrong content');
    });

    fs.writeFileSync(path.join(srcDir, 'file1.txt'), 'original content');

    expect(() => syncDir(srcDir, destDir)).toThrow(
      /Validation failed: file1.txt size mismatch/,
    );
    cpSpy.mockRestore();
  });

  it('should attempt to use rclone when available', () => {
    const { execSync, spawnSync } = child_process;
    vi.mocked(execSync).mockReturnValue('rclone v1.60.0');
    vi.mocked(spawnSync).mockReturnValue({ status: 0 });

    fs.writeFileSync(path.join(srcDir, 'file1.txt'), 'content');

    // Mock validation to pass since spawnSync doesn't actually copy
    // We'll just check that it was called correctly.
    // Actually, we can just make it pass validation by manually copying.
    vi.mocked(spawnSync).mockImplementation(() => {
      fs.cpSync(srcDir, destDir, { recursive: true });
      return { status: 0 };
    });

    syncDir(srcDir, destDir, { exclude: ['results'] });

    expect(spawnSync).toHaveBeenCalledWith(
      'rclone',
      expect.arrayContaining([
        'copy',
        srcDir,
        destDir,
        '--exclude',
        '/results/**',
        '--exclude',
        '/results',
      ]),
      expect.anything(),
    );
  });
});
