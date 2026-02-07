/**
 * Temporary Blacklist Tests
 * 临时黑名单测试
 * 
 * 测试动态队列的临时移除功能。
 * 
 * @see .kiro/specs/retrieval-practice-browser-display-fix/requirements.md
 * @see .kiro/specs/retrieval-practice-browser-display-fix/design.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetrievalPracticeQueue } from '../RetrievalPracticeQueue';
import { IncrementalLearningQueue } from '../IncrementalLearningQueue';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { FSRSCard } from '../../types/card';
import { QueueType } from '../../types/unified-data-source';

// Mock UnifiedDataSourceManager
vi.mock('../../managers/UnifiedDataSourceManager');

describe('Temporary Blacklist', () => {
    let manager: UnifiedDataSourceManager;
    let mockCards: FSRSCard[];
    
    beforeEach(() => {
        // 创建 mock manager
        manager = new UnifiedDataSourceManager({} as any);
        
        // 创建测试卡片
        mockCards = [
            {
                id: 'card-1',
                blockId: 'block-1',
                due: Date.now() - 1000,
                reps: 1,
                state: 2,
                scheduledDays: 1,
                stability: 1,
                difficulty: 5,
                priority: 1,
                lapses: 0,
                lastReview: Date.now() - 86400000,
            },
            {
                id: 'card-2',
                blockId: 'block-2',
                due: Date.now() - 2000,
                reps: 2,
                state: 2,
                scheduledDays: 2,
                stability: 2,
                difficulty: 5,
                priority: 2,
                lapses: 0,
                lastReview: Date.now() - 172800000,
            },
            {
                id: 'card-3',
                blockId: 'block-3',
                due: Date.now() - 3000,
                reps: 3,
                state: 2,
                scheduledDays: 3,
                stability: 3,
                difficulty: 5,
                priority: 3,
                lapses: 0,
                lastReview: Date.now() - 259200000,
            },
        ] as FSRSCard[];
        
        // Mock getCards 方法
        vi.spyOn(manager, 'getCards').mockResolvedValue(mockCards);
        
        // Mock getCard 方法
        vi.spyOn(manager, 'getCard').mockImplementation(async (cardId: string) => {
            const card = mockCards.find(c => c.id === cardId);
            if (!card) {
                throw new Error(`Card ${cardId} not found`);
            }
            return card;
        });
        
        // Mock notifyObservers 方法
        vi.spyOn(manager, 'notifyObservers').mockImplementation(() => {});
        
        // Mock localStorage
        global.localStorage = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            length: 0,
            key: vi.fn(),
        };
    });
    
    describe('RetrievalPracticeQueue', () => {
        let queue: RetrievalPracticeQueue;
        
        beforeEach(() => {
            queue = new RetrievalPracticeQueue(manager);
        });
        
        it('should add card to temporary blacklist when removed', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            
            // 验证临时黑名单大小
            expect(queue.getTemporaryBlacklistSize()).toBe(1);
        });
        
        it('should filter temporary blacklist in getCards()', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            
            // 获取卡片
            const cards = await queue.getCards();
            
            // 验证卡片不在列表中
            expect(cards.find(c => c.id === 'card-1')).toBeUndefined();
            expect(cards.length).toBe(2);
        });
        
        it('should remove card from temporary blacklist when added', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            expect(queue.getTemporaryBlacklistSize()).toBe(1);
            
            // 重新添加卡片
            await queue.addCard('card-1');
            
            // 验证临时黑名单已清空
            expect(queue.getTemporaryBlacklistSize()).toBe(0);
        });
        
        it('should not persist temporary blacklist', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            
            // 验证 localStorage 没有保存临时黑名单
            const setItemCalls = (global.localStorage.setItem as any).mock.calls;
            const blacklistCalls = setItemCalls.filter((call: any[]) => 
                call[0].includes('blacklist')
            );
            expect(blacklistCalls.length).toBe(0);
        });
        
        it('should handle multiple cards in blacklist', async () => {
            // 移除多张卡片
            await queue.removeCard('card-1');
            await queue.removeCard('card-2');
            
            // 验证临时黑名单大小
            expect(queue.getTemporaryBlacklistSize()).toBe(2);
            
            // 获取卡片
            const cards = await queue.getCards();
            
            // 验证卡片不在列表中
            expect(cards.find(c => c.id === 'card-1')).toBeUndefined();
            expect(cards.find(c => c.id === 'card-2')).toBeUndefined();
            expect(cards.length).toBe(1);
        });
        
        it('should clear temporary blacklist', async () => {
            // 移除多张卡片
            await queue.removeCard('card-1');
            await queue.removeCard('card-2');
            expect(queue.getTemporaryBlacklistSize()).toBe(2);
            
            // 清空临时黑名单
            queue.clearTemporaryBlacklist();
            
            // 验证临时黑名单已清空
            expect(queue.getTemporaryBlacklistSize()).toBe(0);
            
            // 获取卡片
            const cards = await queue.getCards();
            
            // 验证所有卡片都在列表中
            expect(cards.length).toBe(3);
        });
        
        it('should handle remove and re-add immediately', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            expect(queue.getTemporaryBlacklistSize()).toBe(1);
            
            // 立即重新添加
            await queue.addCard('card-1');
            expect(queue.getTemporaryBlacklistSize()).toBe(0);
            
            // 获取卡片
            const cards = await queue.getCards();
            
            // 验证卡片在列表中
            expect(cards.find(c => c.id === 'card-1')).toBeDefined();
        });
    });
    
    describe('IncrementalLearningQueue', () => {
        let queue: IncrementalLearningQueue;
        
        beforeEach(() => {
            queue = new IncrementalLearningQueue(manager);
        });
        
        it('should add card to temporary blacklist when removed', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            
            // 验证临时黑名单大小
            expect(queue.getTemporaryBlacklistSize()).toBe(1);
        });
        
        it('should filter temporary blacklist in getCards()', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            
            // 获取卡片
            const cards = await queue.getCards();
            
            // 验证卡片不在列表中
            expect(cards.find(c => c.id === 'card-1')).toBeUndefined();
            expect(cards.length).toBe(2);
        });
        
        it('should remove card from temporary blacklist when added', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            expect(queue.getTemporaryBlacklistSize()).toBe(1);
            
            // 重新添加卡片
            await queue.addCard('card-1');
            
            // 验证临时黑名单已清空
            expect(queue.getTemporaryBlacklistSize()).toBe(0);
        });
        
        it('should not persist temporary blacklist', async () => {
            // 移除卡片
            await queue.removeCard('card-1');
            
            // 验证 localStorage 没有保存临时黑名单
            const setItemCalls = (global.localStorage.setItem as any).mock.calls;
            const blacklistCalls = setItemCalls.filter((call: any[]) => 
                call[0].includes('blacklist')
            );
            expect(blacklistCalls.length).toBe(0);
        });
        
        it('should handle multiple cards in blacklist', async () => {
            // 移除多张卡片
            await queue.removeCard('card-1');
            await queue.removeCard('card-2');
            
            // 验证临时黑名单大小
            expect(queue.getTemporaryBlacklistSize()).toBe(2);
            
            // 获取卡片
            const cards = await queue.getCards();
            
            // 验证卡片不在列表中
            expect(cards.find(c => c.id === 'card-1')).toBeUndefined();
            expect(cards.find(c => c.id === 'card-2')).toBeUndefined();
            expect(cards.length).toBe(1);
        });
        
        it('should clear temporary blacklist', async () => {
            // 移除多张卡片
            await queue.removeCard('card-1');
            await queue.removeCard('card-2');
            expect(queue.getTemporaryBlacklistSize()).toBe(2);
            
            // 清空临时黑名单
            queue.clearTemporaryBlacklist();
            
            // 验证临时黑名单已清空
            expect(queue.getTemporaryBlacklistSize()).toBe(0);
            
            // 获取卡片
            const cards = await queue.getCards();
            
            // 验证所有卡片都在列表中
            expect(cards.length).toBe(3);
        });
    });
    
    describe('Queue Independence', () => {
        it('should maintain independent blacklists', async () => {
            const retrievalQueue = new RetrievalPracticeQueue(manager);
            const incrementalQueue = new IncrementalLearningQueue(manager);
            
            // 从提取练习队列移除 card-1
            await retrievalQueue.removeCard('card-1');
            
            // 从渐进学习队列移除 card-2
            await incrementalQueue.removeCard('card-2');
            
            // 验证两个队列的临时黑名单独立
            expect(retrievalQueue.getTemporaryBlacklistSize()).toBe(1);
            expect(incrementalQueue.getTemporaryBlacklistSize()).toBe(1);
            
            // 获取卡片
            const retrievalCards = await retrievalQueue.getCards();
            const incrementalCards = await incrementalQueue.getCards();
            
            // 验证提取练习队列：card-1 不在，card-2 在
            expect(retrievalCards.find(c => c.id === 'card-1')).toBeUndefined();
            expect(retrievalCards.find(c => c.id === 'card-2')).toBeDefined();
            
            // 验证渐进学习队列：card-1 在，card-2 不在
            expect(incrementalCards.find(c => c.id === 'card-1')).toBeDefined();
            expect(incrementalCards.find(c => c.id === 'card-2')).toBeUndefined();
        });
        
        it('should allow same card to be removed from different queues', async () => {
            const retrievalQueue = new RetrievalPracticeQueue(manager);
            const incrementalQueue = new IncrementalLearningQueue(manager);
            
            // 从两个队列移除同一张卡片
            await retrievalQueue.removeCard('card-1');
            await incrementalQueue.removeCard('card-1');
            
            // 验证两个队列都有临时黑名单
            expect(retrievalQueue.getTemporaryBlacklistSize()).toBe(1);
            expect(incrementalQueue.getTemporaryBlacklistSize()).toBe(1);
            
            // 获取卡片
            const retrievalCards = await retrievalQueue.getCards();
            const incrementalCards = await incrementalQueue.getCards();
            
            // 验证两个队列都不包含 card-1
            expect(retrievalCards.find(c => c.id === 'card-1')).toBeUndefined();
            expect(incrementalCards.find(c => c.id === 'card-1')).toBeUndefined();
        });
    });
});
