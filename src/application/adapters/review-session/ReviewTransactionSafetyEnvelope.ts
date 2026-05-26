import { QueueItemUnavailableError, type QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { FSRSCard } from '@/types/card';
import { QueueType, type IReviewQueue } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import type { ReviewSessionCursor } from './ReviewSessionCursor';

const logger = createLogger('ReviewTransactionSafetyEnvelope');

type QueueRollbackCapable = IReviewQueue & {
  createRollbackSnapshot?: () => Promise<unknown>;
  restoreRollbackSnapshot?: (snapshot: unknown) => Promise<void>;
};

export interface ReviewQueueSnapshotRecord {
  queueType: QueueType;
  queue: QueueRollbackCapable;
  snapshot: unknown;
}

export interface ReviewTransaction {
  action: QueueFeedback['action'];
  cardId: string;
  cardBefore: FSRSCard | null;
  queueSnapshots: ReviewQueueSnapshotRecord[];
  sessionExcludedCardIdsBefore: string[];
  sessionExcludedLogicalKeysBefore: string[];
}

export interface ReviewTransactionSafetyEnvelopeManager {
  getCard: (cardId: string, options?: { silent?: boolean }) => Promise<FSRSCard | null>;
  getCards: (query: { blockIds: string[] }) => Promise<FSRSCard[]>;
  getQueue: (queueType: QueueType) => IReviewQueue;
  updateCard: (card: FSRSCard) => Promise<void>;
  restoreCardSnapshotForFailedFeedback?: (card: FSRSCard) => Promise<void>;
}

export interface ReviewTransactionSafetyEnvelopeDependencies {
  queueType: QueueType;
  queue: IReviewQueue;
  manager: ReviewTransactionSafetyEnvelopeManager;
  cursor: ReviewSessionCursor;
  getCurrentItem: () => FSRSCard | null;
  invalidateCache: () => void;
  refreshRestoredItem: (item: FSRSCard) => Promise<FSRSCard>;
}

export class ReviewTransactionSafetyEnvelope {
  constructor(private readonly deps: ReviewTransactionSafetyEnvelopeDependencies) {}

  async capture(
    currentItem: FSRSCard,
    feedback: QueueFeedback,
    options: { includeCardSnapshot?: boolean } = {},
  ): Promise<ReviewTransaction> {
    const includeCardSnapshot = options.includeCardSnapshot !== false;
    const cardBefore = includeCardSnapshot
      ? await this.resolvePreReviewCardSnapshotOrThrow(currentItem)
      : null;
    const queueSnapshots = await this.captureQueueSnapshots(feedback);
    const cursorSnapshot = this.deps.cursor.serialize(this.deps.queueType, this.deps.getCurrentItem());

    return {
      action: feedback.action,
      cardId: currentItem.id,
      cardBefore,
      queueSnapshots,
      sessionExcludedCardIdsBefore: cursorSnapshot.sessionExcludedCardIds ?? [],
      sessionExcludedLogicalKeysBefore: cursorSnapshot.sessionExcludedLogicalKeys ?? [],
    };
  }

  async rollback(transaction: ReviewTransaction): Promise<void> {
    await this.restore(transaction, { persistCardRestore: true });
    this.deps.cursor.counterSnapshot = null;
    this.deps.invalidateCache();
  }

  async compensateFailedFeedback(activeItem: FSRSCard, transaction: ReviewTransaction | null): Promise<FSRSCard> {
    const restoredItem = transaction?.cardBefore || activeItem;
    try {
      if (transaction) {
        await this.restore(transaction, { persistCardRestore: false });
      }
    } catch (rollbackError) {
      logger.warn('[SiYuanMemo][ReviewTransactionSafetyEnvelope] Failed to compensate failed feedback:', {
        queueType: this.deps.queueType,
        cardId: activeItem.id,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }

    const restoredClone = cloneCard(restoredItem);
    return this.deps.refreshRestoredItem(restoredClone)
      .catch(() => restoredClone);
  }

  private async restore(
    transaction: ReviewTransaction,
    options: { persistCardRestore: boolean },
  ): Promise<void> {
    for (const record of transaction.queueSnapshots) {
      if (typeof record.queue.restoreRollbackSnapshot !== 'function') {
        continue;
      }
      await record.queue.restoreRollbackSnapshot(record.snapshot);
    }

    if (transaction.cardBefore) {
      const cardSnapshot = cloneCard(transaction.cardBefore);
      if (options.persistCardRestore) {
        await this.deps.manager.updateCard(cardSnapshot);
      } else if (typeof this.deps.manager.restoreCardSnapshotForFailedFeedback === 'function') {
        await this.deps.manager.restoreCardSnapshotForFailedFeedback(cardSnapshot);
      } else {
        logger.warn('[SiYuanMemo][ReviewTransactionSafetyEnvelope] No no-persist card restore port for failed feedback:', {
          queueType: this.deps.queueType,
          cardId: transaction.cardId,
        });
      }
    }

    this.deps.cursor.restoreSessionExcludedCardIds(
      transaction.sessionExcludedCardIdsBefore,
      transaction.sessionExcludedLogicalKeysBefore,
    );
  }

  private async resolvePreReviewCardSnapshotOrThrow(currentItem: FSRSCard): Promise<FSRSCard | null> {
    if (this.deps.queueType === QueueType.NeuralRoam) {
      return null;
    }

    try {
      const cardBefore = await this.resolvePreReviewCardSnapshot(currentItem);
      if (!cardBefore) {
        logger.warn('[SiYuanMemo][ReviewTransactionSafetyEnvelope] Unable to resolve pre-review card snapshot:', {
          queueType: this.deps.queueType,
          cardId: currentItem.id,
          blockId: currentItem.blockId,
        });
        throw new QueueItemUnavailableError(
          `Pre-review card snapshot missing for current queue item: ${currentItem.id}`,
          {
            cardId: currentItem.id,
            blockId: currentItem.blockId,
            queueType: this.deps.queueType,
          },
        );
      }
      return cardBefore;
    } catch (error) {
      if (error instanceof QueueItemUnavailableError
        || (isRecord(error) && error.name === 'QueueItemUnavailableError')
        || this.isUnavailableCurrentItemError(error, currentItem)) {
        throw new QueueItemUnavailableError(
          `Queue item is no longer available: ${currentItem.id}`,
          {
            cardId: currentItem.id,
            blockId: currentItem.blockId,
            queueType: this.deps.queueType,
          },
          error,
        );
      }
      logger.error('[SiYuanMemo][ReviewTransactionSafetyEnvelope] QUEUE_REVIEW_SNAPSHOT_UNAVAILABLE: failed to capture pre-review card snapshot:', {
        queueType: this.deps.queueType,
        cardId: currentItem.id,
        error: error instanceof Error ? error.message : String(error),
      });
      const unavailable = new Error(`QUEUE_REVIEW_SNAPSHOT_UNAVAILABLE: ${this.deps.queueType} pre-review card snapshot unavailable`);
      (unavailable as Error & { cause?: unknown }).cause = error;
      throw unavailable;
    }
  }

  private async resolvePreReviewCardSnapshot(currentItem: FSRSCard): Promise<FSRSCard | null> {
    const byCardId = await this.deps.manager.getCard(currentItem.id, { silent: true });
    if (byCardId) {
      return cloneCard(byCardId);
    }

    const blockId = String(currentItem.blockId || currentItem.id || '').trim();
    if (!blockId) {
      return null;
    }

    const byBlockId = await this.deps.manager.getCards({ blockIds: [blockId] });
    if (byBlockId.length > 0) {
      return cloneCard(byBlockId[0]);
    }

    return null;
  }

  private async captureQueueSnapshots(feedback: QueueFeedback): Promise<ReviewQueueSnapshotRecord[]> {
    const targets = new Map<QueueType, QueueRollbackCapable>();
    this.addSnapshotTarget(targets, this.deps.queueType, this.deps.queue as QueueRollbackCapable);

    if (this.shouldSnapshotFinalDrill(feedback)) {
      this.addSnapshotTarget(
        targets,
        QueueType.FinalDrill,
        this.deps.manager.getQueue(QueueType.FinalDrill) as QueueRollbackCapable,
      );
    }

    const records: ReviewQueueSnapshotRecord[] = [];
    for (const [queueType, queue] of targets.entries()) {
      if (typeof queue.createRollbackSnapshot !== 'function') {
        continue;
      }
      const snapshot = await queue.createRollbackSnapshot();
      records.push({ queueType, queue, snapshot });
    }
    return records;
  }

  private addSnapshotTarget(
    targets: Map<QueueType, QueueRollbackCapable>,
    queueType: QueueType,
    queue: QueueRollbackCapable,
  ): void {
    if (!targets.has(queueType)) {
      targets.set(queueType, queue);
    }
  }

  private shouldSnapshotFinalDrill(feedback: QueueFeedback): boolean {
    if (feedback.action !== 'rate') {
      return false;
    }

    const rating = feedback.rating ?? 0;
    if (rating >= 3) {
      return false;
    }

    return this.deps.queueType === QueueType.RetrievalPractice
      || this.deps.queueType === QueueType.IncrementalLearning
      || this.deps.queueType === QueueType.FilterGroup;
  }

  private isUnavailableCurrentItemError(error: unknown, currentItem: FSRSCard): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.toLowerCase();
    const hasMissingItemSignal = normalizedMessage.includes('card not found')
      || normalizedMessage.includes('block not found')
      || normalizedMessage.includes('review.feedback card not found')
      || message.includes('获取卡片失败')
      || message.includes('获取块失败')
      || message.includes('卡片不存在');
    if (hasMissingItemSignal) {
      const identities = collectCardIdentities(currentItem);
      for (const identity of identities) {
        if (message.includes(identity)) {
          return true;
        }
      }
    }

    if (!isRecord(error)) {
      return false;
    }
    const cardId = typeof error.cardId === 'string' ? error.cardId : undefined;
    return cardId === currentItem.id;
  }
}

function cloneCard(card: FSRSCard): FSRSCard {
  const cloned = JSON.parse(JSON.stringify(card)) as FSRSCard & { nextDues?: unknown };
  delete cloned.nextDues;
  return cloned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function collectCardIdentities(card: Pick<FSRSCard, 'id' | 'blockId'>): Set<string> {
  return new Set(
    [card.id, card.blockId]
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  );
}
