import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import {
  evaluate,
  evaluateMutationFamilyAuthorities,
  legacyWriterInventory,
  mutationFamilyAuthorityRules,
} from '../check-storage-writer-authority.cjs';

const tempDirs: string[] = [];

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-writer-authority-'));
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

describe('check-storage-writer-authority', () => {
  it('keeps every approved legacy writer assigned to one mutation family and cutover task', () => {
    for (const entry of legacyWriterInventory) {
      expect(entry.file).toMatch(/^src\//);
      expect(entry.kind).toBeTruthy();
      expect(entry.family).toBeTruthy();
      expect(entry.cutoverTask).toMatch(/^6\.[2-7]$/);
      expect(entry.maxOccurrences).toBeGreaterThan(0);
    }
  });

  it('keeps no renderer SQL or whole-database writer exceptions', () => {
    expect(legacyWriterInventory).toEqual([]);
  });

  it('declares one authority chain for every migrated mutation family and boundary', () => {
    expect(mutationFamilyAuthorityRules.map((entry) => entry.family)).toEqual([
      'review',
      'card-schedule',
      'queue',
      'card-crud',
      'import-repair',
      'renderer-projection',
      'kernel-companion',
    ]);
    expect(evaluateMutationFamilyAuthorities()).toEqual([]);
  });

  it('rejects new renderer SQL, truth, manifest, and whole-database writers', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/NewSqlWriter.ts', `
      const db = new SqliteDatabaseService(fileService);
      const repository = new SqlUnifiedStorageRepository(db);
    `);
    writeFile(rootDir, 'src/application/NewTruthWriter.ts', `
      import { createMessagePackTruthSegmentStore } from '../../worker/truth/MessagePackTruthSegmentStore';
      fileService.writeJSON('truth/review-events/device-A/manifest.v1.json', {});
    `);
    writeFile(rootDir, 'src/core/storage/NewSaveCaller.ts', `
      unifiedStorageManager.save();
      rpc.call('db.persist');
    `);

    expect(evaluate({ rootDir, approvedSites: [] })).toEqual(expect.arrayContaining([
      expect.stringContaining('renderer-sql-service-construction'),
      expect.stringContaining('renderer-sql-repository-construction'),
      expect.stringContaining('renderer-truth-writer-import'),
      expect.stringContaining('renderer-truth-file-write'),
      expect.stringContaining('whole-database-manager-save-caller'),
      expect.stringContaining('whole-database-rpc-persist-caller'),
    ]));
  });

  it('permits only the exact legacy count and rejects another caller in the same file', () => {
    const rootDir = createFixtureRoot();
    const relativePath = 'src/application/ApplicationContext.ts';
    writeFile(rootDir, relativePath, 'const database = new SqliteDatabaseService(fileService);');
    const approvedSites = [{
      file: relativePath,
      kind: 'renderer-sql-service-construction',
      maxOccurrences: 1,
    }];

    expect(evaluate({ rootDir, approvedSites })).toEqual([]);

    writeFile(rootDir, relativePath, `
      const primary = new SqliteDatabaseService(fileService);
      const fallback = new SqliteDatabaseService(fileService);
    `);
    expect(evaluate({ rootDir, approvedSites })).toEqual([
      expect.stringContaining('occurrences 2 exceed approved baseline 1'),
    ]);
  });

  it('rejects missing, duplicate, and fallback mutation-family authority evidence', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/CardWriter.ts', `
      worker.execute(request);
      worker.execute(request);
    `);
    writeFile(rootDir, 'src/kernel.ts', `
      const database = new SqliteDatabaseService(fileService);
    `);
    const rules = [{
      family: 'card-crud',
      evidence: [{
        file: 'src/application/CardWriter.ts',
        kind: 'renderer-card-crud-command',
        pattern: /worker\.execute\s*\(\s*request\s*\)/g,
        expectedOccurrences: 1,
      }, {
        file: 'worker/bootstrap/rpc/CardWriter.ts',
        kind: 'worker-card-crud-writer',
        pattern: /database\.commit\s*\(\s*request\s*\)/g,
        expectedOccurrences: 1,
      }],
      forbidden: [{
        file: 'src/kernel.ts',
        kind: 'kernel-database-owner',
        pattern: /\bSqliteDatabaseService\b/g,
      }],
    }];

    expect(evaluateMutationFamilyAuthorities({ rootDir, rules })).toEqual([
      expect.stringContaining('occurrences 2 must equal 1'),
      expect.stringContaining('missing authority evidence file worker/bootstrap/rpc/CardWriter.ts'),
      expect.stringContaining('contains forbidden kernel-database-owner occurrences 1'),
    ]);
  });
});
