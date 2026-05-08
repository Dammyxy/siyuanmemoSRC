import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('SRS runtime hygiene check', () => {
  it('runs from the package root and reports no removed runtime algorithm traces', () => {
    const result = spawnSync(process.execPath, ['scripts/check-srs-runtime-hygiene.cjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('SRS runtime hygiene check passed.');
  });
});
