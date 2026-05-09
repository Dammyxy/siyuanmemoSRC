import type { ITransactionHandler, Transaction } from '@/core/infrastructure/websocket/TransactionWebSocketService';
import {
  classifyTransactionBatch,
  shouldDispatchDocTreeReviewScope,
  type TransactionClassification,
} from '@/core/infrastructure/websocket/transaction-classifier';
import type { StorageManager } from '@/core/storage';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import type { BrowserDeckReadPort } from '@/application/ports/BrowserDeckReadPort';

const logger = createLogger('DocTreeReviewScopeService');

interface DocTreeRow extends Record<string, unknown> {
  id?: string;
  box?: string;
  path?: string;
}

interface BlockRootRow extends Record<string, unknown> {
  id?: string;
  root_id?: string;
}

interface DocLocation {
  box: string;
  path: string;
}

interface TransactionOperationLike {
  id?: string;
  parentID?: string;
  previousID?: string;
  nextID?: string;
  data?: unknown;
}

interface TransactionOperationRecordData {
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
}

export interface DocReviewScope {
  cards: FSRSCard[];
  docIds: string[];
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export class DocTreeReviewScopeService implements ITransactionHandler {
  private ready = false;
  private hydratePromise: Promise<void> | null = null;
  private rebuildTimer: NodeJS.Timeout | null = null;
  private docLocations = new Map<string, DocLocation>();
  private blockRootIds = new Map<string, string>();
  private readonly rebuildDebounceMs = 250;

  constructor(
    private readonly siyuanApi: ManagerSiyuanPort,
    _storage: StorageManager,
    private readonly cardProjectionReadPort: Pick<
      BrowserDeckReadPort,
      'getDeckCardsByIds' | 'queryCardIdsByRootIds' | 'queryRootlessCardBlockIds'
    > | null = null,
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  hasDoc(docId: string): boolean {
    return this.docLocations.has(String(docId || '').trim());
  }

  registerCardRootId(blockId: string, rootId: string): void {
    const normalizedBlockId = asString(blockId);
    const normalizedRootId = asString(rootId);
    if (!normalizedBlockId || !normalizedRootId) {
      return;
    }

    this.blockRootIds.set(normalizedBlockId, normalizedRootId);
  }

  async hydrate(): Promise<void> {
    if (this.hydratePromise) {
      return this.hydratePromise;
    }

    this.hydratePromise = this.rebuildIndex()
      .catch((error) => {
        logger.error('[DocTreeReviewScopeService] Failed to hydrate doc tree scope index:', error);
      })
      .finally(() => {
        this.hydratePromise = null;
      });

    return this.hydratePromise;
  }

  scheduleRebuild(): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }

    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      void this.hydrate();
    }, this.rebuildDebounceMs);
  }

  collectDocReviewScope(docId: string): DocReviewScope | null {
    const normalizedDocId = String(docId || '').trim();
    if (!normalizedDocId) {
      return {
        cards: [],
        docIds: [],
      };
    }

    if (!this.ready) {
      void this.hydrate();
      return null;
    }

    const docIds = this.getRecursiveDocIds(normalizedDocId);
    if (!docIds) {
      this.scheduleRebuild();
      return null;
    }

    return {
      cards: this.collectCardsFromDocIds(docIds),
      docIds: Array.from(docIds),
    };
  }

  getTransactionConsumerId(): string {
    return 'doc-tree-review-scope';
  }

  shouldHandleTransactionBatch(classification: TransactionClassification): boolean {
    return shouldDispatchDocTreeReviewScope(classification)
      || classification.documentTree.touchedBlockIds.some((blockId) => this.docLocations.has(blockId));
  }

  handle(transactions: Transaction[], classification: TransactionClassification = classifyTransactionBatch(transactions)): void {
    if (this.shouldHandleTransactionBatch(classification) || this.shouldRefreshForTransactions(transactions)) {
      this.scheduleRebuild();
    }
  }

  dispose(): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    this.hydratePromise = null;
    this.ready = false;
    this.docLocations.clear();
    this.blockRootIds.clear();
  }

  private async rebuildIndex(): Promise<void> {
    const rows = await this.siyuanApi.sql<DocTreeRow>(`
      SELECT id, box, path
      FROM blocks
      WHERE type = 'd'
    `);

    const nextLocations = new Map<string, DocLocation>();
    for (const row of rows) {
      const id = asString(row.id);
      const box = asString(row.box);
      const path = asString(row.path);
      if (!id || !box || !path) {
        continue;
      }
      nextLocations.set(id, { box, path });
    }

    this.docLocations = nextLocations;
    this.blockRootIds = await this.queryCardRootIds();
    this.ready = true;
  }

  private getRecursiveDocIds(docId: string): Set<string> | null {
    const current = this.docLocations.get(docId);
    if (!current) {
      return null;
    }

    const docIds = new Set<string>([docId]);
    const childPathPrefix = this.getChildPathPrefix(current.path);
    for (const [candidateId, location] of this.docLocations.entries()) {
      if (location.box !== current.box) {
        continue;
      }
      if (candidateId === docId) {
        docIds.add(candidateId);
        continue;
      }
      if (location.path.startsWith(childPathPrefix)) {
        docIds.add(candidateId);
      }
    }
    return docIds;
  }

  private getChildPathPrefix(path: string): string {
    const normalizedPath = String(path || '').trim();
    if (normalizedPath.endsWith('.sy')) {
      return `${normalizedPath.slice(0, -3)}/`;
    }

    return normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;
  }

  private collectCardsFromDocIds(docIds: Set<string>): FSRSCard[] {
    if (docIds.size === 0) {
      return [];
    }

    if (!this.cardProjectionReadPort?.queryCardIdsByRootIds || !this.cardProjectionReadPort.getDeckCardsByIds) {
      throw new Error('DOC_TREE_SCOPE_UNAVAILABLE: projection read port unavailable');
    }

    try {
      const matchedIds = this.cardProjectionReadPort.queryCardIdsByRootIds(Array.from(docIds), {
        excludeKnownMissing: true,
      });
      const rootlessBlockIds = Array.from(this.blockRootIds.entries())
        .filter(([, rootId]) => docIds.has(rootId))
        .map(([blockId]) => blockId);
      return this.cardProjectionReadPort.getDeckCardsByIds([...matchedIds, ...rootlessBlockIds]);
    } catch (error) {
      logger.error('DOC_TREE_SCOPE_UNAVAILABLE: projection scope query failed', { error });
      throw new Error('DOC_TREE_SCOPE_UNAVAILABLE: projection scope query failed');
    }
  }

  private async queryCardRootIds(): Promise<Map<string, string>> {
    if (!this.cardProjectionReadPort?.queryRootlessCardBlockIds) {
      throw new Error('DOC_TREE_SCOPE_UNAVAILABLE: rootless card query port unavailable');
    }

    let blockIds: string[];
    try {
      blockIds = this.cardProjectionReadPort.queryRootlessCardBlockIds();
    } catch (error) {
      logger.error('DOC_TREE_SCOPE_UNAVAILABLE: rootless card query failed', { error });
      throw new Error('DOC_TREE_SCOPE_UNAVAILABLE: rootless card query failed');
    }

    const result = new Map<string, string>();
    if (blockIds.length === 0) {
      return result;
    }

    const chunkSize = 200;
    for (let index = 0; index < blockIds.length; index += chunkSize) {
      const chunk = blockIds.slice(index, index + chunkSize);
      const inClause = chunk.map((blockId) => `'${this.escapeSql(blockId)}'`).join(',');
      const rows = await this.siyuanApi.sql<BlockRootRow>(`
        SELECT id, root_id
        FROM blocks
        WHERE id IN (${inClause})
      `);

      for (const row of rows) {
        const id = asString(row.id);
        const rootId = asString(row.root_id);
        if (id && rootId) {
          result.set(id, rootId);
        }
      }
    }

    return result;
  }

  private shouldRefreshForTransactions(transactions: Transaction[]): boolean {
    for (const tx of transactions) {
      const operations = Array.isArray(tx.doOperations) ? tx.doOperations : [];
      for (const operation of operations) {
        if (this.operationTouchesDocumentTree(operation as TransactionOperationLike)) {
          return true;
        }
      }
    }
    return false;
  }

  private operationTouchesDocumentTree(operation: TransactionOperationLike): boolean {
    const data = this.asRecordData(operation.data);
    if (this.isDocumentType(data?.new) || this.isDocumentType(data?.old)) {
      return true;
    }

    return [
      operation.id,
      operation.parentID,
      operation.previousID,
      operation.nextID,
    ].some((value) => {
      const normalized = asString(value);
      return normalized ? this.docLocations.has(normalized) : false;
    });
  }

  private isDocumentType(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    return asString((value as Record<string, unknown>).type) === 'd';
  }

  private asRecordData(value: unknown): TransactionOperationRecordData | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    return value as TransactionOperationRecordData;
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
