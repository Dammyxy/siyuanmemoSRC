import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import {
  CdfLiveRelationRefreshService,
  CdfLiveRelationSqlSourceLoader,
  type CdfLiveRelationRefreshResult,
} from '@/application/services/CdfLiveRelationRefreshService';
import {
  CdfLiveRelationWriteRepairService,
  type CdfLiveRelationCardCreatorPort,
  type CdfLiveRelationWriteRepairOptions,
  type CdfLiveRelationWriteRepairResult,
} from '@/application/services/CdfLiveRelationWriteRepairService';
import type { FollowerCommandClient } from '@/application/clients/FollowerCommandClient';
import type { FrontendInstanceRuntime } from '@/application/clients/FrontendInstanceRuntime';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';
import type { SchedulerRouter } from '@/core/scheduler';
import type { FSRSCard, Rating } from '@/types';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import type {
  BackendReviewRiffFeedbackExecuteRequest,
  BackendReviewRiffFeedbackExecuteResult,
  BackendReviewSourceRefreshExecuteRequest,
  BackendReviewSourceRefreshExecuteResult,
  BackendUnavailableClass,
} from '../../../packages/contracts/src/backend-rpc';

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
  private readonly cdfLiveRelationRefresh: CdfLiveRelationRefreshService;
  private readonly cdfLiveRelationWriteRepair: CdfLiveRelationWriteRepairService | null;

  constructor(
    private readonly manager: IUnifiedDataSourceManagerFacade,
    private readonly schedulerRouter: SchedulerRouter,
    private readonly siyuanApi: ReviewSiyuanPort,
    private readonly backendClient: Pick<SrsBackendClient, 'executeReviewRiffFeedback' | 'executeReviewSourceRefresh'> | null = null,
    private readonly frontendInstanceRuntime: Pick<FrontendInstanceRuntime, 'getMode' | 'getInstanceId'> | null = null,
    private readonly followerCommandClient: Pick<FollowerCommandClient, 'submitAndWait'> | null = null,
    cdfLiveRelationCardCreator: CdfLiveRelationCardCreatorPort | null = null,
  ) {
    this.cdfLiveRelationRefresh = new CdfLiveRelationRefreshService({
      manager,
      source: siyuanApi,
    });
    this.cdfLiveRelationWriteRepair = cdfLiveRelationCardCreator
      ? new CdfLiveRelationWriteRepairService({
        manager,
        cardCreator: cdfLiveRelationCardCreator,
        sourceLoader: new CdfLiveRelationSqlSourceLoader(siyuanApi),
      })
      : null;
  }

  async rescheduleCard(cardId: string, options: RescheduleOptions): Promise<FSRSCard> {
    const card = await this.manager.getCard(cardId);

    let updatedCard: FSRSCard;
    if (options.mode === 'rating' && options.rating) {
      const decision = this.schedulerRouter.answer(card, options.rating);
      const commitResult = await this.schedulerRouter.commit(decision);
      const reviewedCard = commitResult.updatedCard ?? decision.current;
      updatedCard = withManualScheduleFields(reviewedCard, options);

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

    await this.manager.updateCard(updatedCard, {
      preferIncomingScheduling: true,
      schedulingWriteSource: 'manual-reschedule',
    });
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

  async getEditableBlockMarkdown(blockId: string): Promise<string> {
    return this.siyuanApi.getEditableBlockMarkdown(blockId);
  }

  async updateBlockMarkdown(blockId: string, markdown: string): Promise<string> {
    return this.siyuanApi.updateBlockMarkdown(blockId, markdown);
  }

  async refreshCdfLiveRelationOnOpen(card: FSRSCard | string): Promise<CdfLiveRelationRefreshResult> {
    return this.cdfLiveRelationRefresh.refreshCurrentCardOnOpen(card, {
      surface: 'review-open',
    });
  }

  async reconcileCdfLiveRelationsInWriteRepairFlow(
    options: CdfLiveRelationWriteRepairOptions,
  ): Promise<CdfLiveRelationWriteRepairResult> {
    if (!this.cdfLiveRelationWriteRepair) {
      throw new Error('CDF_LIVE_RELATION_CREATE_UNAVAILABLE: Review CDF write/repair creator is unavailable');
    }
    return this.cdfLiveRelationWriteRepair.reconcileWriteOrRepair(options);
  }

  async executeFinalDrillRiffFeedback(
    request: BackendReviewRiffFeedbackExecuteRequest,
  ): Promise<BackendReviewRiffFeedbackExecuteResult> {
    return this.executeReviewBackendCommand(
      'review.riffFeedback.execute',
      request,
      (client, params) => client.executeReviewRiffFeedback(params),
      () => this.createReviewRiffFeedbackUnavailable(request, 'review.riffFeedback.execute backend authority unavailable'),
    );
  }

  async executeReviewSourceRefresh(
    request: BackendReviewSourceRefreshExecuteRequest,
  ): Promise<BackendReviewSourceRefreshExecuteResult> {
    return this.executeReviewBackendCommand(
      'review.sourceRefresh.execute',
      request,
      (client, params) => client.executeReviewSourceRefresh(params),
      () => this.createReviewSourceRefreshUnavailable(request, 'review.sourceRefresh.execute backend authority unavailable'),
    );
  }

  private async executeReviewBackendCommand<TRequest, TResult>(
    method: 'review.riffFeedback.execute' | 'review.sourceRefresh.execute',
    request: TRequest,
    execute: (
      client: Pick<SrsBackendClient, 'executeReviewRiffFeedback' | 'executeReviewSourceRefresh'>,
      request: TRequest,
    ) => Promise<TResult>,
    unavailable: () => TResult,
  ): Promise<TResult> {
    const runtime = this.frontendInstanceRuntime;
    if (runtime?.getMode() === 'follower' && this.followerCommandClient) {
      return this.followerCommandClient.submitAndWait<TResult>({
        instanceId: runtime.getInstanceId(),
        method,
        params: request,
      });
    }
    if (!this.backendClient) {
      return unavailable();
    }
    return execute(this.backendClient, request);
  }

  private createReviewRiffFeedbackUnavailable(
    request: BackendReviewRiffFeedbackExecuteRequest,
    reason: string,
    unavailableClass: BackendUnavailableClass = 'BACKEND_UNAVAILABLE',
  ): BackendReviewRiffFeedbackExecuteResult {
    const now = Date.now();
    return {
      status: 'unavailable',
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      action: request.action,
      updated: 0,
      skipped: 0,
      unavailableClass,
      reason,
      queueImpact: {
        refreshRequired: false,
        projectionChanged: false,
        removedFromQueue: false,
      },
      diagnostics: {
        diagnosticEventId: `review-riff-feedback:${request.commandId}:${now}`,
        family: 'review.riff-feedback',
        commandId: request.commandId,
        timing: {
          submittedAt: now,
          deadlineAt: request.deadlineAt ?? null,
          completedAt: now,
        },
        errorCategory: unavailableClass,
      },
    };
  }

  private createReviewSourceRefreshUnavailable(
    request: BackendReviewSourceRefreshExecuteRequest,
    reason: string,
    unavailableClass: BackendUnavailableClass = 'BACKEND_UNAVAILABLE',
  ): BackendReviewSourceRefreshExecuteResult {
    const now = Date.now();
    return {
      status: 'unavailable',
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      matchedBlockIds: [],
      unavailableClass,
      reason,
      impact: {
        refreshVisibleContent: false,
        cleanupMissingSource: false,
      },
      diagnostics: {
        diagnosticEventId: `review-source-refresh:${request.commandId}:${now}`,
        family: 'review.source-refresh',
        commandId: request.commandId,
        timing: {
          submittedAt: now,
          deadlineAt: request.deadlineAt ?? null,
          completedAt: now,
        },
        errorCategory: unavailableClass,
      },
    };
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
