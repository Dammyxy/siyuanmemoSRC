import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import type { SchedulerRouter } from '@/core/scheduler';
import type { FSRSCard, Rating } from '@/types';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewApplicationService');

type ScheduledCardMembershipSyncQueue = {
  syncManualMembershipForScheduledCard: (card: FSRSCard) => Promise<boolean> | boolean;
};

function hasScheduledCardMembershipSyncQueue(
  value: unknown,
): value is ScheduledCardMembershipSyncQueue {
  return typeof (value as ScheduledCardMembershipSyncQueue | null)?.syncManualMembershipForScheduledCard === 'function';
}

export interface RescheduleOptions {
  mode: 'rating' | 'direct';
  rating?: Rating;
  dueTimestamp: number;
  scheduledDays?: number;
}

function withManualScheduleFields(card: FSRSCard, options: RescheduleOptions): FSRSCard {
  const scheduledDays = Number(options.scheduledDays);
  return {
    ...card,
    due: options.dueTimestamp,
    updatedAt: Date.now(),
    ...(Number.isFinite(scheduledDays) && scheduledDays >= 0 ? { scheduledDays } : {}),
  };
}

export class ReviewApplicationService {
  constructor(
    private readonly manager: IUnifiedDataSourceManagerFacade,
    private readonly schedulerRouter: SchedulerRouter,
    private readonly siyuanApi: ReviewSiyuanPort,
  ) {}

  async rescheduleCard(cardId: string, options: RescheduleOptions): Promise<FSRSCard> {
    const card = await this.manager.getCard(cardId);

    let updatedCard: FSRSCard;
    if (options.mode === 'rating' && options.rating) {
      updatedCard = withManualScheduleFields(await this.schedulerRouter.route(card, options.rating), options);

      logger.info('Schedule with rating', {
        cardId,
        rating: options.rating,
        dueTimestamp: options.dueTimestamp,
        scheduledDays: options.scheduledDays,
      });
    } else {
      updatedCard = withManualScheduleFields(card, options);

      logger.info('Schedule direct', {
        cardId,
        dueTimestamp: options.dueTimestamp,
        scheduledDays: options.scheduledDays,
      });
    }

    await this.manager.updateCard(updatedCard);
    await this.reconcileQueueMembershipAfterReschedule(updatedCard);
    return updatedCard;
  }

  async rescheduleCards(cardIds: string[], options: RescheduleOptions): Promise<FSRSCard[]> {
    const updatedCards: FSRSCard[] = [];

    for (const cardId of cardIds) {
      try {
        const updatedCard = await this.rescheduleCard(cardId, options);
        updatedCards.push(updatedCard);
      } catch (error) {
        logger.error(`Failed to reschedule card ${cardId}`, error);
      }
    }

    return updatedCards;
  }

  getSiyuanApi(): ReviewSiyuanPort {
    return this.siyuanApi;
  }

  async getBlockKramdown(blockId: string): Promise<string> {
    const { kramdown } = await this.siyuanApi.getBlockKramdown(blockId);
    return kramdown;
  }

  async updateBlockMarkdown(blockId: string, markdown: string): Promise<string> {
    return this.siyuanApi.updateBlockMarkdown(blockId, markdown);
  }

  private async reconcileQueueMembershipAfterReschedule(card: FSRSCard): Promise<void> {
    const targetQueues: QueueType[] = [
      QueueType.RetrievalPractice,
      QueueType.IncrementalLearning,
    ];

    for (const queueType of targetQueues) {
      try {
        const queue = this.manager.getQueue(queueType);
        if (!hasScheduledCardMembershipSyncQueue(queue)) {
          continue;
        }

        await Promise.resolve(queue.syncManualMembershipForScheduledCard(card));
      } catch (error) {
        logger.warn('Failed to reconcile queue membership after reschedule', {
          cardId: card.id,
          queueType,
          error,
        });
      }
    }
  }
}
