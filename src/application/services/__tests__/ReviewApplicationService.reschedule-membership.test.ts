import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import { CardState, CardType, type FSRSCard, type Rating } from '@/types/card';
import { QueueType, type IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { ReviewApplicationService } from '../ReviewApplicationService';

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now,
    stability: 2,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    state: CardState.Review,
    lastReview: now - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now - 1000,
    updatedAt: now - 500,
    ...overrides,
  };
}

function createReviewSiyuanApi(overrides: Partial<ReviewSiyuanPort> = {}): ReviewSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'builtin',
    sql: vi.fn(async () => []),
    getBlockAttrs: vi.fn(async () => ({})),
    setBlockAttrs: vi.fn(async () => {}),
    getBlockInfo: vi.fn(async () => ({})),
    getEditableBlockMarkdown: vi.fn(async () => ''),
    getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
    getBlockDOM: vi.fn(async () => ({ dom: '' })),
    getBlockBreadcrumb: vi.fn(async () => []),
    getIconByType: vi.fn(() => ''),
    updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
    reviewRiffCard: vi.fn(async () => {}),
    skipReviewRiffCard: vi.fn(async () => {}),
    pushMsg: vi.fn(async () => {}),
    pushErrMsg: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('ReviewApplicationService reschedule queue membership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T10:00:00+08:00'));
  });

  it('removes manually inserted cards from both due queues when rescheduled to a future day', async () => {
    const card = createCard();
    const retrievalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => true),
    };
    const incrementalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => true),
    };
    const manager = {
      getCard: vi.fn(async () => card),
      updateCard: vi.fn(async () => {}),
      getQueue: vi.fn((queueType: QueueType) => {
        if (queueType === QueueType.RetrievalPractice) {
          return retrievalQueue;
        }
        if (queueType === QueueType.IncrementalLearning) {
          return incrementalQueue;
        }
        throw new Error(`Unexpected queue type: ${queueType}`);
      }),
    } as unknown as IUnifiedDataSourceManagerFacade;

    const schedulerRouter = {
      route: vi.fn(async (_card: FSRSCard, _rating: Rating) => card),
    } as never;
    const service = new ReviewApplicationService(manager, schedulerRouter, createReviewSiyuanApi());
    const dueTimestamp = new Date('2026-03-14T12:00:00+08:00').getTime();

    const updated = await service.rescheduleCard(card.id, {
      mode: 'direct',
      dueTimestamp,
    });

    expect(updated.due).toBe(dueTimestamp);
    expect(manager.updateCard).toHaveBeenCalledWith(expect.objectContaining({ due: dueTimestamp }), expect.objectContaining({
      preferIncomingScheduling: true,
      schedulingWriteSource: 'manual-reschedule',
    }));
    expect(retrievalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id, due: dueTimestamp }),
    );
    expect(incrementalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: card.id, due: dueTimestamp }),
    );
  });

  it('keeps retrieval membership intact for cards still due later today, but removes incremental membership', async () => {
    const card = createCard();
    const retrievalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => false),
    };
    const incrementalQueue = {
      syncManualMembershipForScheduledCard: vi.fn(async () => true),
    };
    const manager = {
      getCard: vi.fn(async () => card),
      updateCard: vi.fn(async () => {}),
      getQueue: vi.fn((queueType: QueueType) => {
        if (queueType === QueueType.RetrievalPractice) {
          return retrievalQueue;
        }
        if (queueType === QueueType.IncrementalLearning) {
          return incrementalQueue;
        }
        throw new Error(`Unexpected queue type: ${queueType}`);
      }),
    } as unknown as IUnifiedDataSourceManagerFacade;

    const schedulerRouter = {
      route: vi.fn(async (_card: FSRSCard, _rating: Rating) => card),
    } as never;
    const service = new ReviewApplicationService(manager, schedulerRouter, createReviewSiyuanApi());
    const dueTimestamp = new Date('2026-03-07T23:00:00+08:00').getTime();

    await service.rescheduleCard(card.id, {
      mode: 'direct',
      dueTimestamp,
    });

    expect(retrievalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ due: dueTimestamp }),
    );
    expect(incrementalQueue.syncManualMembershipForScheduledCard).toHaveBeenCalledWith(
      expect.objectContaining({ due: dueTimestamp }),
    );
  });

  it('stores manually supplied scheduledDays during direct reschedule', async () => {
    const card = createCard({ scheduledDays: 1 });
    const manager = {
      getCard: vi.fn(async () => card),
      updateCard: vi.fn(async () => {}),
      getQueue: vi.fn(() => ({
        syncManualMembershipForScheduledCard: vi.fn(async () => true),
      })),
    } as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {
      route: vi.fn(async (_card: FSRSCard, _rating: Rating) => card),
    } as never;
    const service = new ReviewApplicationService(manager, schedulerRouter, createReviewSiyuanApi());
    const dueTimestamp = new Date('2026-03-11T10:00:00+08:00').getTime();

    const updated = await service.rescheduleCard(card.id, {
      mode: 'direct',
      dueTimestamp,
      scheduledDays: 4.3,
    });

    expect(updated).toMatchObject({
      id: card.id,
      due: dueTimestamp,
      scheduledDays: 4.3,
    });
    expect(manager.updateCard).toHaveBeenCalledWith(expect.objectContaining({
      due: dueTimestamp,
      scheduledDays: 4.3,
    }), expect.objectContaining({
      preferIncomingScheduling: true,
      schedulingWriteSource: 'manual-reschedule',
    }));
  });

  it('loads raw block markdown through the review siyuan port', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const siyuanApi = createReviewSiyuanApi({
      getBlockKramdown: vi.fn(async () => ({ kramdown: 'Original body' })),
      updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
    });
    const service = new ReviewApplicationService(manager, schedulerRouter, siyuanApi);

    await expect(service.getBlockKramdown('block-1')).resolves.toBe('Original body');
    expect(siyuanApi.getBlockKramdown).toHaveBeenCalledWith('block-1');
  });

  it('loads editable block markdown through the review siyuan port without reading kramdown', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const siyuanApi = createReviewSiyuanApi({
      getEditableBlockMarkdown: vi.fn(async () => 'Original body'),
      getBlockKramdown: vi.fn(async () => ({ kramdown: 'Original body\n{: id="block-1"}' })),
      updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
    });
    const service = new ReviewApplicationService(manager, schedulerRouter, siyuanApi);

    await expect(service.getEditableBlockMarkdown('block-1')).resolves.toBe('Original body');
    expect(siyuanApi.getEditableBlockMarkdown).toHaveBeenCalledWith('block-1');
    expect(siyuanApi.getBlockKramdown).not.toHaveBeenCalled();
  });

  it('updates raw block markdown through the review siyuan port', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const siyuanApi = createReviewSiyuanApi({
      getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
      updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
    });
    const service = new ReviewApplicationService(manager, schedulerRouter, siyuanApi);

    await expect(service.updateBlockMarkdown('block-1', 'Updated body')).resolves.toBe('block-1');
    expect(siyuanApi.updateBlockMarkdown).toHaveBeenCalledWith('block-1', 'Updated body');
  });

  it('resolves a concept-reference target document block through the review siyuan port', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const blockId = '20260703030303-cdefghi';
    const sql = vi.fn(async () => [{
      id: blockId,
      type: 'd',
      content: 'Target concept document',
      markdown: '',
      hpath: '/Target concept document',
    }]);
    const siyuanApi = createReviewSiyuanApi({ sql });
    const service = new ReviewApplicationService(manager, schedulerRouter, siyuanApi);

    await expect(service.resolveConceptReferenceTarget(blockId)).resolves.toEqual({
      id: blockId,
      type: 'd',
      title: 'Target concept document',
    });
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0]?.[0]).toContain(`WHERE id = '${blockId}'`);
  });

  it('returns non-document target type so the binding editor can reject it', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const blockId = '20260703040404-ddddddd';
    const siyuanApi = createReviewSiyuanApi({
      sql: vi.fn(async () => [{
        id: blockId,
        type: 'p',
        content: 'Paragraph target',
        markdown: '',
        hpath: '',
      }]),
    });
    const service = new ReviewApplicationService(manager, schedulerRouter, siyuanApi);

    await expect(service.resolveConceptReferenceTarget(blockId)).resolves.toEqual({
      id: blockId,
      type: 'p',
      title: 'Paragraph target',
    });
  });

  it('does not query blocks for invalid concept-reference target ids', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const siyuanApi = createReviewSiyuanApi();
    const service = new ReviewApplicationService(manager, schedulerRouter, siyuanApi);

    await expect(service.resolveConceptReferenceTarget('not-a-block-id')).resolves.toBeNull();
    expect(siyuanApi.sql).not.toHaveBeenCalled();
  });

  it('returns null when concept-reference target block is missing', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const siyuanApi = createReviewSiyuanApi({
      sql: vi.fn(async () => []),
    });
    const service = new ReviewApplicationService(manager, schedulerRouter, siyuanApi);

    await expect(service.resolveConceptReferenceTarget('20260703050505-eeeeeee')).resolves.toBeNull();
    expect(siyuanApi.sql).toHaveBeenCalledTimes(1);
  });

  it('returns CDF live relation evidence on Review open without persisting metadata repair', async () => {
    const conceptId = '20260101000000-aaaaaaa';
    const sourceId = '20260101000001-bbbbbbb';
    const card = createCard({
      id: 'cdf-review-card',
      blockId: sourceId,
      type: CardType.Descriptor,
      meta: {
        relationAuthority: 'live-backlink',
        templateID: 'builtin-concept-definition-forward',
        typeMarker: 'concept-definition-forward',
        sourceBlockId: sourceId,
        fieldMapping: {
          concept: conceptId,
          definition: sourceId,
        },
      },
    });
    const manager = {
      getCard: vi.fn(async (cardId: string) => {
        if (cardId !== card.id) {
          throw new Error(`missing ${cardId}`);
        }
        return card;
      }),
      getCards: vi.fn(async () => [card]),
      updateCard: vi.fn(async () => {}),
    } as unknown as IUnifiedDataSourceManagerFacade;
    const siyuanApi = createReviewSiyuanApi({
      sql: vi.fn(async (statement: string) => {
        const row = {
          id: sourceId,
          parent_id: '',
          root_id: sourceId,
          type: 'p',
          markdown: `((${conceptId} "Concept")) :> definition body`,
          sort: '0',
        };
        return statement.includes('LIMIT 1') ? [row] : [row];
      }),
    });
    const service = new ReviewApplicationService(manager, {} as never, siyuanApi);

    const result = await service.refreshCdfLiveRelationOnOpen(card.id);

    expect(result.reason).toBe('refreshed');
    expect(result.updatedCard).toMatchObject({
      id: card.id,
      meta: expect.objectContaining({
        liveRelationKey: `${sourceId}:${conceptId}:definition-forward`,
        liveRelationStatus: 'active-live',
      }),
    });
    expect(manager.updateCard).not.toHaveBeenCalled();
  });

  it('routes explicit native Riff review feedback through the backend bridge', async () => {
    const manager = {} as unknown as IUnifiedDataSourceManagerFacade;
    const schedulerRouter = {} as never;
    const siyuanApi = createReviewSiyuanApi();
    const backendClient = {
      executeReviewRiffFeedback: vi.fn(async (request) => ({
        status: 'completed' as const,
        commandId: request.commandId,
        idempotencyKey: request.idempotencyKey,
        action: request.action,
        updated: 1,
        skipped: 0,
        queueImpact: {
          refreshRequired: true,
          projectionChanged: true,
          removedFromQueue: true,
        },
        diagnostics: {
          diagnosticEventId: 'diag-native-riff-feedback',
          family: 'review.riff-feedback',
          commandId: request.commandId,
        },
      })),
      executeReviewSourceRefresh: vi.fn(),
    };
    const service = new ReviewApplicationService(
      manager,
      schedulerRouter,
      siyuanApi,
      backendClient,
    );

    const result = await service.executeFinalDrillRiffFeedback({
      commandId: 'cmd-native-riff-rate',
      idempotencyKey: 'key-native-riff-rate',
      sessionId: 'final-drill',
      action: 'rate',
      deckId: 'deck-1',
      riffCardId: 'riff-card-1',
      rating: 4,
    });

    expect(result).toMatchObject({
      status: 'completed',
      action: 'rate',
      updated: 1,
    });
    expect(backendClient.executeReviewRiffFeedback).toHaveBeenCalledWith({
      commandId: 'cmd-native-riff-rate',
      idempotencyKey: 'key-native-riff-rate',
      sessionId: 'final-drill',
      action: 'rate',
      deckId: 'deck-1',
      riffCardId: 'riff-card-1',
      rating: 4,
    });
    expect(siyuanApi.reviewRiffCard).not.toHaveBeenCalled();
    expect(siyuanApi.skipReviewRiffCard).not.toHaveBeenCalled();
  });
});
