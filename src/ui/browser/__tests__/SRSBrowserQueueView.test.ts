/**
 * SRS Browser Queue View Tests
 * SRS 浏览器队列视图测试
 * 
 * 测试 SRSBrowserQueueView 组件的核心功能：
 * - 切换队列视图
 * - 加载队列数据
 * - 响应数据变化
 * - 添加卡片到队列
 * - 获取可用队列类型
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md - 需求 16
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SRSBrowserQueueView } from '../SRSBrowserQueueView';
import type { UnifiedDataSourceManager } from '../../../managers/UnifiedDataSourceManager';
import type { IReviewQueue, QueueType, DataChangeEvent } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';
import type { GridApi } from 'ag-grid-community';

// Mock 数据
const mockCard: FSRSCard = {
    blockId: 'test-block-1',
    due: new Date('2024-01-01'),
    state: 2,
    stability: 10,
    difficulty: 5,
    elapsed_days: 5,
    scheduled_days: 10,
    reps: 3,
    lapses: 0,
    last_review: new Date('2023-12-22'),
    cardType: 'item',
} as FSRSCard;

describe('SRSBrowserQueueView', () => {
    let view: SRSBrowserQueueView;
    let mockManager: UnifiedDataSourceManager;
    let mockQueue: IReviewQueue;
    let mockGridApi: GridApi;
    
    beforeEach(() => {
        // 创建 mock 队列
        mockQueue = {
            getType: vi.fn().mockReturnValue('retrieval-practice'),
            getCards: vi.fn().mockResolvedValue([mockCard]),
            addCard: vi.fn().mockResolvedValue(undefined),
            removeCard: vi.fn().mockResolvedValue(undefined),
            handleReview: vi.fn().mockResolvedValue(undefined),
            isDynamic: vi.fn().mockReturnValue(true),
        };
        
        // 创建 mock 管理器
        mockManager = {
            registerObserver: vi.fn(),
            unregisterObserver: vi.fn(),
            getQueue: vi.fn().mockReturnValue(mockQueue),
            getAvailableQueueTypes: vi.fn().mockReturnValue([
                'retrieval-practice',
                'final-drill',
            ]),
        } as any;
        
        // 创建 mock Grid API
        mockGridApi = {
            setRowData: vi.fn(),
        } as any;
        
        // 创建视图实例
        view = new SRSBrowserQueueView(mockManager);
        view.setGridApi(mockGridApi);
    });
    
    afterEach(() => {
        view.destroy();
    });
    
    describe('构造函数', () => {
        it('应该注册为观察者', () => {
            expect(mockManager.registerObserver).toHaveBeenCalledWith(view);
        });
    });
    
    describe('switchToQueueView', () => {
        it('应该切换到指定队列视图并加载数据', async () => {
            // 验证需求：16.1
            const queueType = 'retrieval-practice' as QueueType;
            
            await view.switchToQueueView(queueType);
            
            expect(view.getCurrentQueueType()).toBe(queueType);
            expect(mockManager.getQueue).toHaveBeenCalledWith(queueType);
            expect(mockQueue.getCards).toHaveBeenCalled();
            expect(mockGridApi.setRowData).toHaveBeenCalledWith([mockCard]);
        });
    });
    
    describe('loadQueueData', () => {
        it('应该从队列加载数据并更新 Grid', async () => {
            // 验证需求：16.1, 16.2
            const queueType = 'retrieval-practice' as QueueType;
            await view.switchToQueueView(queueType);
            
            // 清除之前的调用记录
            vi.clearAllMocks();
            
            // 再次加载数据
            await view.loadQueueData();
            
            expect(mockManager.getQueue).toHaveBeenCalledWith(queueType);
            expect(mockQueue.getCards).toHaveBeenCalled();
            expect(mockGridApi.setRowData).toHaveBeenCalledWith([mockCard]);
        });
        
        it('当没有选中队列时应该警告', async () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            await view.loadQueueData();
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SRSBrowserQueueView] No queue type selected'
            );
            
            consoleSpy.mockRestore();
        });
        
        it('当 Grid API 未初始化时应该警告', async () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            // 创建没有 Grid API 的视图
            const viewWithoutGrid = new SRSBrowserQueueView(mockManager);
            await viewWithoutGrid.switchToQueueView('retrieval-practice' as QueueType);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SRSBrowserQueueView] Grid API not initialized'
            );
            
            viewWithoutGrid.destroy();
            consoleSpy.mockRestore();
        });
    });
    
    describe('onDataChanged', () => {
        it('应该在数据变化时自动刷新队列视图', async () => {
            // 验证需求：16.3
            const queueType = 'retrieval-practice' as QueueType;
            await view.switchToQueueView(queueType);
            
            // 清除之前的调用记录
            vi.clearAllMocks();
            
            // 模拟数据变化事件
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            // 调用 onDataChanged
            view.onDataChanged(event);
            
            // 等待异步刷新完成
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockManager.getQueue).toHaveBeenCalledWith(queueType);
            expect(mockQueue.getCards).toHaveBeenCalled();
            expect(mockGridApi.setRowData).toHaveBeenCalledWith([mockCard]);
        });
        
        it('当没有选中队列时不应该刷新', async () => {
            // 模拟数据变化事件
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            // 调用 onDataChanged
            view.onDataChanged(event);
            
            // 等待异步刷新完成
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockManager.getQueue).not.toHaveBeenCalled();
        });
    });
    
    describe('addCardToQueue', () => {
        it('应该添加卡片到当前队列', async () => {
            // 验证需求：16.4
            const queueType = 'retrieval-practice' as QueueType;
            await view.switchToQueueView(queueType);
            
            const cardId = 'test-block-2';
            await view.addCardToQueue(cardId);
            
            expect(mockManager.getQueue).toHaveBeenCalledWith(queueType);
            expect(mockQueue.addCard).toHaveBeenCalledWith(cardId);
        });
        
        it('当没有选中队列时应该抛出错误', async () => {
            await expect(view.addCardToQueue('test-block-2')).rejects.toThrow(
                'No queue type selected'
            );
        });
    });
    
    describe('getAvailableQueueTypes', () => {
        it('应该返回可用队列类型', () => {
            // 验证需求：16.5
            const queueTypes = view.getAvailableQueueTypes();
            
            expect(queueTypes).toEqual([
                'retrieval-practice',
                'final-drill',
            ]);
            expect(mockManager.getAvailableQueueTypes).toHaveBeenCalled();
        });
    });
    
    describe('destroy', () => {
        it('应该取消注册观察者', () => {
            view.destroy();
            
            expect(mockManager.unregisterObserver).toHaveBeenCalledWith(view);
        });
        
        it('应该清理引用', () => {
            view.destroy();
            
            expect(view.getCurrentQueueType()).toBeNull();
        });
    });
    
    describe('集成测试', () => {
        it('应该在复习队列中修改卡片后自动更新浏览器视图', async () => {
            // 验证需求：16.3
            const queueType = 'retrieval-practice' as QueueType;
            await view.switchToQueueView(queueType);
            
            // 清除之前的调用记录
            vi.clearAllMocks();
            
            // 模拟卡片在复习队列中被修改
            const updatedCard: FSRSCard = {
                ...mockCard,
                due: new Date('2024-01-10'),
            };
            mockQueue.getCards = vi.fn().mockResolvedValue([updatedCard]);
            
            // 触发数据变化事件
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: [mockCard.blockId],
                timestamp: Date.now(),
            };
            view.onDataChanged(event);
            
            // 等待异步刷新完成
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // 验证浏览器视图已更新
            expect(mockGridApi.setRowData).toHaveBeenCalledWith([updatedCard]);
        });
        
        it('应该在从浏览器添加卡片后立即反映到复习队列', async () => {
            // 验证需求：16.4
            const queueType = 'final-drill' as QueueType;
            await view.switchToQueueView(queueType);
            
            const newCardId = 'test-block-3';
            
            // 添加卡片
            await view.addCardToQueue(newCardId);
            
            // 验证队列已更新
            expect(mockQueue.addCard).toHaveBeenCalledWith(newCardId);
        });
    });
});
