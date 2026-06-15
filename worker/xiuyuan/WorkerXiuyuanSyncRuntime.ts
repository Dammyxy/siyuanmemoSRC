import { CardState, CardType, type FSRSCard } from '@/types/card';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import type { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import type {
  BackendXiuyuanNativeRiffBlockFacts,
  BackendXiuyuanSyncLocalFacts,
  BackendXiuyuanSyncLocalTombstoneFact,
  BackendXiuyuanSyncMode,
} from '../../packages/contracts/src/backend-rpc';
import type { WorkerXiuyuanSyncApplyInput } from './WorkerXiuyuanSyncPlanner';

type WorkerXiuyuanSyncRuntimeDatabase = Pick<RuntimeSqliteDatabaseService, 'getAll' | 'getOne' | 'run' | 'runTransaction'>;

type WorkerXiuyuanSyncRuntimeRepository = Pick<SqlUnifiedStorageRepository, 'getCard' | 'upsertCard'>;

export interface WorkerXiuyuanSyncRuntimeDeps {
  runtime: WorkerXiuyuanSyncRuntimeDatabase;
  repository: WorkerXiuyuanSyncRuntimeRepository;
  now?: () => number;
}

export class WorkerXiuyuanSyncRuntime {
  private readonly now: () => number;

  constructor(private readonly deps: WorkerXiuyuanSyncRuntimeDeps) {
    this.now = deps.now ?? Date.now;
  }

  async readXiuyuanSyncLocalFacts(): Promise<BackendXiuyuanSyncLocalFacts> {
    const loadedAt = this.now();
    const xiuyuanRows = this.deps.runtime.getAll<{
      id: string;
      updated_at: number | null;
      payload_json: string;
    }>(
      `SELECT id, updated_at, payload_json
       FROM xiuyuans
       WHERE NOT EXISTS (
         SELECT 1 FROM tombstones t
         WHERE t.kind = 'xiuyuan' AND t.id = xiuyuans.id
       )
       ORDER BY id ASC`,
    );
    const cardRows = this.deps.runtime.getAll<{
      id: string;
      block_id: string | null;
      xiuyuan_id: string | null;
      scheduler_type: string | null;
      updated_at: number | null;
      payload_json: string;
      dto_json: string | null;
    }>(
      `SELECT id, block_id, xiuyuan_id, scheduler_type, updated_at, payload_json, dto_json
       FROM cards
       WHERE NOT EXISTS (
         SELECT 1 FROM tombstones t
         WHERE t.kind = 'card' AND t.id = cards.id
       )
       ORDER BY id ASC`,
    );
    const tombstoneRows = this.deps.runtime.getAll<{
      kind: string;
      id: string;
      deleted_at: number | null;
      deleted_by: string | null;
      payload_json: string | null;
    }>(
      `SELECT kind, id, deleted_at, deleted_by, payload_json
       FROM tombstones
       WHERE kind IN ('card', 'xiuyuan')
       ORDER BY kind ASC, id ASC`,
    );

    return {
      loadedAt,
      xiuyuans: xiuyuanRows
        .map<BackendXiuyuanSyncLocalFacts['xiuyuans'][number] | null>((row) => {
          const payload = parseSqlJsonRecord(row.payload_json);
          const meta = readMetaRecord(payload);
          const id = normalizeString(row.id) || readRecordString(payload, ['id']);
          if (!id) {
            return null;
          }
          const blockIds = extractXiuyuanBlockIds(payload);
          const representativeBlockId = blockIds[0] ?? null;
          return {
            id,
            blockIds,
            representativeBlockId,
            templateId: extractPayloadTemplateId(payload, meta),
            ownership: readRecordString(meta, ['ownership']),
            source: readRecordString(meta, ['source']),
            updatedAt: readRecordNumber(payload, ['updatedAt', 'updated_at'], row.updated_at),
          };
        })
        .filter((fact): fact is BackendXiuyuanSyncLocalFacts['xiuyuans'][number] => Boolean(fact)),
      cards: cardRows
        .map<BackendXiuyuanSyncLocalFacts['cards'][number] | null>((row) => {
          const dtoPayload = parseSqlJsonRecord(row.dto_json);
          const payloadJsonRecord = parseSqlJsonRecord(row.payload_json);
          const effectivePayload = Object.keys(dtoPayload).length > 0 ? dtoPayload : payloadJsonRecord;
          const meta = readMetaRecord(effectivePayload);
          const id = normalizeString(row.id) || readRecordString(effectivePayload, ['id']);
          const blockId = normalizeString(row.block_id)
            || readRecordString(effectivePayload, ['blockId', 'blockID'])
            || null;
          if (!id || !blockId) {
            return null;
          }
          return {
            id,
            xiuyuanId: normalizeString(row.xiuyuan_id)
              || readRecordString(effectivePayload, ['xiuyuanID', 'xiuyuanId'])
              || null,
            blockId,
            riffCardId: readRecordString(effectivePayload, ['riffCardId', 'riffCardID'])
              ?? readRecordString(meta, ['riffCardId', 'riffCardID', 'riffPrimaryCardId']),
            templateId: extractPayloadTemplateId(effectivePayload, meta),
            ownership: readRecordString(meta, ['ownership']),
            source: readRecordString(meta, ['source']),
            schedulerType: normalizeString(row.scheduler_type)
              || readRecordString(effectivePayload, ['schedulerType'])
              || null,
            updatedAt: readRecordNumber(effectivePayload, ['updatedAt', 'updated_at'], row.updated_at),
          };
        })
        .filter((fact): fact is BackendXiuyuanSyncLocalFacts['cards'][number] => Boolean(fact)),
      tombstones: tombstoneRows
        .map<BackendXiuyuanSyncLocalTombstoneFact | null>((row) => {
          const kind = normalizeString(row.kind);
          const id = normalizeString(row.id);
          if ((kind !== 'card' && kind !== 'xiuyuan') || !id) {
            return null;
          }
          const payload = parseSqlJsonRecord(row.payload_json);
          return {
            kind,
            id,
            blockId: readRecordString(payload, ['blockId', 'blockID']),
            xiuyuanId: readRecordString(payload, ['xiuyuanId', 'xiuyuanID']),
            riffCardId: readRecordString(payload, ['riffCardId', 'riffCardID', 'riffPrimaryCardId']),
            deletedAt: readRecordNumber(payload, ['deletedAt', 'deleted_at'], row.deleted_at),
            deletedBy: normalizeString(row.deleted_by) || readRecordString(payload, ['deletedBy', 'deleted_by']),
          };
        })
        .filter((fact): fact is BackendXiuyuanSyncLocalTombstoneFact => Boolean(fact)),
    };
  }

  async applyXiuyuanSyncPlan(input: WorkerXiuyuanSyncApplyInput): Promise<{
    blockIds: string[];
    cardIds: string[];
  }> {
    const nativeByBlockId = new Map(input.nativeBlocks.map((block) => [normalizeString(block.id), block]));
    const localCardByBlockId = new Map(input.localFacts.cards.map((card) => [normalizeString(card.blockId), card]));
    const localXiuyuanByBlockId = new Map<string, BackendXiuyuanSyncLocalFacts['xiuyuans'][number]>();
    for (const xiuyuan of input.localFacts.xiuyuans) {
      for (const blockId of xiuyuan.blockIds) {
        const normalized = normalizeString(blockId);
        if (normalized && !localXiuyuanByBlockId.has(normalized)) {
          localXiuyuanByBlockId.set(normalized, xiuyuan);
        }
      }
      const representative = normalizeString(xiuyuan.representativeBlockId);
      if (representative && !localXiuyuanByBlockId.has(representative)) {
        localXiuyuanByBlockId.set(representative, xiuyuan);
      }
    }

    const changedBlockIds: string[] = [];
    const changedCardIds: string[] = [];

    await this.deps.runtime.runTransaction('xiuyuan.sync.apply', () => {
      for (const blockId of input.plan.candidateBlockIds.update) {
        const nativeBlock = nativeByBlockId.get(blockId);
        if (!nativeBlock) {
          continue;
        }
        const card = localCardByBlockId.get(blockId);
        const xiuyuan = localXiuyuanByBlockId.get(blockId);
        const cardId = normalizeString(card?.id) || `card-${blockId}`;
        const xiuyuanId = normalizeString(xiuyuan?.id ?? card?.xiuyuanId) || `xy-${blockId}`;
        const changed = this.upsertXiuyuanSyncRows({
          block: nativeBlock,
          cardId,
          xiuyuanId,
          deckId: input.request.deckId,
          updatedAt: input.appliedAt,
        });
        if (changed) {
          changedBlockIds.push(blockId);
          changedCardIds.push(cardId);
        }
      }

      for (const blockId of input.plan.candidateBlockIds.delete) {
        const card = localCardByBlockId.get(blockId);
        const xiuyuan = localXiuyuanByBlockId.get(blockId);
        const cardId = normalizeString(card?.id) || `card-${blockId}`;
        const xiuyuanId = normalizeString(xiuyuan?.id ?? card?.xiuyuanId) || `xy-${blockId}`;
        const existingCardRow = this.deps.runtime.getOne<{ id: string }>(
          'SELECT id FROM cards WHERE id = ?',
          [cardId],
        );
        const existingXiuyuanRow = this.deps.runtime.getOne<{ id: string }>(
          'SELECT id FROM xiuyuans WHERE id = ?',
          [xiuyuanId],
        );
        const existingCardTombstone = this.deps.runtime.getOne<{ id: string }>(
          'SELECT id FROM tombstones WHERE kind = ? AND id = ?',
          ['card', cardId],
        );
        const existingXiuyuanTombstone = this.deps.runtime.getOne<{ id: string }>(
          'SELECT id FROM tombstones WHERE kind = ? AND id = ?',
          ['xiuyuan', xiuyuanId],
        );
        const deleteChanged = Boolean(existingCardRow)
          || Boolean(existingXiuyuanRow)
          || !existingCardTombstone
          || !existingXiuyuanTombstone;
        if (!deleteChanged) {
          continue;
        }
        this.deps.runtime.run('DELETE FROM cards WHERE id = ?', [cardId]);
        this.deps.runtime.run('DELETE FROM xiuyuans WHERE id = ?', [xiuyuanId]);
        this.deps.runtime.run(
          `INSERT OR REPLACE INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
           VALUES (?, ?, ?, ?, ?)`,
          ['card', cardId, input.appliedAt, 'xiuyuan.sync.execute', JSON.stringify({ blockId, commandId: input.request.commandId })],
        );
        this.deps.runtime.run(
          `INSERT OR REPLACE INTO tombstones (kind, id, deleted_at, deleted_by, payload_json)
           VALUES (?, ?, ?, ?, ?)`,
          ['xiuyuan', xiuyuanId, input.appliedAt, 'xiuyuan.sync.execute', JSON.stringify({ blockId, commandId: input.request.commandId })],
        );
        changedBlockIds.push(blockId);
        changedCardIds.push(cardId);
      }

      for (const blockId of input.plan.candidateBlockIds.create) {
        const nativeBlock = nativeByBlockId.get(blockId);
        if (!nativeBlock) {
          continue;
        }
        const cardId = `card-${blockId}`;
        const xiuyuanId = `xy-${blockId}`;
        const changed = this.upsertXiuyuanSyncRows({
          block: nativeBlock,
          cardId,
          xiuyuanId,
          deckId: input.request.deckId,
          updatedAt: input.appliedAt,
        });
        if (changed) {
          changedBlockIds.push(blockId);
          changedCardIds.push(cardId);
        }
      }

      const hasPersistedChanges = changedBlockIds.length > 0;
      if (hasPersistedChanges || input.request.persistIdleCheckpoint !== false) {
        this.advanceXiuyuanSyncCheckpoint(input.request.mode, input.appliedAt);
      }
    });

    return {
      blockIds: uniqueStrings(changedBlockIds),
      cardIds: uniqueStrings(changedCardIds),
    };
  }

  private upsertXiuyuanSyncRows(input: {
    block: BackendXiuyuanNativeRiffBlockFacts;
    cardId: string;
    xiuyuanId: string;
    deckId: string;
    updatedAt: number;
  }): boolean {
    const riffCardId = normalizeString(input.block.riffCardID)
      || normalizeString(input.block.riffCardId)
      || normalizeString(input.block.riffCard?.id)
      || input.block.id;
    const xiuyuanPayload = {
      id: input.xiuyuanId,
      blockIDs: [input.block.id],
      templateID: 'builtin-riff-sync',
      content: input.block.content,
      updatedAt: input.updatedAt,
      meta: {
        ownership: 'riff-managed',
        source: 'riff-sync',
        riffCardId,
        deckId: input.deckId,
      },
    };
    const existingCard = this.deps.repository.getCard(input.cardId);
    const nextCard = this.buildXiuyuanSyncCardPayload({
      ...input,
      riffCardId,
      existingCard,
    });
    const xiuyuanChanged = this.isXiuyuanSyncPayloadChanged(input.xiuyuanId, xiuyuanPayload);
    const cardChanged = this.isXiuyuanSyncCardChanged(input.cardId, existingCard, nextCard);
    if (!xiuyuanChanged && !cardChanged) {
      return false;
    }
    if (xiuyuanChanged) {
      this.deps.runtime.run(
        `INSERT OR REPLACE INTO xiuyuans (id, updated_at, payload_json)
         VALUES (?, ?, ?)`,
        [input.xiuyuanId, input.updatedAt, JSON.stringify(xiuyuanPayload)],
      );
    }
    if (cardChanged) {
      this.deps.repository.upsertCard(nextCard);
    }
    this.deps.runtime.run('DELETE FROM tombstones WHERE kind = ? AND id IN (?, ?)', ['card', input.cardId, input.xiuyuanId]);
    this.deps.runtime.run('DELETE FROM tombstones WHERE kind = ? AND id = ?', ['xiuyuan', input.xiuyuanId]);
    return true;
  }

  private advanceXiuyuanSyncCheckpoint(mode: BackendXiuyuanSyncMode, appliedAt: number): void {
    if (mode !== 'full' && mode !== 'incremental') {
      return;
    }
    const row = this.deps.runtime.getOne<{ value_json: string | null }>(
      'SELECT value_json FROM riff_sync WHERE key = ?',
      ['sync_state'],
    );
    const current = parseSqlJsonRecord(row?.value_json);
    const previousFullAt = toNullableTimestamp(current.lastSuccessfulFullAt) ?? 0;
    const previousIncrementalAt = toNullableTimestamp(current.lastSuccessfulIncrementalAt) ?? 0;
    const next = {
      ...current,
      ...(mode === 'full'
        ? { lastSuccessfulFullAt: Math.max(previousFullAt, appliedAt) }
        : {
            lastSuccessfulIncrementalAt: Math.max(previousIncrementalAt, appliedAt),
            lastSuccessfulIncrementalCursor: `timestamp:${Math.max(previousIncrementalAt, appliedAt)}`,
          }),
    };
    if (stableStringifyJson(current) === stableStringifyJson(next)) {
      return;
    }
    this.deps.runtime.run(
      'INSERT OR REPLACE INTO riff_sync (key, value_json, updated_at) VALUES (?, ?, ?)',
      ['sync_state', JSON.stringify(next), appliedAt],
    );
  }

  private isXiuyuanSyncPayloadChanged(
    xiuyuanId: string,
    nextPayload: {
      id: string;
      blockIDs: string[];
      templateID: string;
      content: string;
      meta: Record<string, unknown>;
    },
  ): boolean {
    const row = this.deps.runtime.getOne<{ payload_json: string | null }>(
      'SELECT payload_json FROM xiuyuans WHERE id = ?',
      [xiuyuanId],
    );
    if (!row) {
      return true;
    }
    const current = parseSqlJsonRecord(row.payload_json);
    const comparableCurrent = {
      id: normalizeString(current.id),
      blockIDs: normalizeStringArray(Array.isArray(current.blockIDs) ? current.blockIDs : []),
      templateID: normalizeString(current.templateID),
      content: normalizeString(current.content),
      meta: isRecord(current.meta) ? current.meta : {},
    };
    const comparableNext = {
      id: nextPayload.id,
      blockIDs: normalizeStringArray(nextPayload.blockIDs),
      templateID: nextPayload.templateID,
      content: normalizeString(nextPayload.content),
      meta: nextPayload.meta,
    };
    return stableStringifyJson(comparableCurrent) !== stableStringifyJson(comparableNext);
  }

  private isXiuyuanSyncCardChanged(cardId: string, existingCard: FSRSCard | undefined, nextCard: FSRSCard): boolean {
    if (!existingCard) {
      return true;
    }
    void cardId;
    const existingForCompare = existingCard;
    const currentComparable = toXiuyuanSyncComparableCard(existingForCompare);
    const nextComparable = toXiuyuanSyncComparableCard(nextCard);
    return stableStringifyJson(currentComparable) !== stableStringifyJson(nextComparable);
  }

  private buildXiuyuanSyncCardPayload(input: {
    block: BackendXiuyuanNativeRiffBlockFacts;
    cardId: string;
    xiuyuanId: string;
    deckId: string;
    updatedAt: number;
    riffCardId: string;
    existingCard?: FSRSCard;
  }): FSRSCard {
    const existing = input.existingCard;
    const nativeSchedule = this.readNativeRiffSchedule(input.block.riffCard);
    const schedule = this.resolveXiuyuanSyncSchedule({
      existing,
      nativeSchedule,
    });
    const meta = {
      ...(isRecord(existing?.meta) ? existing?.meta : {}),
      templateID: 'builtin-riff-sync',
      ownership: 'riff-managed',
      source: 'riff-sync',
      riffCardId: input.riffCardId,
      deckId: input.deckId,
    };
    const card = {
      ...(existing ?? {}),
      id: input.cardId,
      blockId: input.block.id,
      xiuyuanID: input.xiuyuanId,
      due: schedule.due ?? existing?.due ?? input.updatedAt,
      stability: schedule.stability ?? existing?.stability ?? 0,
      difficulty: schedule.difficulty ?? existing?.difficulty ?? 0,
      reps: schedule.reps ?? existing?.reps ?? 0,
      lapses: schedule.lapses ?? existing?.lapses ?? 0,
      state: schedule.state ?? existing?.state ?? CardState.New,
      lastReview: schedule.lastReview ?? existing?.lastReview ?? 0,
      elapsedDays: schedule.elapsedDays ?? existing?.elapsedDays ?? 0,
      scheduledDays: schedule.scheduledDays ?? existing?.scheduledDays ?? 0,
      priority: existing?.priority ?? 50,
      type: existing?.type ?? CardType.Topic,
      tags: existing?.tags ?? [],
      leechCount: existing?.leechCount ?? 0,
      isLeech: existing?.isLeech ?? false,
      skipped: existing?.skipped ?? false,
      createdAt: existing?.createdAt ?? input.updatedAt,
      updatedAt: input.updatedAt,
      schedulerType: existing?.schedulerType ?? 'fsrs-v6',
      riffCardId: input.riffCardId,
      content: input.block.content,
      meta,
    } as FSRSCard;
    return canonicalizeSchedulingState(card, {
      source: 'riff-import',
      mode: 'repair-external',
      now: input.updatedAt,
    }).card;
  }

  private resolveXiuyuanSyncSchedule(input: {
    existing?: FSRSCard;
    nativeSchedule: Partial<Pick<
      FSRSCard,
      'due' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'state' | 'lastReview' | 'elapsedDays' | 'scheduledDays'
    >>;
  }): Partial<Pick<
    FSRSCard,
    'due' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'state' | 'lastReview' | 'elapsedDays' | 'scheduledDays'
  >> {
    const existing = input.existing;
    if (!existing) {
      return input.nativeSchedule;
    }
    const nativeLastReview = toNullableTimestamp(input.nativeSchedule.lastReview);
    const existingLastReview = toNullableTimestamp(existing.lastReview);
    const nativeReps = readNonNegativeRepairInteger(input.nativeSchedule.reps);
    const existingReps = readNonNegativeRepairInteger(existing.reps);
    const nativeIsNewer =
      (nativeLastReview !== null && existingLastReview !== null && nativeLastReview > existingLastReview)
      || (nativeLastReview !== null && existingLastReview === null)
      || (
        nativeLastReview !== null
        && existingLastReview !== null
        && nativeLastReview === existingLastReview
        && nativeReps !== null
        && existingReps !== null
        && nativeReps > existingReps
      );
    return nativeIsNewer ? input.nativeSchedule : {};
  }

  private readNativeRiffSchedule(
    riffCard: BackendXiuyuanNativeRiffBlockFacts['riffCard'],
  ): Partial<Pick<
    FSRSCard,
    'due' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'state' | 'lastReview' | 'elapsedDays' | 'scheduledDays'
  >> {
    if (!riffCard) {
      return {};
    }
    const due = parseNativeRiffTimestamp(riffCard.due);
    const lastReview = parseNativeRiffTimestamp(riffCard.lastReview);
    return {
      ...(due !== null ? { due } : {}),
      ...(lastReview !== null ? { lastReview } : {}),
      ...readFiniteCardNumber('stability', riffCard.stability),
      ...readFiniteCardNumber('difficulty', riffCard.difficulty),
      ...readFiniteCardInteger('reps', riffCard.reps),
      ...readFiniteCardInteger('lapses', riffCard.lapses),
      ...readFiniteCardInteger('elapsedDays', riffCard.elapsedDays),
      ...readFiniteCardInteger('scheduledDays', riffCard.scheduledDays),
      ...readNativeRiffCardState(riffCard.state),
    };
  }
}

function parseSqlJsonRecord(value: string | null | undefined): Record<string, unknown> {
  const parsed = parseJsonObject<unknown>(String(value || '').trim() || '{}', {});
  return isRecord(parsed) ? parsed : {};
}

function parseJsonObject<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readRecordString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const normalized = normalizeString(record[key]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readRecordNumber(record: Record<string, unknown>, keys: string[], defaultValue?: unknown): number | null {
  for (const key of keys) {
    const numeric = Number(record[key]);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  const defaultNumeric = Number(defaultValue);
  return Number.isFinite(defaultNumeric) ? defaultNumeric : null;
}

function readMetaRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.meta) ? payload.meta : {};
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value);
}

function extractXiuyuanBlockIds(payload: Record<string, unknown>): string[] {
  const direct = readStringArray(payload.blockIDs).concat(readStringArray(payload.blockIds));
  const fromFields: string[] = [];
  if (Array.isArray(payload.fields)) {
    for (const field of payload.fields) {
      if (!isRecord(field)) {
        continue;
      }
      const blockId = readRecordString(field, ['blockID', 'blockId', 'id']);
      if (blockId) {
        fromFields.push(blockId);
      }
    }
  }
  return uniqueStrings([...direct, ...fromFields]);
}

function extractPayloadTemplateId(payload: Record<string, unknown>, meta: Record<string, unknown>): string | null {
  return readRecordString(payload, ['templateID', 'templateId'])
    ?? readRecordString(meta, ['templateID', 'templateId']);
}

function stableStringifyJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (valueType === 'boolean' || valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'undefined') {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringifyJson(item)).join(',')}]`;
  }
  if (valueType === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringifyJson(entryValue)}`).join(',')}}`;
  }
  return 'null';
}

function normalizeStringArray(values: unknown[]): string[] {
  return values.map(normalizeString).filter(Boolean);
}

function toXiuyuanSyncComparableCard(card: FSRSCard): Record<string, unknown> {
  return {
    id: normalizeString(card.id),
    xiuyuanID: normalizeString(card.xiuyuanID),
    blockId: normalizeString(card.blockId),
    due: Number(card.due) || 0,
    stability: Number(card.stability) || 0,
    difficulty: Number(card.difficulty) || 0,
    reps: Number(card.reps) || 0,
    lapses: Number(card.lapses) || 0,
    state: Number(card.state) || 0,
    lastReview: Number(card.lastReview) || 0,
    elapsedDays: Number(card.elapsedDays) || 0,
    scheduledDays: Number(card.scheduledDays) || 0,
    priority: Number(card.priority) || 0,
    type: normalizeString(card.type),
    tags: Array.isArray(card.tags) ? normalizeStringArray(card.tags) : [],
    leechCount: Number(card.leechCount) || 0,
    isLeech: card.isLeech === true,
    skipped: card.skipped === true,
    createdAt: Number(card.createdAt) || 0,
    schedulerType: normalizeString(card.schedulerType),
    riffCardId: normalizeString(card.riffCardId),
    meta: isRecord(card.meta) ? card.meta : {},
  };
}

function toNullableTimestamp(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNativeRiffTimestamp(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readFiniteCardNumber<K extends string>(key: K, value: unknown): Partial<Record<K, number>> {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? { [key]: numeric } as Partial<Record<K, number>> : {};
}

function readFiniteCardInteger<K extends string>(key: K, value: unknown): Partial<Record<K, number>> {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? { [key]: Math.max(0, Math.floor(numeric)) } as Partial<Record<K, number>> : {};
}

function readNativeRiffCardState(value: unknown): Partial<Pick<FSRSCard, 'state'>> {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return {};
  }
  switch (Math.floor(numeric)) {
    case CardState.Learning:
    case CardState.Review:
    case CardState.Relearning:
    case CardState.Suspended:
    case CardState.New:
      return { state: Math.floor(numeric) as CardState };
    default:
      return {};
  }
}

function readNonNegativeRepairInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
}
