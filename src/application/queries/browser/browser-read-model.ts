import type { BrowserActionTarget } from '@/application/interfaces/ICardDataSource';
import type { BrowserDocumentCountsResult, BrowserDocumentCountsScope, BrowserDeckFullUniverseReason, BrowserDeckPageRequest, BrowserDeckSnapshotQuery } from './browser-deck-query';
import type { QueueBrowserSnapshotQuery } from './queue-browser-query';
import type { BrowserCard } from '@/types/browser';
import { resolveBrowserCardStableId } from '@/types/browser';
import type { BrowserQueueId } from '@/types/browser-queue-identity';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import type { QueueProjectionReadPath, QueueProjectionRolloutState, QueueType } from '@/types/unified-data-source';

export type BrowserReadOwnerKind =
  | 'sql-card-universe'
  | 'queue-projection'
  | 'block-id-intersection'
  | 'explicit-local-queue';

export type BrowserReadOwnerMetadata = {
  kind: BrowserReadOwnerKind;
  queueId?: BrowserQueueId;
  queueType?: QueueType;
  projectionBacked?: boolean;
  readPath?: QueueProjectionReadPath | 'local-queue';
  state?: QueueProjectionRolloutState | 'local-queue';
  reason?: string | null;
  unavailableReason?: string | null;
};

export type BrowserReadModelDiagnostic = {
  kind: 'unsupported-query' | 'owner-unavailable' | 'missing-row' | 'refresh-required';
  message: string;
  rowIds?: string[];
};

export type BrowserReadModelSnapshotMetadata = {
  readOwner: BrowserReadOwnerMetadata;
  queryFingerprint: string;
  generation: number | null;
  diagnostics?: BrowserReadModelDiagnostic[];
};

export type BrowserReadModelReadState =
  | 'ready'
  | 'preparing'
  | 'repair-required'
  | 'unavailable';

export type BrowserReadModelQuery =
  | {
      source: 'deck';
      query: BrowserDeckSnapshotQuery;
    }
  | {
      source: 'queue';
      query: QueueBrowserSnapshotQuery;
    }
  | {
      source: 'advanced-sql';
      statement: string;
      query?: Omit<BrowserDeckSnapshotQuery, 'searchText'>;
    };

export type BrowserReadModelRowsByIdsQuery =
  | {
      source: 'deck';
    }
  | {
      source: 'queue';
      queueId: BrowserQueueId;
    };

export type BrowserReadModelMatchedIdsOptions = {
  reason?: BrowserDeckFullUniverseReason;
};

export type BrowserReadModelActionTargetsByIdsOptions =
  & BrowserReadModelRowsByIdsQuery
  & {
      reason?: BrowserDeckFullUniverseReason;
    };

export type BrowserReadModelReadyPageResponse =
  & BrowserReadModelSnapshotMetadata
  & {
      status: 'ready';
      rows: BrowserCard[];
      total: number;
    };

export type BrowserReadModelUnavailablePageResponse =
  & BrowserReadModelSnapshotMetadata
  & {
      status: Exclude<BrowserReadModelReadState, 'ready'>;
      rows: [];
      total: 0;
      reason: string;
    };

export type BrowserReadModelPageResponse =
  | BrowserReadModelReadyPageResponse
  | BrowserReadModelUnavailablePageResponse;

export interface BrowserReadModel {
  page(query: BrowserReadModelQuery, range: BrowserDeckPageRequest): Promise<BrowserReadModelPageResponse>;
  matchedIds(query: BrowserReadModelQuery, options?: BrowserReadModelMatchedIdsOptions): Promise<string[]>;
  rowsByIds(ids: string[], query?: BrowserReadModelRowsByIdsQuery): Promise<BrowserCard[]>;
  actionTargetsByIds(
    ids: string[],
    options: BrowserReadModelActionTargetsByIdsOptions,
  ): Promise<BrowserActionTarget[]>;
  documentCounts(scope: BrowserDocumentCountsScope): Promise<BrowserDocumentCountsResult>;
}

export type BrowserReadModelActionSource = {
  id?: unknown;
  blockId?: unknown;
  fsrsCardId?: unknown;
  cardType?: BrowserCard['cardType'];
  priority?: unknown;
};

export function normalizeBrowserReadModelRowId(
  source: BrowserReadModelActionSource | null | undefined,
): string {
  return resolveBrowserCardStableId(source as Pick<BrowserCard, 'id' | 'blockId' | 'fsrsCardId'>);
}

export function toBrowserReadModelActionTarget(
  source: BrowserReadModelActionSource,
): BrowserActionTarget {
  const fsrsCardId = String(source.fsrsCardId || '').trim();
  return {
    id: String(source.id || fsrsCardId || source.blockId || '').trim(),
    blockId: String(source.blockId || '').trim(),
    fsrsCardId: fsrsCardId || undefined,
    cardType: source.cardType,
    priority: typeof source.priority === 'number' ? source.priority : undefined,
  };
}

export function toBrowserReadModelLiteIdentity(
  source: BrowserReadModelActionSource,
): { id: string; blockId: string; fsrsCardId?: string; actionTarget: BrowserActionTarget } {
  const id = normalizeBrowserReadModelRowId(source);
  const fsrsCardId = String(source.fsrsCardId || '').trim();
  return {
    id,
    blockId: String(source.blockId || '').trim(),
    fsrsCardId: fsrsCardId || undefined,
    actionTarget: toBrowserReadModelActionTarget(source),
  };
}

export function toQueueSnapshotReadModelSource(row: QueueSnapshotRow): BrowserReadModelActionSource {
  return {
    id: row.id,
    blockId: row.blockId,
    fsrsCardId: row.fsrsCardId,
    cardType: row.cardType as BrowserCard['cardType'],
    priority: row.priority,
  };
}

export function toBrowserCardReadModelSource(row: BrowserCard): BrowserReadModelActionSource {
  return {
    id: row.id,
    blockId: row.blockId,
    fsrsCardId: row.fsrsCardId,
    cardType: row.cardType,
    priority: row.priority,
  };
}
