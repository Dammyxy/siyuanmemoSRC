import { describe, expect, it, vi } from 'vitest';
import { NeuralRoamEntryActionService } from '../NeuralRoamEntryActionService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { ok } from '@/types/result';
import { QueueType } from '@/types/unified-data-source';

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
} = {}) {
  const storedCard = options.storedCard ?? card({ type: CardType.Concept });
  const queue = options.queue ?? {
    addCard: vi.fn(async () => undefined),
    setAnchorEntry: vi.fn(async () => undefined),
    getEngineMode: vi.fn(() => 'hyperspace'),
    setEngineMode: vi.fn(async () => undefined),
  };
  const openNeuralRoamDialog = options.openNeuralRoamDialog ?? vi.fn(async () => undefined);
  const createConceptCard = options.createConceptCard ?? vi.fn(async () => ok({}));
  const updateFSRSCard = options.updateFSRSCard ?? vi.fn(async () => ok({}));
  const getCardByBlockId = vi.fn(() => storedCard);
  const getQueue = vi.fn(() => queue);
  const addRiffCards = vi.fn(async () => ({ name: 'deck', size: 1 }));

  return {
    service: new NeuralRoamEntryActionService({
      storage: { getCardByBlockId } as any,
      cardCreationHelper: { createConceptCard } as any,
      cardService: { updateFSRSCard } as any,
      dataSourceManager: { getQueue } as any,
      siyuanApi: { BUILTIN_DECK_ID: 'deck', addRiffCards } as any,
      openNeuralRoamDialog,
    }),
    queue,
    openNeuralRoamDialog,
    createConceptCard,
    updateFSRSCard,
    getCardByBlockId,
    getQueue,
    addRiffCards,
  };
}

describe('NeuralRoamEntryActionService', () => {
  it('adds an existing concept card to the NeuralRoam queue without creating a duplicate concept card', async () => {
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
    expect(queue.addCard).toHaveBeenCalledWith(existingConcept, 'normal');
    expect(createConceptCard).not.toHaveBeenCalled();
  });

  it('opens immediate concept roam from explicit concept focus with high-priority queue insertion', async () => {
    const concept = card({ id: 'concept-card', blockId: 'concept-block', type: CardType.Concept });
    const { service, queue, openNeuralRoamDialog } = createService({ storedCard: concept });

    const result = await service.makeConceptAndStartRoam('concept-block');

    expect(result).toMatchObject({
      ok: true,
      action: 'make-concept-and-start-roam',
      blockId: 'concept-block',
      conceptBlockId: 'concept-block',
      openedDialog: true,
    });
    expect(queue.addCard).toHaveBeenCalledWith(concept, 'high');
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
