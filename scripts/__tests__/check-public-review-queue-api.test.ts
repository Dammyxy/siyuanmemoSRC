import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-public-review-queue-api.cjs';

const tempDirs: string[] = [];

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'public-review-queue-api-check-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-public-review-queue-api', () => {
  it('rejects public queue authority calls in guarded Browser and Review runtime files', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/ui/browser/BadQueueView.ts', `
      export async function load(queue: { getCards: () => Promise<unknown[]> }) {
        return queue.getCards();
      }
    `);
    writeFile(rootDir, 'src/ui/review/v2/BadReviewView.ts', `
      export function transfer(queue: { serializeSessionSnapshot: () => unknown }) {
        return queue.serializeSessionSnapshot();
      }
    `);

    const failures = evaluate({ rootDir });

    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('src/ui/browser/BadQueueView.ts'),
      expect.stringContaining('getCards'),
      expect.stringContaining('src/ui/review/v2/BadReviewView.ts'),
      expect.stringContaining('serializeSessionSnapshot'),
    ]));
  });

  it('allows the dedicated review transfer runtime to read queue session snapshots', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/ui/review/v2/reviewTabTransferRuntime.ts', `
      export function read(source: { serializeSessionSnapshot: () => unknown }) {
        return source.serializeSessionSnapshot();
      }
    `);

    expect(evaluate({ rootDir })).toEqual([]);
  });

  it('does not scan tests or internal application queue owners', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/ui/browser/__tests__/queue.test.ts', `
      export async function load(queue: { getCards: () => Promise<unknown[]> }) {
        return queue.getCards();
      }
    `);
    writeFile(rootDir, 'src/application/adapters/UnifiedQueueStrategy.ts', `
      export async function load(queue: { getCards: () => Promise<unknown[]> }) {
        return queue.getCards();
      }
    `);

    expect(evaluate({ rootDir })).toEqual([]);
  });
});
