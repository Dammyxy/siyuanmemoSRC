import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore cjs import
import { evaluate } from '../check-hidden-fallbacks.cjs';

const tempDirs: string[] = [];

function createFixtureRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-fallback-check-'));
  tempDirs.push(dir);
  return dir;
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const absolute = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function allowEntry(overrides: Record<string, unknown>) {
  return {
    id: 'allow-test-entry',
    file: 'src/application/services/BrowserApplicationService.ts',
    kind: 'queue-visible-count-operator-rollback',
    symbolPattern: 'fallback to getStats',
    class: 'operator-rollback',
    owner: 'queue-projection',
    reason: 'explicit operator rollback in test fixture',
    removalCondition: 'remove when projection owns all queues',
    testEvidence: 'scripts/__tests__/check-hidden-fallbacks.test.ts',
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-hidden-fallbacks', () => {
  it('fails unclassified P0 runtime fallback in guarded paths', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/ApplicationContext.ts', `
      logger.error('[ApplicationContext] SQLite migration/init failed; legacy storage rollback attempted:', error);
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('storage-legacy-rollback'),
    ]));
  });

  it('fails malformed allowlist entries before accepting runtime exceptions', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', `
      logger.debug('Failed to read queue counter snapshot, fallback to getStats:', { error });
    `);

    const result = evaluate({
      rootDir,
      allowEntries: [allowEntry({ owner: '' })],
    });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('missing owner'),
    ]));
  });

  it('allows explicit unavailable only with a complete inline marker', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', `
      // hidden-fallback-ok: class=explicit-unavailable owner=queue reason=projection-required removal=permanent test=scripts/__tests__/check-hidden-fallbacks.test.ts
      throw new Error('QUEUE_PROJECTION_UNAVAILABLE: fallback prohibited');
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual([]);
    expect(result.hits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'allowed',
        inferredClass: 'explicit-unavailable',
      }),
    ]));
  });

  it('rejects non-empty allowlist entries even when they carry evidence', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/services/BrowserApplicationService.ts', `
      logger.debug('Failed to read queue counter snapshot, fallback to getStats:', { error });
    `);
    writeFile(rootDir, 'src/application/services/DocTreeReviewScopeService.ts', `
      logger.debug('SQL doc-tree scope query failed; fallback prohibited', { error });
    `);

    const result = evaluate({
      rootDir,
      allowEntries: [
        allowEntry({}),
        allowEntry({
          id: 'allow-doc-tree',
          file: 'src/application/services/DocTreeReviewScopeService.ts',
          kind: 'doc-tree-storage-scan-migration-compat',
          symbolPattern: 'SQL doc-tree scope query failed',
          class: 'migration-compat',
          owner: 'doc-tree-scope',
          reason: 'bounded migration compatibility',
          removalCondition: 'remove after projection read port is complete',
        }),
      ],
    });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('hidden fallback allowlist must be empty'),
    ]));
  });

  it('keeps UI labels and parser defaults out of blocking P0 checks', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/entries/TopBarQuickEntryRegistry.ts', `
      export const entry = { fallbackLabel: 'SRS 浏览器' };
    `);
    writeFile(rootDir, 'src/core/queue/domain/SrsV2QueuePolicy.ts', `
      function toFiniteNumber(value: unknown, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
      }
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual([]);
    expect(result.hits).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'info', risk: 'P2' }),
    ]));
  });

  it('detects catch blocks that return empty results after backend dependency failures', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/clients/PrivateApiClient.ts', `
      export async function read() {
        try {
          return await backend.privateRead();
        } catch (error) {
          logger.warn('backend private read failed', error);
          return null;
        }
      }
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('dependency-catch-empty-return'),
    ]));
  });

  it('fails high-risk P1 dependency catches even when the catch body has no backend keyword', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/handlers/AutoCardHandler.ts', `
      export function readContext(plugin) {
        try {
          return plugin.getContext();
        } catch (error) {
          logger.warn('context lookup failed', error);
          return null;
        }
      }
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('dependency-catch-empty-return'),
    ]));
  });

  it('fails high-risk promise catches that collapse dependency errors to empty state', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/adapters/UnifiedQueueStrategy.ts', `
      export async function refresh(queue) {
        const snapshot = await queue.getCounterSnapshot().catch(() => null);
        return snapshot;
      }
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('dependency-promise-empty-catch'),
    ]));
  });

  it('fails application-layer P2 dependency catches that collapse errors to empty state', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/application/handlers/ProgressiveExcerptHotkeyHandler.ts', `
      export async function prepare(progressiveReadingService) {
        try {
          return await progressiveReadingService.prepareSelection();
        } catch (error) {
          logger.warn('Failed to prepare progressive excerpt highlight', error);
          return null;
        }
      }
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('dependency-catch-empty-return'),
    ]));
  });

  it('fails non-application P2 dependency empty catches in guarded runtime paths', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/core/queue/neural/QueryEngine.ts', `
      export async function fetchNeighbors(storage) {
        try {
          return await storage.queryNeighbors();
        } catch (error) {
          logger.error('Failed to fetch neighbors:', error);
          return [];
        }
      }
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('dependency-catch-empty-return'),
    ]));
    expect(result.hits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'src/core/queue/neural/QueryEngine.ts',
        kind: 'dependency-catch-empty-return',
        status: 'violation',
        risk: 'P2',
      }),
    ]));
  });

  it('fails non-application P2 promise catches that collapse dependency errors to empty state', () => {
    const rootDir = createFixtureRoot();
    writeFile(rootDir, 'src/core/queue/domain/RetrievalPracticeQueue.ts', `
      export async function resolve(manager, candidateId) {
        const card = await manager.getCard(candidateId, { silent: true }).catch(() => null);
        return card;
      }
    `);

    const result = evaluate({ rootDir, allowEntries: [] });

    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('dependency-promise-empty-catch'),
    ]));
    expect(result.hits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'src/core/queue/domain/RetrievalPracticeQueue.ts',
        kind: 'dependency-promise-empty-catch',
        status: 'violation',
        risk: 'P2',
      }),
    ]));
  });
});
