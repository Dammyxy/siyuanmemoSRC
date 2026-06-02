import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-no-ui-sql.cjs';

const tempDirs: string[] = [];

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-ui-sql-check-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-no-ui-sql', () => {
  it('fails on direct SQL/RPC access patterns when not allowlisted', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/ui/browser/legacy.ts', `
      export async function readLegacy(siyuanApi: { sql: (stmt: string) => Promise<unknown> }) {
        return siyuanApi.sql("select * from blocks");
      }
    `);
    writeFile(rootDir, 'src/application/services/legacy.ts', `
      export async function callRpc() {
        return fetch('/api/plugin/rpc/custom');
      }
    `);

    const failures = evaluate({ rootDir, allowEntries: [] });
    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('src/ui/browser/legacy.ts'),
      expect.stringContaining('src/application/services/legacy.ts'),
    ]));
  });

  it('passes when violations are explicitly allowlisted', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/ui/browser/legacy.ts', `
      export async function readLegacy(siyuanApi: { sql: (stmt: string) => Promise<unknown> }) {
        return siyuanApi.sql("select * from blocks");
      }
    `);
    writeFile(rootDir, 'src/application/services/legacy.ts', `
      import { QuerySiyuanAdapter } from '@/infrastructure/siyuan/QuerySiyuanAdapter';
      export const adapter = new QuerySiyuanAdapter();
    `);

    const allowEntries = [
      {
        id: 'ui-allow',
        checker: 'check-no-ui-sql',
        file: 'src/ui/browser/legacy.ts',
        kind: 'siyuan-api-sql',
        symbolPattern: 'siyuanApi.sql(',
        owner: 'compatibility-read',
        reason: 'temporary',
        removalCondition: 'remove later',
        trackingTask: 'RM019',
      },
      {
        id: 'app-allow',
        checker: 'check-no-ui-sql',
        file: 'src/application/services/legacy.ts',
        kind: 'siyuan-query-adapter-import',
        symbolPattern: 'QuerySiyuanAdapter/ManagerSiyuanAdapter/BrowserSiyuanAdapter import',
        owner: 'application-command',
        reason: 'temporary',
        removalCondition: 'remove later',
        trackingTask: 'RM024',
      },
    ];

    expect(evaluate({ rootDir, allowEntries })).toEqual([]);
  });

  it('does not allow a different symbol in the same file and violation kind', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/legacy.ts', `
      export async function readLegacy(siyuanApi: { sql: (stmt: string) => Promise<unknown> }) {
        return siyuanApi.sql("select * from blocks");
      }
    `);

    const failures = evaluate({
      rootDir,
      allowEntries: [{
        id: 'wrong-symbol',
        checker: 'check-no-ui-sql',
        file: 'src/application/services/legacy.ts',
        kind: 'siyuan-api-sql',
        symbolPattern: 'fetch(\'/api/...)',
        owner: 'compatibility-read',
        reason: 'temporary',
        removalCondition: 'remove later',
        trackingTask: 'RM019',
      }],
    });

    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('src/application/services/legacy.ts'),
    ]));
  });

  it('fails renderer Review SQL mutation paths unless explicitly allowlisted', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/ReviewLogService.ts', `
      export async function write(sqlRepository, log) {
        sqlRepository.addReviewLogV2(log);
      }
    `);

    expect(evaluate({ rootDir, allowEntries: [] })).toEqual(expect.arrayContaining([
      expect.stringContaining('review-sql-mutation'),
    ]));
    expect(evaluate({
      rootDir,
      allowEntries: [{
        id: 'review-log-service-sql-mutation-legacy-debt',
        checker: 'check-no-ui-sql',
        file: 'src/application/services/ReviewLogService.ts',
        kind: 'review-sql-mutation',
        symbolPattern: 'sqlRepository.addReviewLog*/addDrillLogV2/addRescheduleLog',
        owner: 'review-truth-cutover',
        reason: 'known old writer',
        removalCondition: 'remove later',
        trackingTask: 'repair-msgpack-truth-runtime-cutover:2.4',
      }],
    })).toEqual([]);
  });

  it('fails Browser hot-path SQL wrappers, inline truth hydrate, full payload parse, and local queue fallback', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/ui/browser/datasource/LegacySqlDataSource.ts', `
      import { runBrowserSql } from '../browserService';
      export async function readRows(api) {
        return runBrowserSql('select * from blocks', api);
      }
    `);
    writeFile(rootDir, 'src/ui/browser/datasource/LegacyTruthHydrateDataSource.ts', `
      export async function hydrate(fileService) {
        return fileService.readMsgpack('truth/card-memory-facts.msgpack');
      }
    `);
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', `
      export async function deckPage(db) {
        return db.exec('select payload_json, dto_json from cards');
      }
    `);
    writeFile(rootDir, 'src/ui/browser/datasource/LegacyQueueDataSource.ts', `
      export async function fallback(queue) {
        return queue.getCards();
      }
    `);

    const failures = evaluate({ rootDir, allowEntries: [] });

    expect(failures).toEqual(expect.arrayContaining([
      expect.stringContaining('browser-ui-sql-wrapper'),
      expect.stringContaining('browser-inline-msgpack-hydrate'),
      expect.stringContaining('browser-full-payload-page-parse'),
      expect.stringContaining('browser-local-queue-fallback'),
    ]));
  });
});
