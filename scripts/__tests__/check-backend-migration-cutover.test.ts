import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-backend-migration-cutover.cjs';

const tempDirs: string[] = [];

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutover-check-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-backend-migration-cutover', () => {
  it('passes when forbidden markers are absent', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/usecases/review/ReviewCommitUseCase.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/core/scheduler/SchedulerRouter.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/queries/browser/shared/BrowserDeckQueryKernel.ts', 'export const ok = true;\n');
    writeFile(rootDir, 'src/application/handlers/AutoCardHandler.ts', 'export const ok = true;\n');

    expect(evaluate({ rootDir })).toEqual([]);
  });

  it('fails when legacy fallback markers remain', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/usecases/review/ReviewCommitUseCase.ts', 'legacy review commit fallback\n');
    writeFile(rootDir, 'src/core/scheduler/SchedulerRouter.ts', 'legacy scheduler commit fallback\n');
    writeFile(rootDir, 'src/application/queries/browser/shared/BrowserDeckQueryKernel.ts', 'sql-fallback-getAllCards\n');
    writeFile(rootDir, 'src/application/handlers/AutoCardHandler.ts', 'follower-local fallback\n');

    const failures = evaluate({ rootDir });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('ReviewCommitUseCase.ts'),
      expect.stringContaining('SchedulerRouter.ts'),
      expect.stringContaining('BrowserDeckQueryKernel.ts'),
      expect.stringContaining('AutoCardHandler.ts'),
    ]));
  });
});
