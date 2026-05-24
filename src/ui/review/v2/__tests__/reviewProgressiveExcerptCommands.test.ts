// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProgressiveExcerptFromReviewSelection,
  routeProgressiveExcerptIntoCurrentReview,
} from '../reviewProgressiveExcerptCommands';
import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { FSRSCard } from '@/types/card';
import type { CardFilter, NeuralRoamSessionQueue } from '@/types/unified-data-source';

const highlightMocks = vi.hoisted(() => ({
  prepareProgressiveExcerptHighlight: vi.fn(),
  applyProgressiveExcerptHighlight: vi.fn(),
}));

vi.mock('@/application/entries/ProgressiveExcerptHighlight', () => ({
  prepareProgressiveExcerptHighlight: highlightMocks.prepareProgressiveExcerptHighlight,
  applyProgressiveExcerptHighlight: highlightMocks.applyProgressiveExcerptHighlight,
}));

const t = (_key: string, fallback: string) => fallback;

function topicCard(meta: Record<string, unknown> = {}): FSRSCard {
  return {
    id: 'card-topic-1',
    xiuyuanID: 'xiuyuan-1',
    blockId: 'topic-root-1',
    due: Date.now(),
    stability: 1,
    difficulty: 1,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 10,
    type: 'topic',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta,
  } as unknown as FSRSCard;
}

function createNeuralQueue(overrides: {
  engineMode?: 'orbit' | 'hyperspace';
  injectResult?: boolean;
} = {}): NeuralRoamSessionQueue {
  const engineMode = overrides.engineMode ?? 'hyperspace';
  return {
    getEngineMode: vi.fn(() => engineMode),
    getNavigationState: vi.fn(() => ({
      engineMode,
      engineSessionId: 'engine-session-1',
      navigationMode: 'follow',
      currentPathIndex: 0,
      pathLength: 3,
      hasBookmark: true,
      currentNodeId: 'topic-root-1',
      currentEventId: 'event-1',
      sessionId: 'session-1',
    })),
    injectExcerptIntoHyperspace: vi.fn(async () => overrides.injectResult ?? true),
  } as unknown as NeuralRoamSessionQueue;
}

function createSelection(): ProgressiveExcerptSelectionSnapshot {
  const range = document.createRange();
  return {
    blockId: 'source-block-1',
    sourceBlockId: 'source-block-1',
    sourceBlockIds: ['source-block-1'],
    text: 'Selected excerpt text',
    contentDom: '<div data-node-id="source-block-1">Selected excerpt text</div>',
    range,
    blockSelections: [{
      blockId: 'source-block-1',
      mode: 'range',
      excerptHtml: '<div data-node-id="source-block-1">Selected excerpt text</div>',
      range: range.cloneRange(),
    }],
    commonElement: document.body,
    root: document.body,
    protyle: null,
  };
}

function createSelectionService(result: Awaited<ReturnType<Parameters<typeof createProgressiveExcerptFromReviewSelection>[0]['selectionService']['createFromSelection']>>) {
  return {
    materializeExcerptSource: vi.fn(async (selection: ProgressiveExcerptSelectionSnapshot) => ({
      sourceBlockId: selection.sourceBlockId,
      sourceBlockIds: selection.sourceBlockIds,
      contentDom: selection.contentDom,
      highlightSnapshot: selection,
      reused: false,
    })),
    createFromSelection: vi.fn(async () => result),
    updateSourceBlockDom: vi.fn(async () => undefined),
  };
}

describe('reviewProgressiveExcerptCommands', () => {
  beforeEach(() => {
    highlightMocks.prepareProgressiveExcerptHighlight.mockReset();
    highlightMocks.prepareProgressiveExcerptHighlight.mockReturnValue({
      blockId: 'source-block-1',
      blockIds: ['source-block-1'],
      previousBlockHtml: '<div data-node-id="source-block-1">Selected excerpt text</div>',
      nextBlockHtml: '<div data-node-id="source-block-1"><span data-type="text">Selected excerpt text</span></div>',
      blockMutations: [],
      root: document.body,
      protyle: null,
      alreadyApplied: false,
    });
    highlightMocks.applyProgressiveExcerptHighlight.mockReset();
    highlightMocks.applyProgressiveExcerptHighlight.mockResolvedValue(true);
  });

  it('routes new excerpts into the current progressive piece before hyperspace', async () => {
    const filter: CardFilter = { blockIds: ['piece-doc-1'] };
    const filterQueue = {
      getFilter: vi.fn(() => filter),
    };
    const filterCommandClient = {
      setFilterGroupFilter: vi.fn(async () => true),
    };
    const queueStrategy = {
      insertAt: vi.fn(async () => undefined),
    };
    const neuralQueue = createNeuralQueue();
    const setAppliedReviewFilter = vi.fn();

    const routed = await routeProgressiveExcerptIntoCurrentReview({
      excerptEntityId: 'excerpt-doc-1',
      currentCard: topicCard({ progressive: { kind: 'piece' } }),
      filterQueue,
      filterCommandClient,
      queueStrategy,
      setAppliedReviewFilter,
      neuralQueue,
      logger: {},
    });

    expect(routed).toBe('progressive');
    expect(filterCommandClient.setFilterGroupFilter).toHaveBeenCalledWith({
      blockIds: ['piece-doc-1', 'excerpt-doc-1'],
    });
    expect(setAppliedReviewFilter).toHaveBeenCalledWith({
      blockIds: ['piece-doc-1', 'excerpt-doc-1'],
    });
    expect(queueStrategy.insertAt).toHaveBeenCalledWith('excerpt-doc-1', 1);
    expect(neuralQueue.injectExcerptIntoHyperspace).not.toHaveBeenCalled();
  });

  it('falls back to hyperspace injection with current navigation context', async () => {
    const neuralQueue = createNeuralQueue();

    const routed = await routeProgressiveExcerptIntoCurrentReview({
      excerptEntityId: 'excerpt-doc-1',
      currentCard: topicCard(),
      filterQueue: null,
      filterCommandClient: null,
      queueStrategy: null,
      setAppliedReviewFilter: vi.fn(),
      neuralQueue,
      logger: {},
    });

    expect(routed).toBe('hyperspace');
    expect(neuralQueue.injectExcerptIntoHyperspace).toHaveBeenCalledWith('excerpt-doc-1', {
      currentNodeId: 'topic-root-1',
      currentEventId: 'event-1',
    });
  });

  it('creates review excerpts, applies prepared highlight, then shows routed success', async () => {
    const createdResult = {
      kind: 'created' as const,
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc' as const,
      topicCardId: 'topic-card-1',
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      containerDocId: 'daily-note-1',
      recordId: 'record-1',
      colorApplied: false,
    };
    const selectionService = createSelectionService(createdResult);
    const routeExcerpt = vi.fn(async () => 'hyperspace' as const);
    const showMessage = vi.fn();

    await createProgressiveExcerptFromReviewSelection({
      selection: createSelection(),
      trigger: 'toolbar',
      selectionService,
      tabApplicationService: null,
      currentCardId: 'card-topic-1',
      routeExcerpt,
      t,
      showMessage,
      logger: {},
    });

    expect(selectionService.createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      selectedText: 'Selected excerpt text',
      contentDom: '<div data-node-id="source-block-1">Selected excerpt text</div>',
      origin: 'review',
      currentCardId: 'card-topic-1',
    });
    expect(highlightMocks.prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(highlightMocks.applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(createdResult.colorApplied).toBe(true);
    expect(routeExcerpt).toHaveBeenCalledWith('excerpt-doc-1');
    expect(showMessage).toHaveBeenLastCalledWith('已创建 Topic，并并入当前超空间神经漫游', 3000, 'info');
  });

  it('shows degraded preservation feedback only when likely inline references have no content DOM', async () => {
    const createdResult = {
      kind: 'created' as const,
      excerptEntityId: 'excerpt-doc-1',
      excerptEntityType: 'doc' as const,
      topicCardId: 'topic-card-1',
      sourceBlockId: 'source-block-1',
      sourceBlockIds: ['source-block-1'],
      containerDocId: 'daily-note-1',
      recordId: 'record-1',
      colorApplied: false,
    };
    const selection = createSelection();
    selection.text = 'See [link](https://example.com)';
    selection.contentDom = '';
    const selectionService = createSelectionService(createdResult);
    const routeExcerpt = vi.fn(async () => null);
    const showMessage = vi.fn();
    const logger = { warn: vi.fn() };

    await createProgressiveExcerptFromReviewSelection({
      selection,
      trigger: 'toolbar',
      selectionService,
      tabApplicationService: null,
      currentCardId: 'card-topic-1',
      routeExcerpt,
      t,
      showMessage,
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('without DOM preservation evidence'),
      expect.objectContaining({ sourceBlockId: 'source-block-1' }),
    );
    expect(showMessage).toHaveBeenCalledWith('已创建 Topic，但原文链接或块引用可能未完整保留', 5000, 'info');
    expect(showMessage).toHaveBeenLastCalledWith('已创建 Topic', 3000, 'info');
  });

  it('opens duplicate excerpts without routing them again', async () => {
    const duplicateResult = {
      kind: 'duplicate' as const,
      record: {
        recordId: 'record-1',
        excerptEntityId: 'excerpt-doc-1',
        excerptEntityType: 'doc' as const,
        sourceDocId: 'source-doc-1',
        sourceBlockId: 'source-block-1',
        sourceBlockIds: ['source-block-1'],
        selectedText: 'Selected excerpt text',
        normalizedFingerprint: 'selected excerpt text',
        colorToken: 'var(--b3-font-background4)',
        origin: 'review' as const,
        createdAt: Date.now(),
        status: 'active' as const,
      },
    };
    const selectionService = createSelectionService(duplicateResult);
    const tabApplicationService = {
      openDocumentTab: vi.fn(async () => undefined),
      openBlockTab: vi.fn(async () => undefined),
    };
    const routeExcerpt = vi.fn(async () => 'hyperspace' as const);
    const showMessage = vi.fn();

    await createProgressiveExcerptFromReviewSelection({
      selection: createSelection(),
      trigger: 'toolbar',
      selectionService,
      tabApplicationService,
      currentCardId: 'card-topic-1',
      routeExcerpt,
      t,
      showMessage,
      logger: {},
    });

    expect(highlightMocks.applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(tabApplicationService.openDocumentTab).toHaveBeenCalledWith({ docId: 'excerpt-doc-1' });
    expect(tabApplicationService.openBlockTab).not.toHaveBeenCalled();
    expect(routeExcerpt).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenLastCalledWith('这段原文已摘录过，已跳到现有摘录', 3000, 'info');
  });
});
