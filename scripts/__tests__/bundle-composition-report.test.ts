import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { collectBundleComposition, formatBundleCompositionTable } from '../bundle-composition-report.cjs';

const tempDirs: string[] = [];

function createTempDist(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-composition-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('bundle-composition-report', () => {
  it('reports bytes and gzip bytes for the official single-file plugin package', () => {
    const distDir = createTempDist();
    fs.writeFileSync(path.join(distDir, 'index.js'), 'require("siyuan");module.exports = Plugin;\n');
    fs.writeFileSync(path.join(distDir, 'index.css'), '.root{display:block}\n');
    fs.writeFileSync(path.join(distDir, 'kernel.js'), 'module.exports = {};\n');

    const rows = collectBundleComposition(distDir);

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'index.js', kind: 'startup-entry' }),
      expect.objectContaining({ file: 'index.css', kind: 'style' }),
      expect.objectContaining({ file: 'kernel.js', kind: 'kernel-companion' }),
    ]));
    expect(rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'startup-required' }),
      expect.objectContaining({ kind: 'chunk' }),
    ]));
    expect(rows.every((row: { gzipBytes: number }) => row.gzipBytes > 0)).toBe(true);
    expect(formatBundleCompositionTable(rows)).toContain('startup-entry');
  });
});
