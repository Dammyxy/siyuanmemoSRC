/**
 * Retrieval Practice Queue Tests
 * 检索练习队列单元测试
 * 
 * 测试检索练习队列的核心功能：
 * - 获取到期的项目卡片
 * - 手动添加卡片
 * - 排序逻辑
 * - 复习处理
 * - 持久化
 */

import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { QueueType, OperationMode } from '../../types/unified-data-source';
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

// Helper function to create test cards
function createTestCard(id: string, due: number, priority: number = 50, type: CardType = CardType.Item): FSRSCard {
    return {
        id,
        blockId: `block-${id}`,
        due,
        stability: 1,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 1,
        priority,
        type,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

describe('RetrievalPracticeQueue', () => {
    let manager: UnifiedDataSourceManager;
    let queue: RetrievalPracticeQueue;
    
    beforeEach(() => {
        // Clear localStorage
        localStorageMock.clear();
        
        // Reset manager instance
        UnifiedDataSourceManager.resetInstance();
        manager = UnifiedDataSourceManager.getInstance();
        
        // Create queue instance
        queue = new RetrievalPracticeQueue(manager);
    });
    
    describe('基本属性', () => {
        it('应该返回正确的队列类型', () => {
            expect(queue.getType()).toBe(QueueType.RetrievalPractice);
        });
        
        it('应该是动态队列', () => {
            expect(queue.isDynamic()).toBe(true);
        });
    });
    
    describe('手动添加卡片', () => {
        it('应该能够添加卡片', async () => {
            await queue.addCard('card-1');
            
            // 验证持久化
            const stored = localStorage.getItem('retrieval-practice-manual-cards');
            expect(stored).toBeTruthy();
            
            const cardIds = JSON.parse(stored!);
            expect(cardIds).toContain('card-1');
        });
        
        it('应该能够移除卡片', async () => {
            await queue.addCard('card-1');
            await queue.addCard('card-2');
            await queue.removeCard('card-1');
            
            // 验证持久化
            const stored = localStorage.getItem('retrieval-practice-manual-cards');
            const cardIds = JSON.parse(stored!);
            
            expect(cardIds).not.toContain('card-1');
            expect(cardIds).toContain('card-2');
        });
        
        it('应该避免重复添加', async () => {
            await queue.addCard('card-1');
            await queue.addCard('card-1');
            
            const stored = localStorage.getItem('retrieval-practice-manual-cards');
            const cardIds = JSON.parse(stored!);
            
            expect(cardIds.length).toBe(1);
            expect(cardIds[0]).toBe('card-1');
        });
    });
    
    describe('持久化', () => {
        it('应该在重新创建队列时恢复手动添加的卡片', async () => {
            // 添加卡片
            await queue.addCard('card-1');
            await queue.addCard('card-2');
            
            // 创建新的队列实例
            const newQueue = new RetrievalPracticeQueue(manager);
            
            // 验证手动添加的卡片已恢复
            // 注意：这里我们无法直接访问 manuallyAddedCards，
            // 但可以通过持久化存储验证
            const stored = localStorage.getItem('retrieval-practice-manual-cards');
            const cardIds = JSON.parse(stored!);
            
            expect(cardIds).toContain('card-1');
            expect(cardIds).toContain('card-2');
        });
    });
    
    describe('排序逻辑', () => {
        it('应该按到期日期排序', () => {
            const now = Date.now();
            const cards = [
                createTestCard('card-1', now + 1000),
                createTestCard('card-2', now - 1000),
                createTestCard('card-3', now)
            ];
            
            // 使用私有方法测试排序（通过类型断言）
            const sortedCards = (queue as any).sortByDueDateAndPriority(cards);
            
            expect(sortedCards[0].id).toBe('card-2'); // 最早到期
            expect(sortedCards[1].id).toBe('card-3');
            expect(sortedCards[2].id).toBe('card-1'); // 最晚到期
        });
        
        it('应该在到期日期相同时按优先级排序', () => {
            const now = Date.now();
            const cards = [
                createTestCard('card-1', now, 50),
                createTestCard('card-2', now, 10),
                createTestCard('card-3', now, 30)
            ];
            
            const sortedCards = (queue as any).sortByDueDateAndPriority(cards);
            
            expect(sortedCards[0].id).toBe('card-2'); // 优先级最高（10）
            expect(sortedCards[1].id).toBe('card-3'); // 优先级中等（30）
            expect(sortedCards[2].id).toBe('card-1'); // 优先级最低（50）
        });
    });
    
    describe('合并和去重', () => {
        it('应该合并两个卡片数组并去重', () => {
            const now = Date.now();
            const dueCards = [
                createTestCard('card-1', now),
                createTestCard('card-2', now)
            ];
            const manualCards = [
                createTestCard('card-2', now), // 重复
                createTestCard('card-3', now)
            ];
            
            const merged = (queue as any).mergeAndDeduplicate(dueCards, manualCards);
            
            expect(merged.length).toBe(3);
            expect(merged.find((c: FSRSCard) => c.id === 'card-1')).toBeTruthy();
            expect(merged.find((c: FSRSCard) => c.id === 'card-2')).toBeTruthy();
            expect(merged.find((c: FSRSCard) => c.id === 'card-3')).toBeTruthy();
        });
    });
    
    describe('计算下次到期日期', () => {
        it('应该为评分 3 计算正确的间隔', () => {
            const card = createTestCard('card-1', Date.now());
            card.scheduledDays = 1;
            
            const now = Date.now();
            const nextDue = (queue as any).calculateNextDueDate(card, 3);
            
            // 评分 3：间隔 * 2 = 2 天
            const expectedDue = now + 2 * 24 * 60 * 60 * 1000;
            
            // 允许 1 秒的误差
            expect(Math.abs(nextDue - expectedDue)).toBeLessThan(1000);
        });
        
        it('应该为评分 4 计算正确的间隔', () => {
            const card = createTestCard('card-1', Date.now());
            card.scheduledDays = 1;
            
            const now = Date.now();
            const nextDue = (queue as any).calculateNextDueDate(card, 4);
            
            // 评分 4：间隔 * 4 = 4 天
            const expectedDue = now + 4 * 24 * 60 * 60 * 1000;
            
            // 允许 1 秒的误差
            expect(Math.abs(nextDue - expectedDue)).toBeLessThan(1000);
        });
    });
});
