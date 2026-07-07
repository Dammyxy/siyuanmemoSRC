/**
 * ReviewSyncManager
 *
 * Legacy Xiuyuan idle-sync observer for browser/Riff refresh policy.
 *
 * This is not the Review Ledger/Card Schedule durability authority. Review
 * close/exit persistence is owned by the SRS backend Review truth flush path.
 * Keep this module out of Review close commit semantics.
 */

import type { XiuyuanSyncService } from '@/application/services/XiuyuanSyncService';
import type { IDataSourceObserver, DataChangeEvent } from '@/types/unified-data-source';
import type { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewSyncManager');

class ReviewSyncDomainEvent<TPayload extends object> extends DomainEvent {
  constructor(
    private readonly name: string,
    private readonly payload: TPayload,
  ) {
    super('review-sync');
  }

  getEventName(): string {
    return this.name;
  }

  override toJSON(): Record<string, unknown> {
    return this.payload as Record<string, unknown>;
  }
}

export interface ReviewSyncManagerConfig {
  /** Auto-sync threshold by card count. Default: 10 */
  autoSyncCardInterval?: number;
  /** Auto-sync threshold by elapsed time in ms. Default: 5 minutes */
  autoSyncTimeInterval?: number;
  /** Show completion message when review finishes. Default: true */
  showCompletionMessage?: boolean;
  /** Publish auto-sync failures. Default: false */
  showAutoSyncErrors?: boolean;
}

export class ReviewSyncManager implements IDataSourceObserver {
  private reviewCount = 0;
  private lastSyncTime = Date.now();
  private isSyncing = false;

  private config: Required<ReviewSyncManagerConfig>;
  private unifiedDataSourceManager?: UnifiedDataSourceManager;

  constructor(
    private xiuyuanSyncService: XiuyuanSyncService,
    private eventBus: EventBus,
    config?: ReviewSyncManagerConfig
  ) {
    this.config = {
      autoSyncCardInterval: config?.autoSyncCardInterval ?? 10,
      autoSyncTimeInterval: config?.autoSyncTimeInterval ?? 5 * 60 * 1000,
      showCompletionMessage: config?.showCompletionMessage ?? true,
      showAutoSyncErrors: config?.showAutoSyncErrors ?? false,
    };

    logger.info('Initialized with config:', this.config);
  }

  /** Set UnifiedDataSourceManager for legacy UI refresh notification. */
  setUnifiedDataSourceManager(manager: UnifiedDataSourceManager): void {
    this.unifiedDataSourceManager = manager;
  }

  /** Observer callback for data changes. */
  onDataChanged(event: DataChangeEvent): void {
    if (event.type !== 'card-updated') {
      return;
    }

    const cardCount = event.cardIds?.length ?? 0;
    this.reviewCount += cardCount;

    logger.info('Data changed:', {
      type: event.type,
      cardCount,
      totalReviewed: this.reviewCount,
    });

    void this.checkAndAutoSync();
  }

  private async checkAndAutoSync(): Promise<void> {
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;

    const shouldSyncByCount = this.reviewCount >= this.config.autoSyncCardInterval;
    const shouldSyncByTime = timeSinceLastSync > this.config.autoSyncTimeInterval;

    if (shouldSyncByCount || shouldSyncByTime) {
      logger.info('Auto-sync triggered:', {
        reviewCount: this.reviewCount,
        timeSinceLastSync: `${Math.round(timeSinceLastSync / 1000)}s`,
        reason: shouldSyncByCount ? 'card-count' : 'time-interval',
      });

      await this.autoSync();
    }
  }

  /** Legacy passive sync when a review queue is completed. */
  async onReviewCompleted(): Promise<void> {
    if (this.isSyncing) {
      logger.info('Already syncing, skipping onReviewCompleted');
      return;
    }

    this.isSyncing = true;

    try {
      logger.info('Review completed, syncing...', {
        totalReviewed: this.reviewCount,
      });

      await this.xiuyuanSyncService.incrementalSync(undefined, {
        source: 'review-completed',
        persistIdleCheckpoint: false,
      });
      logger.info('Data synced');

      this.publishEvent('review.completed', {
        reviewCount: this.reviewCount,
        showMessage: this.config.showCompletionMessage,
        timestamp: Date.now(),
      });

      this.reset();
      logger.info('Review completion sync finished');
    } catch (err) {
      const error = this.toError(err);
      logger.error('Review completion sync failed:', error);

      this.publishEvent('review.sync.failed', {
        error,
        context: 'completion',
        timestamp: Date.now(),
      });
    } finally {
      this.isSyncing = false;
    }
  }

  /** Legacy passive Xiuyuan sync hook; not used by Review close persistence. */
  async onDialogClose(): Promise<void> {
    if (this.isSyncing) {
      logger.info('Already syncing, skipping onDialogClose');
      return;
    }

    if (this.reviewCount === 0) {
      logger.info('No cards reviewed, skipping dialog-close sync');
      return;
    }

    this.isSyncing = true;

    try {
      logger.info('Dialog closing, syncing...', {
        totalReviewed: this.reviewCount,
      });

      await this.xiuyuanSyncService.incrementalSync(undefined, {
        source: 'review-dialog-close',
        persistIdleCheckpoint: true,
      });
      logger.info('Data synced');

      if (this.unifiedDataSourceManager) {
        this.unifiedDataSourceManager.notifyObservers({
          type: 'mode-switched',
          timestamp: Date.now(),
        });
        logger.info('Notified observers to refresh UI');
      }

      this.reset();
      logger.info('Dialog close sync finished');
    } catch (err) {
      logger.error('Dialog close sync failed:', this.toError(err));
    } finally {
      this.isSyncing = false;
    }
  }

  /** Auto-sync during active review process. */
  private async autoSync(): Promise<void> {
    if (this.isSyncing) {
      logger.info('Already syncing, skipping auto-sync');
      return;
    }

    this.isSyncing = true;

    try {
      logger.info('Auto-syncing...');
      await this.xiuyuanSyncService.incrementalSync(undefined, {
        source: 'review-auto',
        persistIdleCheckpoint: false,
      });
      this.lastSyncTime = Date.now();
      logger.info('Auto-sync finished');
    } catch (err) {
      const error = this.toError(err);
      logger.error('Auto-sync failed:', error);

      if (this.config.showAutoSyncErrors) {
        this.publishEvent('review.sync.failed', {
          error,
          context: 'auto',
          timestamp: Date.now(),
        });
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private publishEvent<TPayload extends object>(eventName: string, eventData: TPayload): void {
    const domainEvent = new ReviewSyncDomainEvent(eventName, eventData);
    this.eventBus.publish(domainEvent).catch(error => {
      logger.error(`Failed to publish event ${eventName}:`, error);
    });
  }

  private reset(): void {
    this.reviewCount = 0;
    this.lastSyncTime = Date.now();
    logger.info('Counters reset');
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}
