/**
 * ReviewSyncManager
 *
 * Tracks review completion notifications and local Browser refresh signals.
 * Native Riff synchronization is intentionally absent from Review lifecycle.
 */

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
  /** Show completion message when review finishes. Default: true */
  showCompletionMessage?: boolean;
}

export class ReviewSyncManager implements IDataSourceObserver {
  private reviewCount = 0;
  private readonly showCompletionMessage: boolean;
  private unifiedDataSourceManager?: UnifiedDataSourceManager;

  constructor(
    private readonly eventBus: EventBus,
    config?: ReviewSyncManagerConfig,
  ) {
    this.showCompletionMessage = config?.showCompletionMessage ?? true;
  }

  setUnifiedDataSourceManager(manager: UnifiedDataSourceManager): void {
    this.unifiedDataSourceManager = manager;
  }

  onDataChanged(event: DataChangeEvent): void {
    if (event.type !== 'card-updated') {
      return;
    }

    this.reviewCount += event.cardIds?.length ?? 0;
  }

  async onReviewCompleted(): Promise<void> {
    this.publishEvent('review.completed', {
      reviewCount: this.reviewCount,
      showMessage: this.showCompletionMessage,
      timestamp: Date.now(),
    });
    this.reset();
  }

  async onDialogClose(): Promise<void> {
    if (this.reviewCount === 0) {
      return;
    }

    this.unifiedDataSourceManager?.notifyObservers({
      type: 'mode-switched',
      timestamp: Date.now(),
    });
    this.reset();
  }

  private publishEvent<TPayload extends object>(eventName: string, eventData: TPayload): void {
    const domainEvent = new ReviewSyncDomainEvent(eventName, eventData);
    this.eventBus.publish(domainEvent).catch(error => {
      logger.error(`Failed to publish event ${eventName}:`, error);
    });
  }

  private reset(): void {
    this.reviewCount = 0;
  }
}
