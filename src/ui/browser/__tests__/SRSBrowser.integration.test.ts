/**
 * SRS Browser Integration Tests
 * SRS 浏览器集成测试
 * 
 * 测试 SRSBrowser.vue 组件与 SRSBrowserAdapter 的集成：
 * - 适配器初始化
 * - 数据加载成功场景
 * - 数据加载失败场景
 * - 观察者自动更新
 * 
 * 注意：本测试专注于适配器层面的集成测试，不涉及完整的 Vue 组件渲染。
 * 这样可以避免复杂的 Vue 组件依赖 mock，同时仍然验证核心的集成逻辑。
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 10.1
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - SRS 浏览器集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SRSBrowserAdapter } from '../SRSBrowserAdapter';
import { UnifiedDataSourceManager } from '../../../managers/UnifiedDataSourceManager';
import type { IReviewQueue, QueueType, DataChangeEvent, OperationMode } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';

// Mock 数据
const mockCard: FSRSCard = {
    id: 'fsrs-card-1',
    blockId: 'test-block-1',
    due: new Date('2024-01-01').getTime(),
    state: 2, // Review state
    stability: 10,
    difficulty: 5,
    elapsedDays: 5,
    scheduledDays: 10,
    reps: 3,
    lapses: 0,
    lastReview: new Date('2023-12-22').getTime(),
    priority: 5,
    type: 'item',
    leechCount: 0,
    isLeech: false,
    isSuspended: false,
} as FSRSCard;

describe('SRSBrowser.vue Integration Tests', () => {
    let mockManager: UnifiedDataSourceManager;
    let mockQueue: IReviewQueue;
    let adapter: SRSBrowserAdapter;
    
    beforeEach(() => {
        // 创建 mock 队列
        mockQueue = {
            name: 'retrieval-practice',
            type: 'retrieval-practice' as QueueType,
            getType: vi.fn().mockReturnValue('retrieval-practice'),
            getAllCards: vi.fn().mockResolvedValue([mockCard]),
            getNextCard: vi.fn().mockResolvedValue(mockCard),
            addCard: vi.fn().mockResolvedValue(undefined),
            removeCard: vi.fn().mockResolvedValue(undefined),
            updateCard: vi.fn().mockResolvedValue(undefined),
            handleReview: vi.fn().mockResolvedValue(undefined),
            refresh: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined),
            reorder: vi.fn().mockResolvedValue(true),
            sort: vi.fn().mockResolvedValue(undefined),
            getStats: vi.fn().mockResolvedValue({ size: 1 }),
            isDynamic: vi.fn().mockReturnValue(true),
            isReady: vi.fn().mockReturnValue(true),
            getConfig: vi.fn().mockReturnValue({}),
        } as any;
        
        // 创建 mock 管理器
        mockManager = {
            registerObserver: vi.fn(),
            unregisterObserver: vi.fn(),
            getQueue: vi.fn().mockReturnValue(mockQueue),
            getCurrentMode: vi.fn().mockReturnValue('simple' as OperationMode),
        } as any;
        
        // 创建适配器实例
        adapter = new SRSBrowserAdapter(mockManager);
    });
    
    afterEach(() => {
        adapter.destroy();
        vi.clearAllMocks();
    });

    describe('适配器初始化', () => {
        it('应该成功创建 SRSBrowserAdapter 实例', () => {
            // 验证需求：1.1, 10.1
            expect(adapter).toBeDefined();
            expect(adapter).toBeInstanceOf(SRSBrowserAdapter);
        });
        
        it('应该在初始化队列视图时注册观察者', async () => {
            // 验证需求：3.1, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 验证观察者已注册
            expect(mockManager.registerObserver).toHaveBeenCalledWith(adapter);
        });
        
        it('应该记录初始化日志', async () => {
            // 验证需求：12.1, 10.1
            const consoleSpy = vi.spyOn(console, 'log');
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 验证记录了数据源类型
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SRSBrowserAdapter] Initializing queue view'),
                expect.objectContaining({
                    queueType: 'retrieval-practice',
                    dataSourceMode: 'simple',
                })
            );
            
            // 验证记录了初始化成功
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SRSBrowserAdapter] Queue view initialized successfully'),
                expect.objectContaining({
                    queueType: 'retrieval-practice',
                    dataSourceMode: 'simple',
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该在初始化失败时抛出错误', async () => {
            // 验证需求：8.1, 10.1
            const errorMessage = 'Queue initialization failed';
            
            // 模拟初始化失败
            mockManager.registerObserver = vi.fn().mockImplementation(() => {
                throw new Error(errorMessage);
            });
            
            await expect(adapter.initializeQueueView('retrieval-practice' as QueueType)).rejects.toThrow(
                `初始化队列视图失败 (retrieval-practice): ${errorMessage}`
            );
        });
        
        it('应该在清理时取消注册观察者', async () => {
            // 验证需求：3.5, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            adapter.destroy();
            
            // 验证取消注册观察者
            expect(mockManager.unregisterObserver).toHaveBeenCalledWith(adapter);
        });
    });

    describe('数据加载成功场景', () => {
        it('应该成功加载队列数据', async () => {
            // 验证需求：2.2, 2.3, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            const result = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            // 验证数据加载成功
            expect(result.rows).toBeDefined();
            expect(result.rows.length).toBeGreaterThan(0);
            expect(result.rows[0].blockId).toBe('test-block-1');
        });
        
        it('应该正确转换 FSRSCard 为 BrowserCard', async () => {
            // 验证需求：2.3, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            const result = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            const browserCard = result.rows[0];
            
            // 验证基本字段
            expect(browserCard.blockId).toBe('test-block-1');
            expect(browserCard.fsrsCardId).toBe('fsrs-card-1');
            
            // 验证 FSRS 状态字段
            expect(browserCard.state).toBe(2); // Review state
            expect(browserCard.stateLabel).toBe('复习');
            expect(browserCard.stability).toBe(10);
            expect(browserCard.difficulty).toBe(5);
            expect(browserCard.reps).toBe(3);
            expect(browserCard.lapses).toBe(0);
            
            // 验证自定义属性
            expect(browserCard.priority).toBe(5);
        });
        
        it('应该记录数据加载日志', async () => {
            // 验证需求：12.2, 10.1
            const consoleSpy = vi.spyOn(console, 'log');
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 清除之前的日志
            consoleSpy.mockClear();
            
            await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            // 验证记录了加载开始
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SRSBrowserAdapter] Fetching rows for queue')
            );
            
            // 验证记录了加载完成（包含时间、数据量、耗时）
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SRSBrowserAdapter] Fetched rows successfully'),
                expect.objectContaining({
                    queueType: 'retrieval-practice',
                    cardCount: 1,
                    duration: expect.stringMatching(/\d+ms/),
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('当没有选中队列时应该返回空数组', async () => {
            // 验证需求：2.2, 10.1
            const consoleSpy = vi.spyOn(console, 'warn');
            
            const result = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            expect(result.rows).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SRSBrowserAdapter] No queue type selected'
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('数据加载失败场景', () => {
        it('应该在数据加载失败时抛出错误', async () => {
            // 验证需求：8.2, 10.1
            const consoleSpy = vi.spyOn(console, 'error');
            
            // 模拟数据加载失败
            mockQueue.getCards = vi.fn().mockRejectedValue(new Error('Failed to load cards'));
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 尝试加载数据
            await expect(adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            })).rejects.toThrow('加载卡片数据失败');
            
            // 验证记录了错误日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SRSBrowserAdapter] Failed to fetch rows'),
                expect.objectContaining({
                    error: 'Failed to load cards',
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该记录详细的错误日志', async () => {
            // 验证需求：8.2, 12.4, 10.1
            const consoleSpy = vi.spyOn(console, 'error');
            const errorMessage = 'Network error';
            
            // 模拟数据加载失败
            mockQueue.getCards = vi.fn().mockRejectedValue(new Error(errorMessage));
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            try {
                await adapter.fetchRows({
                    sortModel: [],
                    filterModel: {},
                });
            } catch (error) {
                // 预期会抛出错误
            }
            
            // 验证记录了错误日志（包含错误堆栈和耗时）
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SRSBrowserAdapter] Failed to fetch rows'),
                expect.objectContaining({
                    queueType: 'retrieval-practice',
                    error: errorMessage,
                    duration: expect.stringMatching(/\d+ms/),
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该允许调用者处理错误并保留现有数据', async () => {
            // 验证需求：8.2, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 第一次加载成功
            const result1 = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            expect(result1.rows.length).toBeGreaterThan(0);
            
            // 模拟第二次加载失败
            mockQueue.getCards = vi.fn().mockRejectedValue(new Error('Network error'));
            
            // 尝试加载数据
            try {
                await adapter.fetchRows({
                    sortModel: [],
                    filterModel: {},
                });
                // 不应该到达这里
                expect(true).toBe(false);
            } catch (error) {
                // 预期会抛出错误，调用者可以捕获并保留现有数据
                expect(error).toBeDefined();
                expect((error as Error).message).toContain('加载卡片数据失败');
            }
        });
    });

    describe('观察者自动更新', () => {
        it('应该在卡片更新时触发回调', async () => {
            // 验证需求：3.2, 3.3, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 设置回调函数
            const callback = vi.fn();
            adapter.setOnDataChangeCallback(callback);
            
            // 模拟卡片更新事件
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            // 验证回调被调用
            expect(callback).toHaveBeenCalledWith(event);
        });
        
        it('应该在队列变更时触发回调', async () => {
            // 验证需求：3.4, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 设置回调函数
            const callback = vi.fn();
            adapter.setOnDataChangeCallback(callback);
            
            // 模拟队列变更事件
            const event: DataChangeEvent = {
                type: 'queue-changed',
                queueType: 'retrieval-practice' as QueueType,
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            // 验证回调被调用
            expect(callback).toHaveBeenCalledWith(event);
        });
        
        it('应该在模式切换时触发回调', async () => {
            // 验证需求：1.3, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 设置回调函数
            const callback = vi.fn();
            adapter.setOnDataChangeCallback(callback);
            
            // 模拟模式切换事件
            const event: DataChangeEvent = {
                type: 'mode-switched',
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            // 验证回调被调用
            expect(callback).toHaveBeenCalledWith(event);
        });
        
        it('应该记录观察者通知日志', async () => {
            // 验证需求：12.3, 10.1
            const consoleSpy = vi.spyOn(console, 'log');
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            // 模拟数据变更事件
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1', 'test-block-2'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            // 验证记录了观察者通知日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SRSBrowserAdapter] Data changed'),
                expect.objectContaining({
                    eventType: 'card-updated',
                    cardIds: ['test-block-1', 'test-block-2'],
                    cardCount: 2,
                    timestamp: expect.any(String),
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该处理多个连续的数据变更事件', async () => {
            // 验证需求：3.2, 10.1
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            const callback = vi.fn();
            adapter.setOnDataChangeCallback(callback);
            
            const events: DataChangeEvent[] = [
                { type: 'card-updated', cardIds: ['test-block-1'], timestamp: Date.now() },
                { type: 'card-deleted', cardIds: ['test-block-2'], timestamp: Date.now() },
                { type: 'queue-changed', queueType: 'retrieval-practice' as QueueType, timestamp: Date.now() },
                { type: 'mode-switched', timestamp: Date.now() },
            ];
            
            // 依次处理事件
            events.forEach(event => adapter.onDataChanged(event));
            
            // 验证所有事件都被处理
            expect(callback).toHaveBeenCalledTimes(4);
            expect(callback).toHaveBeenNthCalledWith(1, events[0]);
            expect(callback).toHaveBeenNthCalledWith(2, events[1]);
            expect(callback).toHaveBeenNthCalledWith(3, events[2]);
            expect(callback).toHaveBeenNthCalledWith(4, events[3]);
        });
    });
});
