/**
 * Card Migration Integration Tests
 * 测试卡片迁移在数据路由器中的集成
 * 
 * @see .kiro/specs/learning-steps-rating-fix/tasks.md - Task 3.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdvancedDataRouter } from '../AdvancedDataRouter';
import { FSRSCard, CardState, CardType } from '../../types/card';
import type { StorageManager } from '../../core/storage/manager';

/**
 * 创建模拟的 StorageManager
 */
function createMockStorageManager(cards: FSRSCard[]): StorageManager {
    const cardMap = new Map(cards.map(c => [c.id, c]));
    
    return {
        getCard: vi.fn((id: string) => cardMap.get(id)),
        getAllCards: vi.fn(() => Array.from(cardMap.values())),
        setCard: vi.fn((card: FSRSCard) => {
            cardMap.set(card.id, card);
        }),
        deleteCard: vi.fn((id: string) => {
            cardMap.delete(id);
        }),
        saveCards: vi.fn(async () => {}),
    } as any;
}

/**
 * 创建测试卡片（模拟旧版本数据，没有 learning_step）
 */
function createLegacyCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
    const now = Date.now();
    const card: any = {
        id: 'legacy-card-1',
        blockId: 'block-1',
        due: now,
        stability: 1.0,
        difficulty: 5.0,
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
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
    
    // 删除 learning_step 字段以模拟旧版本数据
    delete card.learning_step;
    
    return card;
}

describe('Card Migration Integration', () => {
    describe('AdvancedDataRouter', () => {
        it('should migrate cards without learning_step when calling getCard', async () => {
            const legacyCard = createLegacyCard({ id: 'card-1' });
            const storage = createMockStorageManager([legacyCard]);
            const router = new AdvancedDataRouter(storage);
            
            const card = await router.getCard('card-1');
            
            expect(card.learning_step).toBe(0);
            expect(card.state).toBe(CardState.New);
        });
        
        it('should migrate multiple cards when calling getCards', async () => {
            const legacyCards = [
                createLegacyCard({ id: 'card-1' }),
                createLegacyCard({ id: 'card-2' }),
                createLegacyCard({ id: 'card-3' }),
            ];
            const storage = createMockStorageManager(legacyCards);
            const router = new AdvancedDataRouter(storage);
            
            const cards = await router.getCards();
            
            expect(cards).toHaveLength(3);
            cards.forEach(card => {
                expect(card.learning_step).toBe(0);
                expect(card.state).toBeDefined();
            });
        });
        
        it('should preserve existing learning_step values', async () => {
            const now = Date.now();
            const cardWithStep: FSRSCard = {
                id: 'card-1',
                blockId: 'block-1',
                due: now,
                stability: 1.0,
                difficulty: 5.0,
                reps: 2,
                lapses: 0,
                state: CardState.Learning,
                lastReview: now - 60000,
                elapsedDays: 0,
                scheduledDays: 0,
                learning_step: 2,  // 已有 learning_step
                priority: 50,
                type: CardType.Item,
                tags: [],
                leechCount: 0,
                isLeech: false,
                skipped: false,
                createdAt: now,
                updatedAt: now,
            };
            
            const storage = createMockStorageManager([cardWithStep]);
            const router = new AdvancedDataRouter(storage);
            
            const card = await router.getCard('card-1');
            
            expect(card.learning_step).toBe(2);
            expect(card.state).toBe(CardState.Learning);
        });
        
        it('should infer state from scheduledDays if state is undefined', async () => {
            const legacyCard = createLegacyCard({
                id: 'card-1',
                state: undefined as any,
                scheduledDays: 5,
            });
            const storage = createMockStorageManager([legacyCard]);
            const router = new AdvancedDataRouter(storage);
            
            const card = await router.getCard('card-1');
            
            expect(card.learning_step).toBe(0);
            expect(card.state).toBe(CardState.Review);  // scheduledDays >= 1
        });
        
        it('should handle mixed legacy and new cards', async () => {
            const now = Date.now();
            const cards = [
                createLegacyCard({ id: 'legacy-1' }),  // 旧卡片，无 learning_step
                {  // 新卡片，有 learning_step
                    id: 'new-1',
                    blockId: 'block-2',
                    due: now,
                    stability: 1.0,
                    difficulty: 5.0,
                    reps: 0,
                    lapses: 0,
                    state: CardState.New,
                    lastReview: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    learning_step: 0,
                    priority: 50,
                    type: CardType.Item,
                    tags: [],
                    leechCount: 0,
                    isLeech: false,
                    skipped: false,
                    createdAt: now,
                    updatedAt: now,
                } as FSRSCard,
                createLegacyCard({ id: 'legacy-2' }),  // 旧卡片，无 learning_step
            ];
            
            const storage = createMockStorageManager(cards);
            const router = new AdvancedDataRouter(storage);
            
            const loadedCards = await router.getCards();
            
            expect(loadedCards).toHaveLength(3);
            loadedCards.forEach(card => {
                expect(card.learning_step).toBeDefined();
                expect(card.learning_step).toBe(0);
            });
        });
        
        it('should modify cards in-place during migration for performance', async () => {
            const legacyCard = createLegacyCard({ id: 'card-1' });
            const storage = createMockStorageManager([legacyCard]);
            const router = new AdvancedDataRouter(storage);
            
            const migratedCard = await router.getCard('card-1');
            
            // 验证迁移后的卡片有 learning_step
            expect(migratedCard.learning_step).toBe(0);
            
            // 验证 storage 中的卡片也被修改了（in-place mutation）
            const originalCard = storage.getCard('card-1');
            expect(originalCard?.learning_step).toBe(0);
            
            // 这是预期行为：为了性能，我们直接修改对象而不是创建副本
        });
    });
    
    describe('Backward Compatibility', () => {
        it('should handle cards from very old versions', async () => {
            const veryOldCard: any = {
                id: 'old-card',
                blockId: 'block-1',
                due: Date.now(),
                stability: 0,
                difficulty: 0,
                reps: 0,
                lapses: 0,
                // 没有 state 字段
                lastReview: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                // 没有 learning_step 字段
                priority: 50,
                type: CardType.Item,
                tags: [],
                leechCount: 0,
                isLeech: false,
                skipped: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            
            const storage = createMockStorageManager([veryOldCard]);
            const router = new AdvancedDataRouter(storage);
            
            const card = await router.getCard('old-card');
            
            expect(card.learning_step).toBe(0);
            expect(card.state).toBe(CardState.New);  // 推断为 New
        });
    });
});
