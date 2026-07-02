import { describe, expect, it, vi } from 'vitest';
import { NeuralRoamEntryActionService } from '../NeuralRoamEntryActionService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { ok } from '@/types/result';
import { QueueType } from '@/types/unified-data-source';
import type {
  BackendNeuralRoamCommandRequest,
  BackendNeuralRoamCommandResult,
} from '../../../../packages/contracts/src/backend-rpc';

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: Date.now(),
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createService(options: {
  storedCard?: FSRSCard | null;
  queue?: Record<string, unknown>;
  openNeuralRoamDialog?: ReturnType<typeof vi.fn>;
  createConceptCard?: ReturnType<typeof vi.fn>;
  updateFSRSCard?: ReturnType<typeof vi.fn>;
  resolveBlockTitle?: ReturnType<typeof vi.fn>;
  promptTemporaryRouteClose?: ReturnType<typeof vi.fn>;
  dataSourceManager?: Record<string, unknown>;
} = {}) {
  const storedCard = 'storedCard' in options
    ? options.storedCard ?? null
    : card({ type: CardType.Concept });
  const queue = 'queue' in options ? options.queue : {
    addCard: vi.fn(async () => undefined),
    setAnchorEntry: vi.fn(async () => undefined),
    getEngineMode: vi.fn(() => 'hyperspace'),
    setEngineMode: vi.fn(async () => undefined),
    listRoutes: vi.fn(async () => [{ id: 'route-previous', isActive: true }]),
    resolveTemporaryRouteCloseAction: vi.fn(async () => ({ kind: 'none' })),
    createTemporaryRoute: vi.fn(async () => ({ metadata: { id: 'route-temp' } })),
  };
  const openNeuralRoamDialog = options.openNeuralRoamDialog ?? vi.fn(async () => undefined);
  const createConceptCard = options.createConceptCard ?? vi.fn(async () => ok({}));
  const updateFSRSCard = options.updateFSRSCard ?? vi.fn(async () => ok({}));
  const getCardByBlockId = vi.fn(() => storedCard);
  const getQueue = vi.fn(() => queue);
  const neuralRoamCommand = createNeuralRoamCommandRunner(queue);
  const addRiffCards = vi.fn(async () => ({ name: 'deck', size: 1 }));

  return {
    service: new NeuralRoamEntryActionService({
      storage: { getCardByBlockId } as any,
      cardCreationHelper: { createConceptCard } as any,
      cardService: { updateFSRSCard } as any,
      dataSourceManager: (options.dataSourceManager ?? { getQueue, neuralRoamCommand }) as any,
      openNeuralRoamDialog,
      resolveBlockTitle: options.resolveBlockTitle,
      promptTemporaryRouteClose: options.promptTemporaryRouteClose,
    }),
    queue,
    openNeuralRoamDialog,
    createConceptCard,
    updateFSRSCard,
    getCardByBlockId,
    getQueue,
    neuralRoamCommand,
    addRiffCards,
  };
}

function createNeuralRoamCommandRunner(queue: Record<string, unknown> | null | undefined) {
  return vi.fn(async (
    request: BackendNeuralRoamCommandRequest,
  ): Promise<BackendNeuralRoamCommandResult | null> => {
    if (!queue) {
      return null;
    }
    const command = request.command;
    if (command.type === 'set-anchor') {
      await (queue.setAnchorEntry as ((nodeId: string, enabled: boolean) => Promise<void>) | undefined)?.(
        command.nodeId,
        command.enabled !== false,
      );
    } else if (command.type === 'switch-engine-mode') {
      await (queue.setEngineMode as ((mode: string, options: { carryCurrentNode: boolean }) => Promise<void>) | undefined)?.(
        command.mode,
        { carryCurrentNode: command.carryCurrentNode !== false },
      );
    } else if (command.type === 'create-temporary-route') {
      await (queue.createTemporaryRoute as ((input: {
        name?: string | null;
        seedBlockId: string;
        previousRouteId?: string | null;
      }) => Promise<unknown>) | undefined)?.({
        name: command.name,
        seedBlockId: command.seedBlockId,
        previousRouteId: command.previousRouteId ?? null,
      });
    } else if (command.type === 'replace-active-temporary-route') {
      await (queue.replaceActiveTemporaryRoute as ((input: {
        name?: string | null;
        seedBlockId: string;
      }) => Promise<unknown>) | undefined)?.({
        name: command.name,
        seedBlockId: command.seedBlockId,
      });
    } else if (command.type === 'close-temporary-route') {
      await (queue.closeTemporaryRoute as ((input: {
        action: 'save' | 'discard' | 'cancel';
        routeId?: string | null;
        name?: string | null;
      }) => Promise<unknown>) | undefined)?.({
        action: command.action,
        routeId: command.routeId ?? null,
        name: command.name ?? null,
      });
    }
    return {
      queueType: 'neural-roam',
      status: 'ok',
      viewState: null as never,
      queueState: { version: 8 },
      unavailableReason: null,
      message: null,
    };
  });
}

describe('NeuralRoamEntryActionService', () => {
  it('adds an existing concept card to the NeuralRoam current route through backend command authority', async () => {
    const existingConcept = card({ id: 'concept-card', blockId: 'concept-block', type: CardType.Concept });
    const { service, queue, createConceptCard } = createService({ storedCard: existingConcept });

    const result = await service.addExistingConceptToQueue('concept-block');

    expect(result).toMatchObject({
      ok: true,
      action: 'add-existing-concept-to-queue',
      blockId: 'concept-block',
      cardId: 'concept-card',
      queueChanged: true,
    });
    expect(queue.addCard).not.toHaveBeenCalled();
    expect(createConceptCard).not.toHaveBeenCalled();
  });

  it('adds a concept card and starts roam through backend command authority instead of local queue mutation', async () => {
    const concept = card({ id: 'concept-card', blockId: 'concept-block', type: CardType.Concept });
    const { service, queue, openNeuralRoamDialog, neuralRoamCommand, createConceptCard } = createService({ storedCard: concept });

    const result = await service.makeConceptAndStartRoam('concept-block');

    expect(result).toMatchObject({
      ok: true,
      action: 'make-concept-and-start-roam',
      blockId: 'concept-block',
      conceptBlockId: 'concept-block',
      openedDialog: true,
    });
    expect(queue.addCard).not.toHaveBeenCalled();
    expect(neuralRoamCommand).toHaveBeenCalledWith(expect.objectContaining({
      queueType: 'neural-roam',
      command: expect.objectContaining({
        type: 'set-sources',
        nodeIds: ['concept-block'],
      }),
    }));
    expect(createConceptCard).not.toHaveBeenCalled();
    expect(queue.setEngineMode).toHaveBeenCalledWith('orbit', { carryCurrentNode: true });
    expect(openNeuralRoamDialog).toHaveBeenCalledWith(expect.objectContaining({
      focusBlockId: 'concept-block',
      seedBlockId: 'concept-block',
      conceptBlockId: 'concept-block',
      includeFocusAsFirst: true,
      startNewSession: true,
      entrySessionKind: 'concept-card-roam',
    }));
  });

  it('returns explicit current-route failure instead of throwing when backend sync fails', async () => {
    const queue = {
      addCard: vi.fn(async () => undefined),
      syncFromBackendState: vi.fn(async () => {
        throw new Error('sync failed');
      }),
      setBackendViewState: vi.fn(),
    };
    const { service } = createService({ queue });

    const result = await service.addConceptBlocksToCurrentRoute(['concept-block'], {
      source: 'browser',
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'failed',
      blockIds: ['concept-block'],
      added: 0,
      message: '神经漫游当前航线不可用',
    });
  });

  it('keeps UnifiedDataSourceManager method context when adding concept blocks to the current route', async () => {
    const queue = {
      syncFromBackendState: vi.fn(async () => undefined),
      setBackendViewState: vi.fn(),
    };
    const dataSourceManager = {
      calls: [] as BackendNeuralRoamCommandRequest[],
      getQueue: vi.fn(() => queue),
      async neuralRoamCommand(request: BackendNeuralRoamCommandRequest): Promise<BackendNeuralRoamCommandResult> {
        this.calls.push(request);
        return {
          queueType: 'neural-roam',
          status: 'ok',
          viewState: null as never,
          queueState: { version: 8 },
          unavailableReason: null,
          message: null,
        };
      },
    };
    const { service } = createService({ dataSourceManager });

    const result = await service.addConceptBlocksToCurrentRoute(['concept-block'], {
      source: 'browser',
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'ok',
      blockIds: ['concept-block'],
      added: 1,
    });
    expect(dataSourceManager.calls).toHaveLength(1);
    expect(dataSourceManager.calls[0]?.command).toMatchObject({
      type: 'set-sources',
      nodeIds: ['concept-block'],
    });
  });

  it('establishes a station without opening NeuralRoam', async () => {
    const { service, queue, openNeuralRoamDialog } = createService();

    const result = await service.establishStation('station-block');

    expect(result).toMatchObject({
      ok: true,
      action: 'establish-station',
      blockId: 'station-block',
      queueChanged: true,
    });
    expect(queue.setAnchorEntry).toHaveBeenCalledWith('station-block', true);
    expect(openNeuralRoamDialog).not.toHaveBeenCalled();
  });

  it('forces orbit for station-and-roam without temporary restore metadata', async () => {
    const { service, queue, openNeuralRoamDialog } = createService();

    const result = await service.establishStationAndStartRoam('station-block');

    expect(result).toMatchObject({
      ok: true,
      action: 'establish-station-and-start-roam',
      blockId: 'station-block',
      openedDialog: true,
    });
    expect(queue.setAnchorEntry).toHaveBeenCalledWith('station-block', true);
    expect(queue.setEngineMode).toHaveBeenCalledWith('orbit', { carryCurrentNode: true });
    expect(openNeuralRoamDialog).toHaveBeenCalledWith(expect.objectContaining({
      focusBlockId: 'station-block',
      seedBlockId: 'station-block',
      includeFocusAsFirst: true,
      startNewSession: true,
      entrySessionKind: 'station-roam',
    }));
  });

  it('rejects entry actions without a usable block id', async () => {
    const { service, queue, openNeuralRoamDialog } = createService();

    const result = await service.startTemporaryCurrentBlockRoam({ blockId: '   ' });

    expect(result).toMatchObject({
      ok: false,
      action: 'temporary-current-block-roam',
      code: 'missing-block-id',
    });
    expect(queue.setEngineMode).not.toHaveBeenCalled();
    expect(openNeuralRoamDialog).not.toHaveBeenCalled();
  });

  it('creates a temporary route before opening current-block temporary roam', async () => {
    const resolveBlockTitle = vi.fn(async () => '当前块标题');
    const { service, queue, openNeuralRoamDialog } = createService({ resolveBlockTitle });

    const result = await service.startTemporaryCurrentBlockRoam({
      blockId: 'current-block',
      sourceReviewCardId: 'review-card',
    });

    expect(result).toMatchObject({
      ok: true,
      action: 'temporary-current-block-roam',
      blockId: 'current-block',
      cardId: 'review-card',
      openedDialog: true,
    });
    expect(queue.createTemporaryRoute).toHaveBeenCalledWith({
      name: '临时：当前块标题',
      seedBlockId: 'current-block',
      previousRouteId: 'route-previous',
    });
    expect(openNeuralRoamDialog).toHaveBeenCalledWith(expect.objectContaining({
      focusBlockId: 'current-block',
      seedBlockId: 'current-block',
      sourceReviewCardId: 'review-card',
      entrySessionKind: 'temporary-current-block',
    }));
  });

  it('uses an explicit concept seed while keeping the CDF review block as the first focus', async () => {
    const resolveBlockTitle = vi.fn(async (blockId: string) => blockId === 'concept-block' ? '概念块' : '当前块');
    const { service, queue, openNeuralRoamDialog } = createService({ resolveBlockTitle });

    const result = await service.startTemporaryCurrentBlockRoam({
      blockId: 'definition-block',
      seedBlockId: 'concept-block',
      conceptBlockId: 'concept-block',
      sourceReviewCardId: 'definition-card',
    });

    expect(result).toMatchObject({
      ok: true,
      action: 'temporary-current-block-roam',
      blockId: 'definition-block',
      cardId: 'definition-card',
      openedDialog: true,
    });
    expect(queue.createTemporaryRoute).toHaveBeenCalledWith({
      name: '临时：概念块',
      seedBlockId: 'concept-block',
      previousRouteId: 'route-previous',
    });
    expect(openNeuralRoamDialog).toHaveBeenCalledWith(expect.objectContaining({
      focusBlockId: 'definition-block',
      seedBlockId: 'concept-block',
      conceptBlockId: 'concept-block',
      sourceReviewCardId: 'definition-card',
      entrySessionKind: 'temporary-current-block',
    }));
  });

  it('stops before replacing a dirty temporary route so the caller can prompt', async () => {
    const queue = {
      addCard: vi.fn(async () => undefined),
      setAnchorEntry: vi.fn(async () => undefined),
      getEngineMode: vi.fn(() => 'orbit'),
      setEngineMode: vi.fn(async () => undefined),
      listRoutes: vi.fn(async () => [{ id: 'route-temp', isActive: true }]),
      resolveTemporaryRouteCloseAction: vi.fn(async () => ({
        kind: 'prompt',
        routeId: 'route-temp',
        previousRouteId: 'route-previous',
      })),
      createTemporaryRoute: vi.fn(async () => ({ metadata: { id: 'route-new' } })),
    };
    const { service, openNeuralRoamDialog } = createService({ queue });

    const result = await service.startTemporaryCurrentBlockRoam({ blockId: 'current-block' });

    expect(result).toMatchObject({
      ok: false,
      action: 'temporary-current-block-roam',
      code: 'temporary-route-dirty',
      blockId: 'current-block',
    });
    expect(queue.createTemporaryRoute).not.toHaveBeenCalled();
    expect(openNeuralRoamDialog).not.toHaveBeenCalled();
  });

  it('prompts before replacing a dirty temporary route and honors discard choice', async () => {
    const queue = {
      addCard: vi.fn(async () => undefined),
      setAnchorEntry: vi.fn(async () => undefined),
      getEngineMode: vi.fn(() => 'orbit'),
      setEngineMode: vi.fn(async () => undefined),
      listRoutes: vi.fn(async () => [{ id: 'route-previous', isActive: true }]),
      resolveTemporaryRouteCloseAction: vi.fn(async () => ({
        kind: 'prompt',
        routeId: 'route-temp',
        previousRouteId: 'route-previous',
      })),
      closeTemporaryRoute: vi.fn(async () => null),
      createTemporaryRoute: vi.fn(async () => ({ metadata: { id: 'route-new' } })),
    };
    const promptTemporaryRouteClose = vi.fn(async () => 'discard' as const);
    const { service, openNeuralRoamDialog } = createService({ queue, promptTemporaryRouteClose });

    const result = await service.startTemporaryCurrentBlockRoam({ blockId: 'current-block' });

    expect(result).toMatchObject({
      ok: true,
      action: 'temporary-current-block-roam',
      blockId: 'current-block',
    });
    expect(promptTemporaryRouteClose).toHaveBeenCalledWith({
      routeId: 'route-temp',
      previousRouteId: 'route-previous',
    });
    expect(queue.closeTemporaryRoute).toHaveBeenCalledWith({
      action: 'discard',
      routeId: 'route-temp',
      name: null,
    });
    expect(queue.createTemporaryRoute).toHaveBeenCalledWith({
      name: '临时：current-block',
      seedBlockId: 'current-block',
      previousRouteId: 'route-previous',
    });
    expect(openNeuralRoamDialog).toHaveBeenCalled();
  });

  it('cancels temporary route replacement when the dirty-route prompt returns cancel', async () => {
    const queue = {
      addCard: vi.fn(async () => undefined),
      setAnchorEntry: vi.fn(async () => undefined),
      getEngineMode: vi.fn(() => 'orbit'),
      setEngineMode: vi.fn(async () => undefined),
      listRoutes: vi.fn(async () => [{ id: 'route-temp', isActive: true }]),
      resolveTemporaryRouteCloseAction: vi.fn(async () => ({
        kind: 'prompt',
        routeId: 'route-temp',
        previousRouteId: 'route-previous',
      })),
      closeTemporaryRoute: vi.fn(async () => null),
      createTemporaryRoute: vi.fn(async () => ({ metadata: { id: 'route-new' } })),
    };
    const promptTemporaryRouteClose = vi.fn(async () => 'cancel' as const);
    const { service, openNeuralRoamDialog } = createService({ queue, promptTemporaryRouteClose });

    const result = await service.startTemporaryCurrentBlockRoam({ blockId: 'current-block' });

    expect(result).toMatchObject({
      ok: false,
      action: 'temporary-current-block-roam',
      code: 'temporary-route-dirty',
      blockId: 'current-block',
    });
    expect(queue.closeTemporaryRoute).not.toHaveBeenCalled();
    expect(queue.createTemporaryRoute).not.toHaveBeenCalled();
    expect(openNeuralRoamDialog).not.toHaveBeenCalled();
  });

  it('creates a concept card without adding it to the NeuralRoam queue', async () => {
    const concept = card({ id: 'concept-card', blockId: 'concept-block', type: CardType.Concept });
    const { service, queue } = createService({ storedCard: concept });

    const result = await service.makeConceptOnly('concept-block');

    expect(result).toMatchObject({
      ok: true,
      action: 'make-concept',
      blockId: 'concept-block',
      conceptBlockId: 'concept-block',
      cardId: 'concept-card',
    });
    expect(queue.addCard).not.toHaveBeenCalled();
  });

  it('creates a missing concept card without native Riff registration on the ordinary NeuralRoam entry path', async () => {
    const { service, createConceptCard, addRiffCards } = createService({ storedCard: null });

    const result = await service.makeConceptOnly('concept-block');

    expect(result).toMatchObject({
      ok: true,
      action: 'make-concept',
      blockId: 'concept-block',
    });
    expect(createConceptCard).toHaveBeenCalledWith('concept-block', {
      priority: 50,
      metadata: { source: 'manual' },
    });
    expect(addRiffCards).not.toHaveBeenCalled();
  });

  it('returns a typed failure when the NeuralRoam queue is unavailable', async () => {
    const concept = card({ id: 'concept-card', blockId: 'concept-block', type: CardType.Concept });
    const { service, openNeuralRoamDialog } = createService({
      storedCard: concept,
      queue: null as unknown as Record<string, unknown>,
    });

    const result = await service.addExistingConceptToQueue('concept-block');

    expect(result).toMatchObject({
      ok: false,
      action: 'add-existing-concept-to-queue',
      code: 'queue-unavailable',
      blockId: 'concept-block',
    });
    expect(openNeuralRoamDialog).not.toHaveBeenCalled();
  });

  it('starts temporary concept roam from the selected concept block instead of a source review card', async () => {
    const { service, queue, openNeuralRoamDialog } = createService();

    const result = await service.startTemporaryConceptRoam({
      conceptBlockId: 'concept-block',
      conceptCardId: 'concept-card',
    });

    expect(result).toMatchObject({
      ok: true,
      action: 'temporary-concept-roam',
      blockId: 'concept-block',
      conceptBlockId: 'concept-block',
      cardId: 'concept-card',
      openedDialog: true,
    });
    expect(queue.setEngineMode).toHaveBeenCalledWith('orbit', { carryCurrentNode: true });
    expect(queue.createTemporaryRoute).toHaveBeenCalledWith({
      name: '临时：concept-block',
      seedBlockId: 'concept-block',
      previousRouteId: 'route-previous',
    });
    expect(openNeuralRoamDialog).toHaveBeenCalledWith(expect.objectContaining({
      focusBlockId: 'concept-block',
      seedBlockId: 'concept-block',
      conceptBlockId: 'concept-block',
      includeFocusAsFirst: true,
      startNewSession: true,
      entrySessionKind: 'temporary-concept',
    }));
  });
});
