/**
 * Dynamic Queues Learning Steps Integration Tests
 * 动态队列学习步骤集成测试
 * 
 * 测试所有动态队列（RetrievalPracticeQueue、IncrementalLearningQueue、FilterGroupQueue）
 * 的评分1/2行为，验证learning steps机制的正确性。
 * 
 * 测试内容：
 * - 评分1后不会立即显示同一张卡片
 * - 评分2的间隔介于评分1和评分3之间
 * - 如果队列中有其他卡片，优先显示其他卡片
 * - 评分1/2后卡片的due时间正确更新
 * 
 * @see .kiro/specs/learning-steps-rating-fix/requirements.md
 * @see .kiro/specs/learning-steps-rating-fix/design.md
 * @see .kiro/specs/learning-steps-rating-fix/tasks.md - Task 4.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '../IncrementalLearningQueue';
import { FilterGroupQueue } from '../FilterGroupQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../types/unified-data-source';
import { FSRSCard, CardType, CardState } from '../../types/card';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        }
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
});

/**
 * 创建测试卡片
 */
function createTestCard(
    id: string,
    due: number = Date.now(),
    state: CardState = CardState.Learning,
    type: CardType = CardType.Item
): FSRSCard {
    return {
        id,
        blockId: `block-${id}`,
        due,
        state,
        learning_step: 0,
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 1,
        priority: 50,
        type,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: 'siyuan' as any,
    };
}

/**
 * 等待指定毫秒数
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Dynamic Queues - Learning Steps Integration', () => {
    let manager: UnifiedDataSourceManager;
    
    beforeEach(() => {
        localStorageMock.clear();
        UnifiedDataSourceManager.resetInstance();
        manager = UnifiedDataSourceManager.getInstance();
    });
    
    describe('RetrievalPracticeQueue - 评分1/2行为', () => {
        let queue: RetrievalPracticeQueue;
        
        beforeEach(() => {
            queue = new RetrievalPracticeQueue(manager);
        });
        
        it('评分1后不会立即显示同一张卡片', async () => {
            // 创建两张卡片
            const card1 = createTestCard('card-1', Date.now() - 1000);
            const card2 = createTestCard('card-2', Date.now() - 500);
            
            // Mock manager.getCards to return our test cards
            const originalGetCards = manager.getCards.bind(manager);
            manager.getCards = async () => [card1, card2];
            
            // Mock manager.getCard
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return card1;
                if (id === 'card-2') return card2;
                throw new Error(`Card ${id} not found`);
            };
            
            // Mock manager.updateCard
            let updatedCard: FSRSCard | null = null;
            manager.updateCard = async (card: FSRSCard) => {
                updatedCard = card;
            };
            
            // 获取第一张卡片
            const cards1 = await queue.getCards();
            expect(cards1.length).toBe(2);
            expect(cards1[0].id).toBe('card-1'); // card-1应该是第一张（due更早）
            
            // 评分1
            await queue.handleReview('card-1', 1);
            
            // 验证卡片的due时间被更新
            expect(updatedCard).not.toBeNull();
            expect(updatedCard!.id).toBe('card-1');
            expect(updatedCard!.due).toBeGreaterThan(Date.now()); // due应该在未来
            
            // 立即获取下一张卡片
            const cards2 = await queue.getCards();
            
            // 应该显示card-2，而不是card-1
            expect(cards2.length).toBeGreaterThan(0);
            expect(cards2[0].id).toBe('card-2');
            
            // Restore
            manager.getCards = originalGetCards;
        });
        
        it('评分2的间隔应该大于评分1', async () => {
            const card1 = createTestCard('card-1', Date.now());
            const card2 = createTestCard('card-2', Date.now());
            
            // Mock manager
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return { ...card1 };
                if (id === 'card-2') return { ...card2 };
                throw new Error(`Card ${id} not found`);
            };
            
            let card1Updated: FSRSCard | null = null;
            let card2Updated: FSRSCard | null = null;
            manager.updateCard = async (card: FSRSCard) => {
                if (card.id === 'card-1') card1Updated = card;
                if (card.id === 'card-2') card2Updated = card;
            };
            
            // 评分1
            const before1 = Date.now();
            await queue.handleReview('card-1', 1);
            const after1 = Date.now();
            
            // 评分2
            const before2 = Date.now();
            await queue.handleReview('card-2', 2);
            const after2 = Date.now();
            
            // 验证评分1的间隔（应该是1分钟）
            expect(card1Updated).not.toBeNull();
            const interval1 = card1Updated!.due - before1;
            expect(interval1).toBeGreaterThanOrEqual(59000); // 至少59秒
            expect(interval1).toBeLessThanOrEqual(61000); // 最多61秒
            
            // 验证评分2的间隔（应该是5.5分钟）
            expect(card2Updated).not.toBeNull();
            const interval2 = card2Updated!.due - before2;
            expect(interval2).toBeGreaterThanOrEqual(329000); // 至少329秒（5.48分钟）
            expect(interval2).toBeLessThanOrEqual(331000); // 最多331秒（5.52分钟）
            
            // 验证评分2的间隔大于评分1
            expect(interval2).toBeGreaterThan(interval1);
        });
        
        it('如果队列中有其他卡片，评分1后优先显示其他卡片', async () => {
            const now = Date.now();
            const card1 = createTestCard('card-1', now - 1000);
            const card2 = createTestCard('card-2', now - 500);
            const card3 = createTestCard('card-3', now - 100);
            
            // Mock manager
            manager.getCards = async () => [card1, card2, card3];
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return card1;
                if (id === 'card-2') return card2;
                if (id === 'card-3') return card3;
                throw new Error(`Card ${id} not found`);
            };
            manager.updateCard = async (card: FSRSCard) => {
                if (card.id === 'card-1') {
                    card1.due = card.due;
                }
            };
            
            // 获取第一张卡片
            const cards1 = await queue.getCards();
            expect(cards1[0].id).toBe('card-1');
            
            // 评分1
            await queue.handleReview('card-1', 1);
            
            // card1的due现在是未来（now + 1分钟）
            // 重新获取卡片时，应该显示card2和card3，而不是card1
            const cards2 = await queue.getCards();
            expect(cards2.length).toBeGreaterThan(0);
            expect(cards2[0].id).not.toBe('card-1'); // 不应该是card1
            expect(['card-2', 'card-3']).toContain(cards2[0].id); // 应该是card2或card3
        });
    });
    
    describe('IncrementalLearningQueue - 评分1/2行为', () => {
        let queue: IncrementalLearningQueue;
        
        beforeEach(() => {
            queue = new IncrementalLearningQueue(manager);
        });
        
        it('评分1后不会立即显示同一张卡片', async () => {
            const card1 = createTestCard('card-1', Date.now() - 1000);
            const card2 = createTestCard('card-2', Date.now() - 500);
            
            // Mock manager
            manager.getCards = async () => [card1, card2];
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return card1;
                if (id === 'card-2') return card2;
                throw new Error(`Card ${id} not found`);
            };
            
            let updatedCard: FSRSCard | null = null;
            manager.updateCard = async (card: FSRSCard) => {
                updatedCard = card;
            };
            
            // 获取第一张卡片
            const cards1 = await queue.getCards();
            expect(cards1[0].id).toBe('card-1');
            
            // 评分1
            await queue.handleReview('card-1', 1);
            
            // 验证due时间被更新
            expect(updatedCard).not.toBeNull();
            expect(updatedCard!.due).toBeGreaterThan(Date.now());
            
            // 立即获取下一张卡片，应该是card-2
            const cards2 = await queue.getCards();
            expect(cards2[0].id).toBe('card-2');
        });
        
        it('评分2的间隔应该大于评分1', async () => {
            const card1 = createTestCard('card-1', Date.now());
            const card2 = createTestCard('card-2', Date.now());
            
            // Mock manager
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return { ...card1 };
                if (id === 'card-2') return { ...card2 };
                throw new Error(`Card ${id} not found`);
            };
            
            let card1Updated: FSRSCard | null = null;
            let card2Updated: FSRSCard | null = null;
            manager.updateCard = async (card: FSRSCard) => {
                if (card.id === 'card-1') card1Updated = card;
                if (card.id === 'card-2') card2Updated = card;
            };
            
            // 评分1
            const before1 = Date.now();
            await queue.handleReview('card-1', 1);
            
            // 评分2
            const before2 = Date.now();
            await queue.handleReview('card-2', 2);
            
            // 验证间隔
            expect(card1Updated).not.toBeNull();
            expect(card2Updated).not.toBeNull();
            
            const interval1 = card1Updated!.due - before1;
            const interval2 = card2Updated!.due - before2;
            
            // 评分2的间隔应该大于评分1
            expect(interval2).toBeGreaterThan(interval1);
            
            // 评分1应该约为1分钟
            expect(interval1).toBeGreaterThanOrEqual(59000);
            expect(interval1).toBeLessThanOrEqual(61000);
            
            // 评分2应该约为5.5分钟
            expect(interval2).toBeGreaterThanOrEqual(329000);
            expect(interval2).toBeLessThanOrEqual(331000);
        });
        
        it('支持主题卡片和项目卡片', async () => {
            const itemCard = createTestCard('item-1', Date.now(), CardState.Learning, CardType.Item);
            const topicCard = createTestCard('topic-1', Date.now(), CardState.Learning, CardType.Topic);
            
            // Mock manager
            manager.getCards = async () => [itemCard, topicCard];
            manager.getCard = async (id: string) => {
                if (id === 'item-1') return itemCard;
                if (id === 'topic-1') return topicCard;
                throw new Error(`Card ${id} not found`);
            };
            
            let updatedCards: FSRSCard[] = [];
            manager.updateCard = async (card: FSRSCard) => {
                updatedCards.push(card);
            };
            
            // 评分1 - 项目卡片
            await queue.handleReview('item-1', 1);
            
            // 评分1 - 主题卡片
            await queue.handleReview('topic-1', 1);
            
            // 验证两种类型的卡片都被正确处理
            expect(updatedCards.length).toBe(2);
            expect(updatedCards[0].id).toBe('item-1');
            expect(updatedCards[1].id).toBe('topic-1');
            
            // 验证due时间都被更新
            expect(updatedCards[0].due).toBeGreaterThan(Date.now());
            expect(updatedCards[1].due).toBeGreaterThan(Date.now());
        });
    });
    
    describe('FilterGroupQueue - 评分1/2行为', () => {
        let queue: FilterGroupQueue;
        
        beforeEach(() => {
            queue = new FilterGroupQueue(manager, {});
        });
        
        it('评分1后不会立即显示同一张卡片', async () => {
            const card1 = createTestCard('card-1', Date.now() - 1000);
            const card2 = createTestCard('card-2', Date.now() - 500);
            
            // Mock manager
            manager.getCards = async () => [card1, card2];
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return card1;
                if (id === 'card-2') return card2;
                throw new Error(`Card ${id} not found`);
            };
            
            let updatedCard: FSRSCard | null = null;
            manager.updateCard = async (card: FSRSCard) => {
                updatedCard = card;
            };
            
            // 获取第一张卡片
            const cards1 = await queue.getCards();
            expect(cards1[0].id).toBe('card-1');
            
            // 评分1
            await queue.handleReview('card-1', 1);
            
            // 验证due时间被更新
            expect(updatedCard).not.toBeNull();
            expect(updatedCard!.due).toBeGreaterThan(Date.now());
            
            // 立即获取下一张卡片，应该是card-2
            const cards2 = await queue.getCards();
            expect(cards2[0].id).toBe('card-2');
        });
        
        it('评分2的间隔应该大于评分1', async () => {
            const card1 = createTestCard('card-1', Date.now());
            const card2 = createTestCard('card-2', Date.now());
            
            // Mock manager
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return { ...card1 };
                if (id === 'card-2') return { ...card2 };
                throw new Error(`Card ${id} not found`);
            };
            
            let card1Updated: FSRSCard | null = null;
            let card2Updated: FSRSCard | null = null;
            manager.updateCard = async (card: FSRSCard) => {
                if (card.id === 'card-1') card1Updated = card;
                if (card.id === 'card-2') card2Updated = card;
            };
            
            // 评分1
            const before1 = Date.now();
            await queue.handleReview('card-1', 1);
            
            // 评分2
            const before2 = Date.now();
            await queue.handleReview('card-2', 2);
            
            // 验证间隔
            expect(card1Updated).not.toBeNull();
            expect(card2Updated).not.toBeNull();
            
            const interval1 = card1Updated!.due - before1;
            const interval2 = card2Updated!.due - before2;
            
            // 评分2的间隔应该大于评分1
            expect(interval2).toBeGreaterThan(interval1);
            
            // 评分1应该约为1分钟
            expect(interval1).toBeGreaterThanOrEqual(59000);
            expect(interval1).toBeLessThanOrEqual(61000);
            
            // 评分2应该约为5.5分钟
            expect(interval2).toBeGreaterThanOrEqual(329000);
            expect(interval2).toBeLessThanOrEqual(331000);
        });
        
        it('使用过滤条件获取卡片', async () => {
            const card1 = createTestCard('card-1', Date.now());
            const card2 = createTestCard('card-2', Date.now());
            card1.tags = ['tag1'];
            card2.tags = ['tag2'];
            
            // 创建带过滤条件的队列
            const filteredQueue = new FilterGroupQueue(manager, {
                tags: ['tag1']
            });
            
            // Mock manager
            manager.getCards = async (filter) => {
                // 模拟过滤逻辑
                if (filter?.tags && filter.tags.includes('tag1')) {
                    return [card1];
                }
                return [card1, card2];
            };
            
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return card1;
                if (id === 'card-2') return card2;
                throw new Error(`Card ${id} not found`);
            };
            
            let updatedCard: FSRSCard | null = null;
            manager.updateCard = async (card: FSRSCard) => {
                updatedCard = card;
            };
            
            // 获取卡片（应该只有card1）
            const cards = await filteredQueue.getCards();
            expect(cards.length).toBe(1);
            expect(cards[0].id).toBe('card-1');
            
            // 评分1
            await filteredQueue.handleReview('card-1', 1);
            
            // 验证due时间被更新
            expect(updatedCard).not.toBeNull();
            expect(updatedCard!.due).toBeGreaterThan(Date.now());
        });
    });
    
    describe('跨队列一致性测试', () => {
        it('所有动态队列的评分1间隔应该一致', async () => {
            const rpQueue = new RetrievalPracticeQueue(manager);
            const ilQueue = new IncrementalLearningQueue(manager);
            const fgQueue = new FilterGroupQueue(manager, {});
            
            const card1 = createTestCard('card-1', Date.now());
            const card2 = createTestCard('card-2', Date.now());
            const card3 = createTestCard('card-3', Date.now());
            
            // Mock manager
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return { ...card1 };
                if (id === 'card-2') return { ...card2 };
                if (id === 'card-3') return { ...card3 };
                throw new Error(`Card ${id} not found`);
            };
            
            let updatedCards: FSRSCard[] = [];
            manager.updateCard = async (card: FSRSCard) => {
                updatedCards.push({ ...card });
            };
            
            // 在不同队列中评分1
            const before = Date.now();
            await rpQueue.handleReview('card-1', 1);
            await ilQueue.handleReview('card-2', 1);
            await fgQueue.handleReview('card-3', 1);
            const after = Date.now();
            
            // 验证所有卡片的间隔都约为1分钟
            expect(updatedCards.length).toBe(3);
            
            for (const card of updatedCards) {
                const interval = card.due - before;
                expect(interval).toBeGreaterThanOrEqual(59000);
                expect(interval).toBeLessThanOrEqual(61000 + (after - before));
            }
        });
        
        it('所有动态队列的评分2间隔应该一致', async () => {
            const rpQueue = new RetrievalPracticeQueue(manager);
            const ilQueue = new IncrementalLearningQueue(manager);
            const fgQueue = new FilterGroupQueue(manager, {});
            
            const card1 = createTestCard('card-1', Date.now());
            const card2 = createTestCard('card-2', Date.now());
            const card3 = createTestCard('card-3', Date.now());
            
            // Mock manager
            manager.getCard = async (id: string) => {
                if (id === 'card-1') return { ...card1 };
                if (id === 'card-2') return { ...card2 };
                if (id === 'card-3') return { ...card3 };
                throw new Error(`Card ${id} not found`);
            };
            
            let updatedCards: FSRSCard[] = [];
            manager.updateCard = async (card: FSRSCard) => {
                updatedCards.push({ ...card });
            };
            
            // 在不同队列中评分2
            const before = Date.now();
            await rpQueue.handleReview('card-1', 2);
            await ilQueue.handleReview('card-2', 2);
            await fgQueue.handleReview('card-3', 2);
            const after = Date.now();
            
            // 验证所有卡片的间隔都约为5.5分钟
            expect(updatedCards.length).toBe(3);
            
            for (const card of updatedCards) {
                const interval = card.due - before;
                expect(interval).toBeGreaterThanOrEqual(329000);
                expect(interval).toBeLessThanOrEqual(331000 + (after - before));
            }
        });
    });
});
