import type { BrowserDeckReadPort, SourceExistenceRefreshCandidate } from '@/application/ports/BrowserDeckReadPort';
import type { BrowserQuerySiyuanPort } from '@/application/ports/BrowserQuerySiyuanPort';
import { createLogger } from '@/utils/logger';
import {
  incrementRuntimePerformanceCounter,
  measureRuntimePerformance,
} from '@/utils/runtimePerformanceDiagnostics';
import { markKnownMissingBlockRows } from './MissingBlockMarker';

const logger = createLogger('SourceExistenceCache');

export const SOURCE_EXISTENCE_BATCH_SIZE = 500;
export const SOURCE_EXISTENCE_BACKGROUND_LIMIT = 1000;
export const SOURCE_EXISTENCE_TTL_MS = 24 * 60 * 60 * 1000;

type SourceMarkableRow = {
  blockId?: unknown;
  blockType?: string | null;
  meta?: unknown;
};

interface BlockIdRow extends Record<string, unknown> {
  id?: unknown;
}

export interface SourceExistenceRefreshResult {
  changed: boolean;
  changedToMissing: boolean;
}

function normalizeBlockId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeBlockIds(values: unknown[] | undefined): string[] {
  return Array.from(new Set((values || []).map(normalizeBlockId).filter(Boolean)));
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlQuotedValues(values: string[]): string {
  return values.map((value) => `'${escapeSqlString(value)}'`).join(',');
}

function hasSourceExistencePort(
  port: BrowserDeckReadPort | null | undefined,
): port is BrowserDeckReadPort & Required<Pick<BrowserDeckReadPort,
  'getSourceExistenceRefreshCandidates' | 'updateSourceExistence' | 'getSourceExistenceByBlockIds'
>> {
  return Boolean(
    port?.getSourceExistenceRefreshCandidates
    && port.updateSourceExistence
    && port.getSourceExistenceByBlockIds,
  );
}

async function loadExistingBlockIds(
  siyuanApi: Pick<BrowserQuerySiyuanPort, 'sql'>,
  blockIds: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let index = 0; index < blockIds.length; index += SOURCE_EXISTENCE_BATCH_SIZE) {
    const batchIds = blockIds.slice(index, index + SOURCE_EXISTENCE_BATCH_SIZE);
    const rows = await measureRuntimePerformance('source-existence', 'siyuan-sql.load-existing-block-ids', () => siyuanApi.sql<BlockIdRow>(`
      SELECT id
      FROM blocks
      WHERE id IN (${toSqlQuotedValues(batchIds)})
    `), {
      batchSize: batchIds.length,
      offset: index,
    });
    for (const row of rows) {
      const id = normalizeBlockId(row.id);
      if (id) {
        existing.add(id);
      }
    }
  }
  return existing;
}

function buildUpdates(
  candidates: SourceExistenceRefreshCandidate[],
  existingBlockIds: Set<string>,
): { updates: Array<{ cardId: string; blockId: string; exists: boolean }>; changedToMissing: boolean; changed: boolean } {
  const updates: Array<{ cardId: string; blockId: string; exists: boolean }> = [];
  let changedToMissing = false;
  let changed = false;

  for (const candidate of candidates) {
    const blockId = normalizeBlockId(candidate.blockId);
    if (!blockId) {
      continue;
    }
    const exists = existingBlockIds.has(blockId);
    if (candidate.sourceExists !== exists) {
      changed = true;
      if (!exists) {
        changedToMissing = true;
      }
    }
    updates.push({
      cardId: candidate.cardId,
      blockId,
      exists,
    });
  }

  return { updates, changedToMissing, changed };
}

export async function refreshSourceExistenceForBlockIds(
  port: BrowserDeckReadPort | null | undefined,
  siyuanApi: Pick<BrowserQuerySiyuanPort, 'sql'> | null | undefined,
  blockIds: unknown[],
  options: { limit?: number; staleBefore?: number; includeKnownMissing?: boolean; force?: boolean } = {},
): Promise<SourceExistenceRefreshResult> {
  if (!hasSourceExistencePort(port) || !siyuanApi) {
    return { changed: false, changedToMissing: false };
  }

  const normalizedBlockIds = normalizeBlockIds(blockIds);
  if (normalizedBlockIds.length === 0) {
    return { changed: false, changedToMissing: false };
  }

  try {
    const candidates = measureRuntimePerformance('source-existence', 'refresh-block-ids.load-candidates', () => port.getSourceExistenceRefreshCandidates({
      blockIds: normalizedBlockIds,
      limit: options.limit ?? SOURCE_EXISTENCE_BATCH_SIZE,
      staleBefore: options.staleBefore ?? Date.now() - SOURCE_EXISTENCE_TTL_MS,
      includeKnownMissing: options.includeKnownMissing ?? true,
      force: options.force === true,
    }), {
      blockCount: normalizedBlockIds.length,
      limit: options.limit ?? SOURCE_EXISTENCE_BATCH_SIZE,
    });
    incrementRuntimePerformanceCounter('source-existence', 'refresh-candidates', candidates.length);
    if (candidates.length === 0) {
      return { changed: false, changedToMissing: false };
    }

    const existingBlockIds = await loadExistingBlockIds(
      siyuanApi,
      candidates.map((candidate) => candidate.blockId),
    );
    const result = buildUpdates(candidates, existingBlockIds);
    if (result.updates.length > 0) {
      await measureRuntimePerformance('source-existence', 'refresh-block-ids.update-cache', () => port.updateSourceExistence(result.updates, Date.now()), {
        updateCount: result.updates.length,
      });
    }
    return {
      changed: result.changed,
      changedToMissing: result.changedToMissing,
    };
  } catch (error) {
    logger.debug('Source existence refresh failed; keeping cache fail-open', error);
    return { changed: false, changedToMissing: false };
  }
}

export async function refreshSourceExistenceSweep(
  port: BrowserDeckReadPort | null | undefined,
  siyuanApi: Pick<BrowserQuerySiyuanPort, 'sql'> | null | undefined,
  options: { limit?: number; staleBefore?: number } = {},
): Promise<SourceExistenceRefreshResult> {
  if (!hasSourceExistencePort(port) || !siyuanApi) {
    return { changed: false, changedToMissing: false };
  }

  let candidates: SourceExistenceRefreshCandidate[];
  try {
    candidates = measureRuntimePerformance('source-existence', 'background-sweep.load-candidates.local', () => port.getSourceExistenceRefreshCandidates({
      limit: options.limit ?? SOURCE_EXISTENCE_BACKGROUND_LIMIT,
      staleBefore: options.staleBefore ?? Date.now() - SOURCE_EXISTENCE_TTL_MS,
      includeKnownMissing: true,
    }), {
      limit: options.limit ?? SOURCE_EXISTENCE_BACKGROUND_LIMIT,
    });
    incrementRuntimePerformanceCounter('source-existence', 'background-sweep-candidates-local', candidates.length);
  } catch (error) {
    logger.debug('Source existence sweep failed to load candidates; keeping cache fail-open', error);
    return { changed: false, changedToMissing: false };
  }
  if (candidates.length === 0) {
    return { changed: false, changedToMissing: false };
  }

  return refreshSourceExistenceForBlockIds(
    port,
    siyuanApi,
    candidates.map((candidate) => candidate.blockId),
    {
      limit: candidates.length,
      staleBefore: options.staleBefore,
      includeKnownMissing: true,
    },
  );
}

export function markRowsFromSourceExistenceCache<TRow extends SourceMarkableRow>(
  rows: TRow[],
  port: BrowserDeckReadPort | null | undefined,
): TRow[] {
  if (!port?.getSourceExistenceByBlockIds || rows.length === 0) {
    return rows;
  }

  try {
    const statusByBlockId = port.getSourceExistenceByBlockIds(rows.map((row) => normalizeBlockId(row.blockId)));
    const missingBlockIds: string[] = [];
    for (const [blockId, exists] of statusByBlockId.entries()) {
      if (exists === false) {
        missingBlockIds.push(blockId);
      }
    }
    return markKnownMissingBlockRows(rows, missingBlockIds);
  } catch (error) {
    logger.debug('Source existence cache lookup failed; keeping rows fail-open', error);
    return rows;
  }
}

export function scheduleSourceExistenceRefresh(
  port: BrowserDeckReadPort | null | undefined,
  siyuanApi: Pick<BrowserQuerySiyuanPort, 'sql'> | null | undefined,
  blockIds: unknown[],
): void {
  void refreshSourceExistenceForBlockIds(port, siyuanApi, blockIds, { force: true })
    .catch((error) => {
      logger.debug('Scheduled source existence refresh failed', error);
    });
}
