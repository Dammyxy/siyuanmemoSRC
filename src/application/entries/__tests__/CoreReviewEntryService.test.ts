import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { CoreReviewEntryService } from '@/application/entries/CoreReviewEntryService';
import { getCurrentDayEnd } from '@/utils/dateUtils';

describe('CoreReviewEntryService', () => {
  const now = Date.now();

  let dialogManager: {
    openRetrievalPracticeWithFilter: ReturnType<typeof vi.fn>;
    openIncrementalLearningWithFilter: ReturnType<typeof vi.fn>;
    openTemporaryDrill: ReturnType<typeof vi.fn>;
  };
  let notify: ReturnType<typeof vi.fn>;
  let service: CoreReviewEntryService;

  beforeEach(() => {
    dialogManager = {
      openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
      openIncrementalLearningWithFilter: vi.fn().mockResolvedValue(undefined),
      openTemporaryDrill: vi.fn().mockResolvedValue(undefined),
    };
    notify = vi.fn().mockResolvedValue(undefined);
    service = new CoreReviewEntryService({
      i18n: {
        drillNoCards: '当前范围内没有可练习的闪卡',
        noDueCards: '当前范围内没有到期的闪卡',
      },
      dialogManager: dialogManager as any,
      notify,
      getDayStartHour: () => 4,
    });
  });

  it('retrieval-due only passes due item and descriptor cards', async () => {
    const dayEnd = getCurrentDayEnd(4);
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: CardType.Item, due: dayEnd - 1 } as FSRSCard,
      { id: 'descriptor-due', blockId: 'block-descriptor-due', type: CardType.Descriptor, due: dayEnd } as FSRSCard,
      { id: 'item-future', blockId: 'block-item-future', type: CardType.Item, due: dayEnd + 1 } as FSRSCard,
      { id: 'concept-due', blockId: 'block-concept-due', type: CardType.Concept, due: dayEnd - 1 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: CardType.Topic, due: dayEnd - 1 } as FSRSCard,
    ];

    await service.execute('retrieval-due', cards);

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-due', 'block-descriptor-due'],
      cardIds: ['item-due', 'descriptor-due'],
      preferredCardId: 'item-due',
      dueOnly: true,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('retrieval-all only passes non-suspended item and descriptor cards', async () => {
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: CardType.Item, due: now - 1 } as FSRSCard,
      { id: 'descriptor-due', blockId: 'block-descriptor-due', type: CardType.Descriptor, due: now - 1 } as FSRSCard,
      { id: 'concept-due', blockId: 'block-concept-due', type: CardType.Concept, due: now - 1 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: CardType.Topic, due: now - 1 } as FSRSCard,
      {
        id: 'item-suspended',
        blockId: 'block-item-suspended',
        type: CardType.Item,
        due: now - 1,
        state: CardState.Suspended,
      } as FSRSCard,
    ];

    await service.execute('retrieval-all', cards);

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-due', 'block-descriptor-due'],
      cardIds: ['item-due', 'descriptor-due'],
      preferredCardId: 'item-due',
      dueOnly: false,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('labels retrieval counts with the actual extraction queue semantics', () => {
    const dayEnd = getCurrentDayEnd(4);
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: CardType.Item, due: dayEnd - 1 } as FSRSCard,
      { id: 'descriptor-due', blockId: 'block-descriptor-due', type: CardType.Descriptor, due: dayEnd } as FSRSCard,
      { id: 'item-future', blockId: 'block-item-future', type: CardType.Item, due: dayEnd + 1 } as FSRSCard,
      { id: 'concept-due', blockId: 'block-concept-due', type: CardType.Concept, due: dayEnd - 1 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: CardType.Topic, due: dayEnd - 1 } as FSRSCard,
      {
        id: 'item-suspended',
        blockId: 'block-item-suspended',
        type: CardType.Item,
        due: dayEnd - 1,
        state: CardState.Suspended,
      } as FSRSCard,
    ];

    const actions = service.createMenuActions(cards);

    expect(actions[0].label).toContain('(2/3)');
    expect(actions[1].label).toContain('(3)');
  });

  it('incremental-due passes due cards of all types', async () => {
    const dayEnd = getCurrentDayEnd(4);
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: 'item', due: dayEnd - 1 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: 'topic', due: dayEnd } as FSRSCard,
      { id: 'item-future', blockId: 'block-item-future', type: 'item', due: dayEnd + 1 } as FSRSCard,
    ];

    await service.execute('incremental-due', cards);

    expect(dialogManager.openIncrementalLearningWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-due', 'block-topic-due'],
      cardIds: ['item-due', 'topic-due'],
      preferredCardId: 'item-due',
      dueOnly: true,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('incremental-all passes all cards', async () => {
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: 'topic', due: now - 1 } as FSRSCard,
      { id: 'item-future', blockId: 'block-item-future', type: 'item', due: now + 60_000 } as FSRSCard,
    ];

    await service.execute('incremental-all', cards);

    expect(dialogManager.openIncrementalLearningWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-due', 'block-topic-due', 'block-item-future'],
      cardIds: ['item-due', 'topic-due', 'item-future'],
      preferredCardId: 'item-due',
      dueOnly: false,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('temporary-drill passes de-duplicated block ids and exact selected card ids', async () => {
    const cards: FSRSCard[] = [
      { id: 'card-1', blockId: 'same-block', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'card-2', blockId: 'same-block', type: 'topic', due: now - 1 } as FSRSCard,
      { id: 'card-3', blockId: 'other-block', type: 'item', due: now + 60_000 } as FSRSCard,
    ];

    await service.execute('temporary-drill', cards);

    expect(dialogManager.openTemporaryDrill).toHaveBeenCalledWith(['same-block', 'other-block'], {
      cardIds: ['card-1', 'card-2', 'card-3'],
      preferredCardId: 'card-1',
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('forwards scopeDocIds to filter-backed review dialogs', async () => {
    const cards: FSRSCard[] = [
      { id: 'item-1', blockId: 'block-item-1', type: 'item', due: now - 1 } as FSRSCard,
    ];

    await service.execute('retrieval-all', cards, {
      scopeDocIds: ['doc-1', 'doc-2'],
    });

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-1'],
      cardIds: ['item-1'],
      preferredCardId: 'item-1',
      scopeDocIds: ['doc-1', 'doc-2'],
      dueOnly: false,
    });
  });
});
