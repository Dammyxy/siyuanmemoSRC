import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { CoreReviewEntryService } from '@/application/entries/CoreReviewEntryService';

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
    });
  });

  it('retrieval-due only passes due item cards', async () => {
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'item-future', blockId: 'block-item-future', type: 'item', due: now + 60_000 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: 'topic', due: now - 1 } as FSRSCard,
    ];

    await service.execute('retrieval-due', cards);

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-due'],
      dueOnly: true,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('retrieval-all only passes item cards', async () => {
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'item-future', blockId: 'block-item-future', type: 'item', due: now + 60_000 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: 'topic', due: now - 1 } as FSRSCard,
    ];

    await service.execute('retrieval-all', cards);

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-due', 'block-item-future'],
      dueOnly: false,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('incremental-due passes due cards of all types', async () => {
    const cards: FSRSCard[] = [
      { id: 'item-due', blockId: 'block-item-due', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'topic-due', blockId: 'block-topic-due', type: 'topic', due: now - 1 } as FSRSCard,
      { id: 'item-future', blockId: 'block-item-future', type: 'item', due: now + 60_000 } as FSRSCard,
    ];

    await service.execute('incremental-due', cards);

    expect(dialogManager.openIncrementalLearningWithFilter).toHaveBeenCalledWith({
      blockIds: ['block-item-due', 'block-topic-due'],
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
      dueOnly: false,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('temporary-drill passes de-duplicated block ids', async () => {
    const cards: FSRSCard[] = [
      { id: 'card-1', blockId: 'same-block', type: 'item', due: now - 1 } as FSRSCard,
      { id: 'card-2', blockId: 'same-block', type: 'topic', due: now - 1 } as FSRSCard,
      { id: 'card-3', blockId: 'other-block', type: 'item', due: now + 60_000 } as FSRSCard,
    ];

    await service.execute('temporary-drill', cards);

    expect(dialogManager.openTemporaryDrill).toHaveBeenCalledWith(['same-block', 'other-block']);
    expect(notify).not.toHaveBeenCalled();
  });
});
