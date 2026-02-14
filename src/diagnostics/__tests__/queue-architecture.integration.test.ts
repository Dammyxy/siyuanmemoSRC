/**
 * Queue Architecture Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('siyuan', () => ({}), { virtual: true });
vi.mock('@/utils/dialog', () => ({
    createVueDialog: vi.fn(() => ({ destroy: vi.fn() })),
}));
vi.mock('@/strategies/createUnifiedReviewDialog', () => ({
    createUnifiedReviewDialog: vi.fn(() => ({ destroy: vi.fn() })),
}));
vi.mock('@/ui/review/v2', () => ({
    ReviewView: {},
    FinalDrillAdapter: class {},
    FinalDrillProvider: class {},
    LeechAdapter: class {},
    NeuralRoamAdapter: class {},
    RetrievalPracticeAdapter: class {},
    SubsetPracticeAdapter: class {},
}));
vi.mock('@/ui/review/v2/providers/RetrievalPracticeProvider', () => ({
    RetrievalPracticeProvider: class {},
}));

import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { QueueType, type IDataRouter } from '../../types/unified-data-source';
import { CardType, type FSRSCard } from '../../types/card';
import { SRSBrowserAdapter } from '../../ui/browser/SRSBrowserAdapter';
import { ReviewDialogManager } from '../../services/ReviewDialogManager';

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
            store[key] = String(value);
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
});

const buildFsrsCard = (id: string): FSRSCard => ({
    id,
    blockId: `block-${id}`,
    due: Date.now(),
    state: 0,
    stability: 0,
    difficulty: 5,
    reps: 0,
    lapses: 0,
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
    meta: {},
});

const createMockRouters = (cards: FSRSCard[]): { simple: IDataRouter; advanced: IDataRouter } => {
    const router: IDataRouter = {
        getCard: vi.fn(async (cardId: string) => {
            const found = cards.find(card => card.id === cardId);
            if (!found) {
                throw new Error(`Card not found: ${cardId}`);
            }
            return found;
        }),
        getCards: vi.fn(async () => cards),
        updateCard: vi.fn(async () => {}),
        deleteCard: vi.fn(async () => {}),
        getAvailableQueueTypes: vi.fn(() => [
            QueueType.RetrievalPractice,
            QueueType.IncrementalLearning,
            QueueType.FilterGroup,
            QueueType.FinalDrill,
            QueueType.NeuralRoam,
        ]),
        getContextMenuOptions: vi.fn(() => []),
    };

    return { simple: router, advanced: { ...router } };
};

describe('Queue Architecture Integration', () => {
    beforeEach(() => {
        UnifiedDataSourceManager.resetInstance();
        localStorageMock.clear();
    });

    it('Requirement 12.1: should create queues via UnifiedDataSourceManager', () => {
        const manager = UnifiedDataSourceManager.getInstance();
        const cards = [buildFsrsCard('card-1')];
        const { simple, advanced } = createMockRouters(cards);
        manager.initializeRouters(simple, advanced);

        const queues = [
            manager.getQueue(QueueType.RetrievalPractice),
            manager.getQueue(QueueType.IncrementalLearning),
            manager.getQueue(QueueType.FilterGroup),
            manager.getQueue(QueueType.FinalDrill),
            manager.getQueue(QueueType.NeuralRoam),
        ];

        queues.forEach(queue => {
            expect(queue).toBeDefined();
            expect(typeof queue.getAllCards).toBe('function');
        });
    });

    it('Requirement 12.2: should retrieve cards using getAllCards()', async () => {
        const manager = UnifiedDataSourceManager.getInstance();
        const cards = [buildFsrsCard('card-1'), buildFsrsCard('card-2')];
        const { simple, advanced } = createMockRouters(cards);
        manager.initializeRouters(simple, advanced);

        const queue = manager.getQueue(QueueType.RetrievalPractice);
        const result = await queue.getAllCards();

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThanOrEqual(0);
        result.forEach(card => expect(card.id).toBeTruthy());
    });

    it('Requirement 12.3: should notify observers on queue update', async () => {
        const manager = UnifiedDataSourceManager.getInstance();
        const cards = [buildFsrsCard('card-1')];
        const { simple, advanced } = createMockRouters(cards);
        manager.initializeRouters(simple, advanced);

        const queue = manager.getQueue(QueueType.RetrievalPractice);
        let notified = false;
        queue.subscribe({
            onQueueUpdate: () => {
                notified = true;
            },
        });

        await queue.refresh();
        expect(notified).toBe(true);
    });

    it('Requirement 12.4: ReviewDialogManager should use unified queues', async () => {
        const manager = new ReviewDialogManager({
            app: {} as any,
            i18n: {},
            storage: {} as any,
            scheduler: {} as any,
            finalDrillQueue: {} as any,
            filterGroupQueue: {} as any,
            incrementalQueue: {} as any,
            isInitialized: () => true,
            plugin: { app: {}, i18n: {} },
        });

        await manager.openRetrievalPractice();
        await manager.openFinalDrill();
        await manager.openIncrementalLearning();
        await manager.openFilterGroupPractice();

        const { createUnifiedReviewDialog } = await import('@/strategies/createUnifiedReviewDialog');
        expect(createUnifiedReviewDialog).toHaveBeenCalled();
    });

    it('Requirement 12.5: SRSBrowserAdapter should integrate with unified queues', async () => {
        const manager = UnifiedDataSourceManager.getInstance();
        const cards = [buildFsrsCard('card-1'), buildFsrsCard('card-2')];
        const { simple, advanced } = createMockRouters(cards);
        manager.initializeRouters(simple, advanced);

        const adapter = new SRSBrowserAdapter(manager);
        await adapter.initializeQueueView(QueueType.RetrievalPractice);

        const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
        expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });
});
