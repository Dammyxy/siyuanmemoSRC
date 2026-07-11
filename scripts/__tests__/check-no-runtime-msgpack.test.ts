import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-no-runtime-msgpack.cjs';

const tempDirs: string[] = [];

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-runtime-msgpack-check-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-no-runtime-msgpack', () => {
  it('fails runtime msgpack reads and writes outside explicit migration adapters', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/RuntimeStore.ts', `
      export async function load(fileService: { readMsgpack: (path: string) => Promise<unknown> }) {
        return fileService.readMsgpack('cards.msgpack');
      }
    `);
    writeFile(rootDir, 'src/core/queue/RuntimeQueue.ts', `
      export async function save(fileService: { writeMsgpack: (path: string, data: unknown) => Promise<void> }) {
        return fileService.writeMsgpack('queues.msgpack', {});
      }
    `);

    const failures = evaluate({ rootDir });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('src/application/services/RuntimeStore.ts'),
      expect.stringContaining('src/core/queue/RuntimeQueue.ts'),
    ]));
  });

  it('allows SQLite migration reads from old msgpack storage', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/infrastructure/persistence/sqlite/SqliteMigrationService.ts', `
      export async function migrate(fileService: { readMsgpack: (path: string) => Promise<unknown> }) {
        return fileService.readMsgpack('queues.msgpack');
      }
    `);

    expect(evaluate({ rootDir })).toEqual([]);
  });

  it('allows the explicit legacy storage migration planner to read old msgpack sources', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/LegacyStorageMigrationSourcePlanner.ts', `
      export async function plan(fileService: { readMsgpack: (path: string) => Promise<unknown> }) {
        return fileService.readMsgpack('queues.msgpack');
      }
    `);

    expect(evaluate({ rootDir })).toEqual([]);
  });

  it('allows only the bounded MessagePack truth segment adapter in worker runtime', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'worker/truth/MessagePackTruthSegmentStore.ts', `
      import { encode } from '@msgpack/msgpack';
      export const write = () => encode({ ok: true });
    `);
    writeFile(rootDir, 'worker/truth/LegacyUnifiedCardsSource.ts', `
      export const path = 'unified-cards.msgpack';
    `);
    writeFile(rootDir, 'worker/truth/LegacyUnifiedCardsTruthMigration.ts', `
      import { decode } from '@msgpack/msgpack';
      export const read = (bytes) => decode(bytes);
    `);
    writeFile(rootDir, 'worker/truth/OtherRuntimeStore.ts', `
      import { encode } from '@msgpack/msgpack';
      export const write = () => encode({ ok: true });
    `);

    expect(evaluate({ rootDir })).toEqual([
      expect.stringContaining('worker/truth/LegacyUnifiedCardsSource.ts'),
      expect.stringContaining('worker/truth/LegacyUnifiedCardsTruthMigration.ts'),
      expect.stringContaining('worker/truth/OtherRuntimeStore.ts'),
    ]);
  });

  it('allows only the bounded SQLite delta v2 adapter and review timing path classifier', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts', `
      import { encode } from '@msgpack/msgpack';
      export const path = 'sqlite-delta-log.v2.open.msgpack';
      export const write = () => encode({ ok: true });
    `);
    writeFile(rootDir, 'worker/bootstrap/ReviewFeedbackTimingScope.ts', `
      export const isDelta = (path: string) => /sqlite-delta-log\\.v2\\.sealed-\\d+\\.msgpack$/.test(path);
    `);
    writeFile(rootDir, 'src/infrastructure/persistence/sqlite/OtherDeltaRuntime.ts', `
      import { encode } from '@msgpack/msgpack';
      export const write = () => encode({ ok: true });
    `);

    expect(evaluate({ rootDir })).toEqual([
      expect.stringContaining('src/infrastructure/persistence/sqlite/OtherDeltaRuntime.ts'),
    ]);
  });
});
