import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Checks if rclone is available in the system path.
 * @returns {boolean}
 */
export function isRcloneAvailable() {
  try {
    execSync('rclone --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets a map of relative file paths to their sizes for validation.
 * @param {string} dir - The directory to scan.
 * @param {string[]} [exclude] - Patterns to exclude (only at root level for now to match current executor logic).
 * @returns {Map<string, number>}
 */
function getFileStats(dir, exclude = []) {
  const stats = new Map();
  if (!fs.existsSync(dir)) return stats;

  const traverse = (currentDir, relativePath = '') => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (relativePath === '' && exclude.includes(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath, relPath);
      } else if (entry.isFile()) {
        const s = fs.statSync(fullPath);
        stats.set(relPath, s.size);
      }
    }
  };

  traverse(dir);
  return stats;
}

/**
 * Syncs directory from src to dest.
 * @param {string} src - Source directory.
 * @param {string} dest - Destination directory.
 * @param {object} [options] - Sync options.
 * @param {string[]} [options.exclude] - Root-level entries to exclude.
 * @param {boolean} [options.overwrite] - Whether to overwrite existing files. Defaults to true.
 */
export function syncDir(src, dest, options = {}) {
  const { exclude = [], overwrite = true } = options;

  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const rcloneAvailable = isRcloneAvailable();

  if (rcloneAvailable) {
    const args = ['copy', src, dest];
    for (const pattern of exclude) {
      args.push('--exclude', `/${pattern}/**`);
      args.push('--exclude', `/${pattern}`);
    }
    if (!overwrite) {
      args.push('--ignore-existing');
    }
    // Add some robustness flags
    args.push('--retries', '3');
    args.push('--low-level-retries', '10');

    const result = spawnSync('rclone', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`rclone copy failed with exit code ${result.status}`);
    }
  } else {
    // Fallback to fs.cpSync
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      if (exclude.includes(entry)) continue;

      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);

      if (!overwrite && fs.existsSync(destPath)) continue;

      try {
        fs.cpSync(srcPath, destPath, { recursive: true });
      } catch (err) {
        console.error(`Failed to copy ${srcPath} to ${destPath}:`, err);
        throw err;
      }
    }
  }

  // Validation
  const srcStats = getFileStats(src, exclude);
  const destStats = getFileStats(dest);

  for (const [relPath, srcSize] of srcStats) {
    if (!destStats.has(relPath)) {
      // If we are not overwriting, it's possible it was skipped.
      // But if it was skipped, it should already be in dest.
      // So if it's not in destStats, it's a failure.
      throw new Error(`Validation failed: ${relPath} missing in destination`);
    }

    if (overwrite) {
      const destSize = destStats.get(relPath);
      if (destSize !== srcSize) {
        throw new Error(
          `Validation failed: ${relPath} size mismatch (src: ${srcSize}, dest: ${destSize})`,
        );
      }
    } else {
      // If not overwriting, we just care that it exists.
      // We could also check that it's NOT the srcSize if we really wanted to be sure it wasn't overwritten,
      // but that's overkill.
    }
  }
}
