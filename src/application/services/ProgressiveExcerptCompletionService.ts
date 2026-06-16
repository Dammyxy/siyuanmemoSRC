import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { ProgressiveLineage } from '@/application/commands/card/CreateCardCommand';
import {
  type ExcerptRecord,
  ExcerptRecordService,
  normalizeExcerptBlockIds,
} from '@/application/services/ExcerptRecordService';
import { isErr } from '@/types/result';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProgressiveExcerptCompletionService');

export type ProgressiveExcerptCompletionResult =
  | {
      status: 'completed';
      recordId: string;
      topicCardId: string;
      created: boolean;
    }
  | {
      status: 'failed';
      recordId: string;
      error: string;
    };

export interface ProgressiveExcerptCompletionServiceDependencies {
  cardService: CardApplicationService;
  excerptRecordService: ExcerptRecordService;
  blockExists?: (blockId: string) => Promise<boolean>;
  now?: () => number;
}

export interface ProgressiveExcerptCompletionRepairOptions {
  limit?: number;
  records?: ExcerptRecord[];
}

export interface ProgressiveExcerptCompletionScopedRepairOptions {
  limit?: number;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }
  return normalizeString(error) || 'Unknown error';
}

function getCardId(card: unknown): string {
  if (!card || typeof card !== 'object') {
    return '';
  }
  return normalizeString((card as { id?: unknown }).id);
}

function toRecordObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readStringProperty(source: Record<string, unknown> | undefined, key: string): string {
  return normalizeString(source?.[key]);
}

function readModeProperty(source: Record<string, unknown> | undefined): ProgressiveLineage['mode'] | undefined {
  const mode = readStringProperty(source, 'mode');
  return mode === 'linear' || mode === 'nonlinear' ? mode : undefined;
}

function readSourceBlockIds(
  sourceLineage: Record<string, unknown> | undefined,
  record: ExcerptRecord,
): string[] {
  const candidate = Array.isArray(sourceLineage?.sourceBlockIds)
    ? sourceLineage.sourceBlockIds
    : record.sourceBlockIds;
  const normalized = normalizeExcerptBlockIds(candidate, record.sourceBlockId);
  return normalized.length > 0 ? normalized : record.sourceBlockIds;
}

function buildProgressiveLineage(record: ExcerptRecord): ProgressiveLineage {
  const sourceSemantics = record.sourceSemantics || {};
  const sourceLineage = toRecordObject(sourceSemantics.sourceLineage);
  const payloadIdentity = toRecordObject(sourceSemantics.payloadIdentity);
  const disclosureState = toRecordObject(sourceSemantics.disclosureState);
  const rootKind = readStringProperty(sourceLineage, 'rootKind');
  const rootDocId = readStringProperty(sourceLineage, 'rootDocId');
  const explicitPieceDocId = readStringProperty(sourceLineage, 'pieceDocId');
  const pieceDocId = explicitPieceDocId || (rootKind === 'piece' ? rootDocId : '');
  const sessionId = readStringProperty(sourceLineage, 'sessionId');
  const mode = readModeProperty(sourceLineage);
  const parentTopicCardId = readStringProperty(sourceLineage, 'parentTopicCardId');
  const parentExcerptId = readStringProperty(sourceLineage, 'parentExcerptId');

  return {
    kind: 'excerpt',
    ...(sessionId ? { sessionId } : {}),
    ...(mode ? { mode } : {}),
    ...(pieceDocId ? { pieceDocId } : {}),
    sourceDocId: readStringProperty(sourceLineage, 'sourceDocId') || record.sourceDocId,
    sourceBlockId: readStringProperty(sourceLineage, 'sourceBlockId') || record.sourceBlockId,
    sourceBlockIds: readSourceBlockIds(sourceLineage, record),
    ...(parentExcerptId ? { parentExcerptId } : {}),
    ...(parentTopicCardId ? { parentTopicCardId } : {}),
    ...(sourceLineage ? { sourceLineage: sourceLineage as ProgressiveLineage['sourceLineage'] } : {}),
    ...(payloadIdentity ? { payloadIdentity: payloadIdentity as ProgressiveLineage['payloadIdentity'] } : {}),
    ...(disclosureState ? { disclosureState: disclosureState as ProgressiveLineage['disclosureState'] } : {}),
  };
}

export class ProgressiveExcerptCompletionService {
  private readonly inFlightByExcerptEntityId = new Map<string, Promise<ProgressiveExcerptCompletionResult>>();

  constructor(private readonly deps: ProgressiveExcerptCompletionServiceDependencies) {}

  enqueue(record: ExcerptRecord): Promise<ProgressiveExcerptCompletionResult> {
    const excerptEntityId = normalizeString(record.excerptEntityId);
    if (!excerptEntityId) {
      return Promise.resolve({
        status: 'failed',
        recordId: record.recordId,
        error: '摘录实体 ID 为空',
      });
    }

    const existing = this.inFlightByExcerptEntityId.get(excerptEntityId);
    if (existing) {
      return existing;
    }

    const task = this.complete(record).finally(() => {
      this.inFlightByExcerptEntityId.delete(excerptEntityId);
    });
    this.inFlightByExcerptEntityId.set(excerptEntityId, task);
    return task;
  }

  async repairBatch(options: ProgressiveExcerptCompletionRepairOptions = {}): Promise<ProgressiveExcerptCompletionResult[]> {
    const limitValue = Number.isFinite(options.limit) ? Number(options.limit) : 20;
    const limit = Math.max(0, Math.floor(limitValue));
    const records = options.records || await this.listIncompleteRecords();
    const ordered = this.orderRecordsForRepair(records).slice(0, limit);
    const results: ProgressiveExcerptCompletionResult[] = [];

    for (const record of ordered) {
      results.push(await this.enqueue(record));
    }

    return results;
  }

  async repairRecords(
    records: ExcerptRecord[],
    options: ProgressiveExcerptCompletionScopedRepairOptions = {},
  ): Promise<ProgressiveExcerptCompletionResult[]> {
    return this.repairBatch({
      records,
      limit: options.limit ?? 5,
    });
  }

  async complete(record: ExcerptRecord): Promise<ProgressiveExcerptCompletionResult> {
    const excerptEntityId = normalizeString(record.excerptEntityId);
    try {
      if (!excerptEntityId) {
        throw new Error('摘录实体 ID 为空');
      }

      if (this.deps.blockExists && !(await this.deps.blockExists(excerptEntityId))) {
        throw new Error('摘录实体不存在');
      }

      const existing = this.deps.cardService.getCardByBlockId(excerptEntityId);
      const existingCardId = getCardId(existing);
      if (existingCardId) {
        await this.deps.excerptRecordService.markCompletionCompleted(record.recordId, existingCardId);
        return {
          status: 'completed',
          recordId: record.recordId,
          topicCardId: existingCardId,
          created: false,
        };
      }

      const result = await this.deps.cardService.createCard({
        blockIds: [excerptEntityId],
        cardType: 'topic',
        extractedFrom: record.sourceBlockId,
        progressiveLineage: buildProgressiveLineage(record),
        metadata: {
          source: 'manual',
          isDocument: record.excerptEntityType === 'doc',
        },
      });
      if (isErr(result)) {
        throw result.error;
      }

      const created = this.deps.cardService.getCardByBlockId(excerptEntityId);
      const topicCardId = getCardId(created);
      if (!topicCardId) {
        throw new Error('Excerpt topic card created but could not be reloaded from storage');
      }

      await this.deps.excerptRecordService.markCompletionCompleted(record.recordId, topicCardId);
      return {
        status: 'completed',
        recordId: record.recordId,
        topicCardId,
        created: true,
      };
    } catch (error) {
      const message = errorToMessage(error);
      await this.deps.excerptRecordService.markCompletionFailed(record.recordId, error, this.deps.now?.() ?? Date.now());
      logger.warn('Excerpt completion failed', {
        recordId: record.recordId,
        excerptEntityId,
        error: message,
      });
      return {
        status: 'failed',
        recordId: record.recordId,
        error: message,
      };
    }
  }

  private async listIncompleteRecords(): Promise<ExcerptRecord[]> {
    const records = await this.deps.excerptRecordService.list({
      statuses: ['active', 'stale'],
    });
    return records.filter((record) => record.completionStatus !== 'completed');
  }

  private orderRecordsForRepair(records: ExcerptRecord[]): ExcerptRecord[] {
    const pending: ExcerptRecord[] = [];
    const failed: ExcerptRecord[] = [];

    for (const record of records) {
      if (record.completionStatus === 'failed') {
        failed.push(record);
        continue;
      }
      if (record.completionStatus === 'pending') {
        pending.push(record);
      }
    }

    const byNewestCreatedAt = (left: ExcerptRecord, right: ExcerptRecord) => right.createdAt - left.createdAt;
    const byNewestFailure = (left: ExcerptRecord, right: ExcerptRecord) => {
      const leftOccurredAt = left.completionError?.occurredAt ?? left.createdAt;
      const rightOccurredAt = right.completionError?.occurredAt ?? right.createdAt;
      if (rightOccurredAt !== leftOccurredAt) {
        return rightOccurredAt - leftOccurredAt;
      }
      return right.createdAt - left.createdAt;
    };

    return [
      ...pending.sort(byNewestCreatedAt),
      ...failed.sort(byNewestFailure),
    ];
  }
}
