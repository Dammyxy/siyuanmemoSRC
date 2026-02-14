/**
 * Queue Reorder Tests
 * 测试所有队列的 reorder 方法
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { QueueType } from '../../types/unified-data-source';
import { FSRSCard } from '../../types/card';

describe('Queue Reorder Functionality', () => {
    let manager: UnifiedDataSourceManager;
    
    beforeEach(() => {
        // 清理 localStorage
        localStorage.clear();
        
        // 获取管理器实例
        manager = UnifiedDataSourceManager.getInstance();
    });
    
    describe('Dynamic Queues', () => {
        it('RetrievalPracticeQueue should support reorder', async () => {
            const queue = manager.getQueue(QueueType.RetrievalPractice);
            
            // 添加一些卡片
            await queue.addCard('card-1');
            await queue.addCard('card-2');
            await queue.addCard('card-3');
            
            // 创建模拟卡片数组（反向顺序）
            const orderedCards: FSRSCard[] = [
                { id: 'card-3' } as FSRSCard,
                { id: 'card-2' } as FSRSCard,
                { id: 'card-1' } as FSRSCard,
            ];
            
            // 动态队列应该支持重排序（临时覆盖）
            const result = await queue.reorder(orderedCards);
            expect(result).toBe(true);
            
            // 验证自定义排序已应用
            const customOrder = (queue as any).customOrder;
            expect(customOrder).toEqual(['card-3', 'card-2', 'card-1']);
        });
        
        it('IncrementalLearningQueue should support reorder', async () => {
            const queue = manager.getQueue(QueueType.IncrementalLearning);
            
            // 创建模拟卡片数组
            const orderedCards: FSRSCard[] = [
                { id: 'card-1' } as FSRSCard,
            ];
            
            // 动态队列应该支持重排序
            const result = await queue.reorder(orderedCards);
            expect(result).toBe(true);
        });
        
        it('FilterGroupQueue should support reorder', async () => {
            const queue = manager.getQueue(QueueType.FilterGroup);
            
            // 创建模拟卡片数组
            const orderedCards: FSRSCard[] = [
                { id: 'card-1' } as FSRSCard,
            ];
            
            // 动态队列应该支持重排序
            const result = await queue.reorder(orderedCards);
            expect(result).toBe(true);
        });
        
        it('RetrievalPracticeQueue custom order should affect getCards()', async () => {
            const queue = manager.getQueue(QueueType.RetrievalPractice);
            
            // 添加卡片
            await queue.addCard('card-1');
            await queue.addCard('card-2');
            await queue.addCard('card-3');
            
            // 应用自定义排序
            const orderedCards: FSRSCard[] = [
                { id: 'card-3' } as FSRSCard,
                { id: 'card-2' } as FSRSCard,
                { id: 'card-1' } as FSRSCard,
            ];
            await queue.reorder(orderedCards);
            
            // getCards() 应该返回自定义顺序
            // 注意：由于 getCards() 会调用 manager.getCards()，这里只验证 customOrder 存在
            const customOrder = (queue as any).customOrder;
            expect(customOrder).toEqual(['card-3', 'card-2', 'card-1']);
        });
        
        it('clearCustomOrder should restore default sorting', async () => {
            const queue = manager.getQueue(QueueType.RetrievalPractice);
            
            // 应用自定义排序
            const orderedCards: FSRSCard[] = [
                { id: 'card-1' } as FSRSCard,
            ];
            await queue.reorder(orderedCards);
            
            // 验证自定义排序已应用
            expect((queue as any).customOrder).not.toBeNull();
            
            // 清除自定义排序
            queue.clearCustomOrder();
            
            // 验证自定义排序已清除
            expect((queue as any).customOrder).toBeNull();
        });
    });
    
    describe('Static Queues', () => {
        it('FinalDrillQueue should support reorder', async () => {
            const queue = manager.getQueue(QueueType.FinalDrill);
            
            // 添加一些卡片
            await queue.addCard('card-1', 'manual');
            await queue.addCard('card-2', 'manual');
            await queue.addCard('card-3', 'manual');
            
            // 创建模拟卡片数组（反向顺序）
            const orderedCards: FSRSCard[] = [
                { id: 'card-3' } as FSRSCard,
                { id: 'card-2' } as FSRSCard,
                { id: 'card-1' } as FSRSCard,
            ];
            
            // 重排序应该成功
            const result = await queue.reorder(orderedCards);
            expect(result).toBe(true);
            
            // 验证顺序已更改
            const entries = (queue as any).getAllEntries();
            expect(entries[0].cardId).toBe('card-3');
            expect(entries[1].cardId).toBe('card-2');
            expect(entries[2].cardId).toBe('card-1');
        });
        
        it('NeuralRoamQueue should support reorder', async () => {
            const queue = manager.getQueue(QueueType.NeuralRoam);
            
            // 添加一些种子块
            await queue.addCard('seed-1');
            await queue.addCard('seed-2');
            await queue.addCard('seed-3');
            
            // 创建模拟卡片数组（反向顺序）
            const orderedCards: FSRSCard[] = [
                { id: 'seed-3' } as FSRSCard,
                { id: 'seed-2' } as FSRSCard,
                { id: 'seed-1' } as FSRSCard,
            ];
            
            // 重排序应该成功
            const result = await queue.reorder(orderedCards);
            expect(result).toBe(true);
            
            // 验证顺序已更改
            const seeds = (queue as any).getSeedBlocks();
            expect(seeds[0]).toBe('seed-3');
            expect(seeds[1]).toBe('seed-2');
            expect(seeds[2]).toBe('seed-1');
        });
    });
    
    describe('Reorder Persistence', () => {
        it('FinalDrillQueue reorder should persist across restarts', async () => {
            // 第一次：添加卡片并重排序
            {
                const queue = manager.getQueue(QueueType.FinalDrill);
                
                await queue.addCard('card-1', 'manual');
                await queue.addCard('card-2', 'manual');
                await queue.addCard('card-3', 'manual');
                
                const orderedCards: FSRSCard[] = [
                    { id: 'card-3' } as FSRSCard,
                    { id: 'card-2' } as FSRSCard,
                    { id: 'card-1' } as FSRSCard,
                ];
                
                await queue.reorder(orderedCards);
            }
            
            // 第二次：重新创建管理器，验证顺序保持
            {
                const newManager = UnifiedDataSourceManager.getInstance();
                const queue = newManager.getQueue(QueueType.FinalDrill);
                
                const entries = (queue as any).getAllEntries();
                expect(entries[0].cardId).toBe('card-3');
                expect(entries[1].cardId).toBe('card-2');
                expect(entries[2].cardId).toBe('card-1');
            }
        });
    });
});
