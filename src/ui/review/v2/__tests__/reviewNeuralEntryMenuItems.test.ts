import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { buildReviewNeuralEntryMenuItems } from '../reviewNeuralEntryMenuItems';

function t(_key: string, fallback: string): string {
  return fallback;
}

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: 0,
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
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function createService() {
  return {
    startTemporaryCurrentBlockRoam: vi.fn(),
    startTemporaryConceptRoam: vi.fn(),
    establishStation: vi.fn(),
    establishStationAndStartRoam: vi.fn(),
    makeConceptOnly: vi.fn(),
    makeConceptAndAddToQueue: vi.fn(),
    makeConceptAndStartRoam: vi.fn(),
    addExistingConceptToQueue: vi.fn(),
  };
}

describe('buildReviewNeuralEntryMenuItems', () => {
  it('hides all entry groups without a usable current block id', () => {
    const items = buildReviewNeuralEntryMenuItems({
      t,
      currentCard: card(),
      currentBlockId: ' ',
      currentCardId: 'card-1',
      conceptTargets: [],
      entryActionService: createService(),
      runAction: vi.fn(),
    });

    expect(items).toEqual([]);
  });

  it('builds ordinary block temporary, station, and concept creation actions', () => {
    const items = buildReviewNeuralEntryMenuItems({
      t,
      currentCard: card({ type: CardType.Item }),
      currentBlockId: 'block-1',
      currentCardId: 'card-1',
      conceptTargets: [],
      entryActionService: createService(),
      runAction: vi.fn(),
    });

    expect(items.map((item) => item.label)).toEqual(['临时漫游', '建立并漫游', '建立']);
    expect(items[0].submenu?.map((item) => item.id)).toEqual(['temporary-current-block-roam']);
    expect(items[1].submenu?.map((item) => item.id)).toEqual(['station-and-roam', 'make-concept-and-roam']);
    expect(items[2].submenu?.map((item) => item.id)).toEqual([
      'establish-station',
      'make-concept',
      'make-concept-and-add-to-queue',
    ]);
  });

  it('shows existing concept-card actions without duplicate current-block temporary roam', () => {
    const items = buildReviewNeuralEntryMenuItems({
      t,
      currentCard: card({ type: CardType.Concept }),
      currentBlockId: 'concept-block',
      currentCardId: 'concept-card',
      conceptTargets: [{ focusBlockId: 'concept-block', label: '当前概念' }],
      entryActionService: createService(),
      runAction: vi.fn(),
    });

    expect(items[0].submenu?.map((item) => item.id)).toEqual(['temporary-concept-roam']);
    expect(items[1].submenu?.map((item) => item.id)).toEqual(['concept-card-and-roam']);
    expect(items[2].submenu?.map((item) => item.id)).toEqual(['add-existing-concept-to-queue']);
  });

  it('uses a concept-target submenu when multiple CDF targets exist', () => {
    const items = buildReviewNeuralEntryMenuItems({
      t,
      currentCard: card({ type: CardType.Descriptor }),
      currentBlockId: 'descriptor-block',
      currentCardId: 'descriptor-card',
      conceptTargets: [
        { focusBlockId: 'concept-a', label: '概念 A' },
        { focusBlockId: 'concept-b', label: '概念 B' },
      ],
      entryActionService: createService(),
      runAction: vi.fn(),
    });

    const conceptItem = items[0].submenu?.find((item) => item.id === 'temporary-concept-roam');
    expect(conceptItem?.submenu?.map((item) => item.label)).toEqual(['概念 A', '概念 B']);
  });

  it('seeds current-block temporary roam from the bound CDF concept target', () => {
    const service = createService();
    const runAction = vi.fn((_label, action) => void action());
    const items = buildReviewNeuralEntryMenuItems({
      t,
      currentCard: card({ type: CardType.Descriptor }),
      currentBlockId: 'descriptor-block',
      currentCardId: 'descriptor-card',
      conceptTargets: [{ focusBlockId: 'concept-block', label: '概念' }],
      entryActionService: service,
      runAction,
    });

    const currentBlockItem = items[0].submenu?.find((item) => item.id === 'temporary-current-block-roam');
    currentBlockItem?.click?.();

    expect(service.startTemporaryCurrentBlockRoam).toHaveBeenCalledWith({
      blockId: 'descriptor-block',
      sourceReviewCardId: 'descriptor-card',
      seedBlockId: 'concept-block',
      conceptBlockId: 'concept-block',
    });
  });
});
