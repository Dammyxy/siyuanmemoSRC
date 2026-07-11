import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-no-kernel-db-owner.cjs';

const tempDirs: string[] = [];

function fixture(content: string): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-db-owner-'));
  tempDirs.push(rootDir);
  const kernelFile = path.join(rootDir, 'src', 'kernel.ts');
  fs.mkdirSync(path.dirname(kernelFile), { recursive: true });
  fs.writeFileSync(kernelFile, content);
  return rootDir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-no-kernel-db-owner', () => {
  it('accepts relay-only kernel capability', () => {
    expect(evaluate({ rootDir: fixture('const capability = { writesSiyuanMemoDb: false };') }))
      .toEqual([]);
  });

  it('rejects database, delta, truth, and manifest ownership', () => {
    const rootDir = fixture(`
      const capability = { writesSiyuanMemoDb: false };
      const db = 'siyuanmemo.db';
      const delta = 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json';
      const truth = 'truth/review-events/device-A/manifest.v1.json';
    `);

    expect(evaluate({ rootDir })).toEqual(expect.arrayContaining([
      expect.stringContaining('siyuanmemo.db'),
      expect.stringContaining('SQLite delta'),
      expect.stringContaining('truth segments'),
      expect.stringContaining('truth manifests'),
    ]));
  });
});
