import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { classifyStoragePath, evaluate } from '../audit-plugin-storage.cjs';

const tempDirs: string[] = [];

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-storage-audit-'));
  tempDirs.push(dir);
  return dir;
}

function writeFixture(rootDir: string, relativePath: string, size = 1): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, Buffer.alloc(size, 1));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('audit-plugin-storage', () => {
  it('classifies active storage contract files separately from cleanup candidates', () => {
    expect(classifyStoragePath('siyuanmemo.db')).toMatchObject({
      classification: 'forbidden-legacy-petal-db',
      kind: 'legacy-petal-db-ignored',
      diagnostic: 'legacy-petal-db-ignored',
    });
    expect(classifyStoragePath('truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack')).toMatchObject({
      classification: 'expected-active',
      kind: 'messagepack-truth-segment',
    });
    expect(classifyStoragePath('truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack.checksum.json')).toMatchObject({
      classification: 'expected-active',
      kind: 'messagepack-truth-checksum',
    });
    expect(classifyStoragePath('truth/review-events/review-events-v1/device-device-A/manifest.v1.json')).toMatchObject({
      classification: 'expected-active',
      kind: 'messagepack-truth-manifest',
    });
    expect(classifyStoragePath('sqlite-delta-log.v2.manifest.json')).toMatchObject({
      classification: 'expected-active',
      kind: 'sqlite-delta-manifest',
    });
    expect(classifyStoragePath('sqlite-delta-log.v2.open.msgpack')).toMatchObject({
      classification: 'expected-active',
      kind: 'sqlite-delta-open-segment',
    });
    expect(classifyStoragePath('sqlite-delta-log.v2.sealed-1.msgpack')).toMatchObject({
      classification: 'expected-active',
      kind: 'sqlite-delta-sealed-segment',
    });
    expect(classifyStoragePath('sqlite-delta-log.v1.json')).toMatchObject({
      classification: 'cleanup-candidate',
      kind: 'legacy-sqlite-delta-log',
    });
    expect(classifyStoragePath('migration-backups/algorithm-card-state-repair-1701000000005.json')).toMatchObject({
      classification: 'cleanup-candidate',
      kind: 'algorithm-state-repair-backup',
    });
    expect(classifyStoragePath('siyuanmemo.db.shadow-restore-20260526.bak')).toMatchObject({
      classification: 'cleanup-candidate',
      kind: 'root-db-backup',
    });
    expect(classifyStoragePath('upload.tmp')).toMatchObject({
      classification: 'temp-artifact',
    });
  });

  it('marks legacy and storage-slimming follow-up files without deleting anything', () => {
    expect(classifyStoragePath('queues.msgpack')).toMatchObject({
      classification: 'legacy-compat-read',
    });
    expect(classifyStoragePath('practice-queue.msgpack')).toMatchObject({
      classification: 'legacy-compat-read',
    });
    expect(classifyStoragePath('progressive-reading.json')).toMatchObject({
      classification: 'storage-slimming-followup',
      kind: 'progressive-lineage-json',
    });
    expect(classifyStoragePath('siyuanmemo.db.delta.v1.json')).toMatchObject({
      classification: 'cleanup-candidate',
      kind: 'legacy-sqlite-delta-log',
    });
    expect(classifyStoragePath('ai-workbench/sessions/records/session-1.json')).toMatchObject({
      classification: 'storage-slimming-followup',
      kind: 'ai-session-json',
    });
    expect(classifyStoragePath('arena/store.json')).toMatchObject({
      classification: 'storage-slimming-followup',
      kind: 'arena-legacy-json',
    });
    expect(classifyStoragePath('mystery/state.json')).toMatchObject({
      classification: 'unknown',
      kind: 'unrecognized-json',
    });
  });

  it('summarizes counts and largest files for a plugin storage root', () => {
    const rootDir = createFixtureRoot();
    writeFixture(rootDir, 'siyuanmemo.db', 10);
    writeFixture(rootDir, 'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack', 8);
    writeFixture(rootDir, 'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack.checksum.json', 4);
    writeFixture(rootDir, 'truth/review-events/review-events-v1/device-device-A/manifest.v1.json', 3);
    writeFixture(rootDir, 'migration-backups/algorithm-card-state-repair-1701000000005.json', 20);
    writeFixture(rootDir, 'ai-workbench/sessions/records/session-1.json', 5);

    const result = evaluate({ rootDir, topLimit: 2 });

    expect(result.total).toMatchObject({ files: 6, bytes: 50 });
    expect(result.byClassification).toMatchObject({
      'cleanup-candidate': { files: 1, bytes: 20 },
      'expected-active': { files: 3, bytes: 15 },
      'forbidden-legacy-petal-db': { files: 1, bytes: 10 },
      'storage-slimming-followup': { files: 1, bytes: 5 },
    });
    expect(result.byKind).toMatchObject({
      'legacy-petal-db-ignored': { files: 1, bytes: 10 },
      'messagepack-truth-manifest': { files: 1, bytes: 3 },
      'messagepack-truth-segment': { files: 1, bytes: 8 },
      'messagepack-truth-checksum': { files: 1, bytes: 4 },
    });
    expect(result.topFiles.map((file: { relativePath: string }) => file.relativePath)).toEqual([
      'migration-backups/algorithm-card-state-repair-1701000000005.json',
      'siyuanmemo.db',
    ]);
  });

  it('reports a petal SQL DB without truth files as ignored legacy projection debt', () => {
    const rootDir = createFixtureRoot();
    writeFixture(rootDir, 'siyuanmemo.db', 10);
    writeFixture(rootDir, 'sqlite-delta-log.v2.manifest.json', 4);
    writeFixture(rootDir, 'sqlite-delta-log.v2.sealed-1.msgpack', 6);

    const result = evaluate({ rootDir });

    expect(result.byClassification).toMatchObject({
      'expected-active': { files: 2, bytes: 10 },
      'forbidden-legacy-petal-db': { files: 1, bytes: 10 },
    });
    expect(result.byKind).toMatchObject({
      'legacy-petal-db-ignored': { files: 1, bytes: 10 },
      'sqlite-delta-manifest': { files: 1, bytes: 4 },
      'sqlite-delta-sealed-segment': { files: 1, bytes: 6 },
    });
    expect(result.byKind).not.toHaveProperty('messagepack-truth-segment');
    expect(result.byKind).not.toHaveProperty('messagepack-truth-manifest');
  });
});
