import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-backend-runtime-paths.cjs';

const tempDirs: string[] = [];

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-runtime-paths-'));
  tempDirs.push(dir);
  return dir;
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-backend-runtime-paths', () => {
  it('passes against the current package root', () => {
    const result = spawnSync(process.execPath, ['scripts/check-backend-runtime-paths.cjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Backend runtime path check passed.');
  });

  it('fails when an active runtime path loses its application caller anchor', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/UnifiedDataSourceManager.ts', `
      export class UnifiedDataSourceManager {
        public async readQueueProjectionSnapshot() {}
        public async materializeQueueProjection() {}
      }
    `);

    const failures = evaluate({
      rootDir,
      runtimePaths: [{
        id: 'queue-projection',
        status: 'active',
        anchors: [{
          file: 'src/application/services/UnifiedDataSourceManager.ts',
          tokens: [
            'public async readQueueProjectionSnapshot',
            'public async getQueueProjectionCardsBySnapshotIds',
            'public async materializeQueueProjection',
          ],
          reason: 'queue projection must be exposed as the application manager port',
        }],
      }],
    });

    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('getQueueProjectionCardsBySnapshotIds'),
    ]));
  });

  it('fails when a deferred foundation is wired as active runtime without updating the path contract', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/ApplicationContext.ts', `
      import { ExternalSrsAlgorithmRuntimeAdapter } from '@/application/services/external-srs/ExternalSrsAlgorithmRuntime';
      import { SiyuanExternalSrsAlgorithmFileHost } from '@/infrastructure/services/ExternalSrsAlgorithmFileHost';
      import { SqlExternalSrsAlgorithmRegistryRepository } from '@/infrastructure/persistence/sqlite/SqlExternalSrsAlgorithmRegistryRepository';
    `);

    const failures = evaluate({
      rootDir,
      runtimePaths: [{
        id: 'external-srs-algorithms',
        status: 'deferred-foundation',
        anchors: [],
        absentAnchors: [{
          file: 'src/application/ApplicationContext.ts',
          tokens: [
            'ExternalSrsAlgorithmRuntime',
            'SiyuanExternalSrsAlgorithmFileHost',
            'SqlExternalSrsAlgorithmRegistryRepository',
          ],
          reason: 'External SRS must not be accidentally claimed as active runtime without an explicit path update',
        }],
      }],
    });

    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('unexpected active-path token'),
    ]));
  });
});
