/**
 * SRS Browser Adapter Unit Tests
 * SRS 浏览器适配器单元测试
 * 
 * 测试 SRSBrowserAdapter 的核心功能：
 * - 初始化成功场景
 * - 初始化失败降级逻辑
 * - fetchRows 方法
 * - 观察者注册和取消注册
 * - 资源清理
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 10.1
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - SRS 浏览器集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SRSBrowserAdapter } from '../SRSBrowserAdapter';
import type { UnifiedDataSourceManager } from '../../../managers/UnifiedDataSourceManager';
import type { IReviewQueue, QueueType, DataChangeEvent } from '../../../types/unified-data-source';
import type { FSRSCard } from '../../../types/card';

// Mock 数据
const mockCard: FSRSCard = {
    id: 'fsrs-card-1',
    riffCardId: 'riff-card-1',
    blockId: 'test-block-1',
    rootId: 'test-root-1',
    deckId: 'test-deck-1',
    content: 'Test card content',
    due: new Date('2024-01-01'),
    state: 2, // Review state
    stability: 10,
    difficulty: 5,
    elapsed_days: 5,
    scheduled_days: 10,
    scheduledDays: 10,
    reps: 3,
    lapses: 0,
    last_review: new Date('2023-12-22'),
    lastReview: new Date('2023-12-22'),
    type: 'item' as any, // CardType enum
    priority: 5,
    suspended: false,
    tags: ['test'],
    note: 'Test note',
    aFactor: 1.0,
    meta: {
        content: 'Test card content',
        deckId: 'test-deck-1',
        rootId: 'test-root-1',
        suspended: false,
        note: 'Test note',
    },
} as FSRSCard;

describe('SRSBrowserAdapter', () => {
    let adapter: SRSBrowserAdapter;
    let mockManager: UnifiedDataSourceManager;
    let mockQueue: IReviewQueue;
    
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
        } as any;
        
        // 创建适配器实例
        adapter = new SRSBrowserAdapter(mockManager);
    });
    
    afterEach(() => {
        adapter.destroy();
    });
    
    describe('构造函数', () => {
        it('应该成功创建适配器实例', () => {
            expect(adapter).toBeDefined();
            expect(adapter).toBeInstanceOf(SRSBrowserAdapter);
        });
        
        it('应该记录创建日志', () => {
            const consoleSpy = vi.spyOn(console, 'log');
            
            const newAdapter = new SRSBrowserAdapter(mockManager);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SiYuanMemo][SRSBrowserAdapter] Adapter created'
            );
            
            newAdapter.destroy();
            consoleSpy.mockRestore();
        });
    });
    
    describe('initializeQueueView - 成功场景', () => {
        it('应该成功初始化队列视图', async () => {
            // 验证需求：1.2, 2.1
            const queueType = 'retrieval-practice' as QueueType;
            
            await adapter.initializeQueueView(queueType);
            
            // 验证观察者已注册
            expect(mockManager.registerObserver).toHaveBeenCalledWith(adapter);
        });
        
        it('应该记录初始化日志', async () => {
            // 验证需求：12.1
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            
            await adapter.initializeQueueView(queueType);
            
            // 验证记录了初始化日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Initializing queue view'),
                expect.objectContaining({
                    queueType,
                })
            );
            
            // 验证记录了初始化成功
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Queue view initialized successfully'),
                expect.objectContaining({
                    queueType,
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该只注册一次观察者', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            
            // 第一次初始化
            await adapter.initializeQueueView(queueType);
            
            // 清除调用记录
            vi.clearAllMocks();
            
            // 第二次初始化（切换队列）
            await adapter.initializeQueueView('final-drill' as QueueType);
            
            // 验证没有重复注册
            expect(mockManager.registerObserver).not.toHaveBeenCalled();
        });
    });
    
    describe('initializeQueueView - 失败场景', () => {
        it('应该在初始化失败时抛出错误', async () => {
            // 验证需求：8.1
            const queueType = 'retrieval-practice' as QueueType;
            const errorMessage = 'Queue initialization failed';
            
            // 模拟初始化失败
            mockManager.registerObserver = vi.fn().mockImplementation(() => {
                throw new Error(errorMessage);
            });
            
            await expect(adapter.initializeQueueView(queueType)).rejects.toThrow(
                `初始化队列视图失败 (${queueType}): ${errorMessage}`
            );
        });
        
        it('应该记录详细的错误日志', async () => {
            // 验证需求：8.1, 12.4
            const consoleSpy = vi.spyOn(console, 'error');
            const queueType = 'retrieval-practice' as QueueType;
            const errorMessage = 'Queue initialization failed';
            
            // 模拟初始化失败
            mockManager.registerObserver = vi.fn().mockImplementation(() => {
                throw new Error(errorMessage);
            });
            
            try {
                await adapter.initializeQueueView(queueType);
            } catch (error) {
                // 预期会抛出错误
            }
            
            // 验证记录了错误日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Failed to initialize queue view'),
                expect.objectContaining({
                    queueType,
                    error: errorMessage,
                })
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('fetchRows - 成功场景', () => {
        it('应该成功获取卡片数据', async () => {
            // 验证需求：2.2, 2.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const result = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            expect(result).toBeDefined();
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].id).toBe('riff-card-1');
            expect(result.rows[0].fsrsCardId).toBe('fsrs-card-1');
            expect(result.rows[0].blockId).toBe('test-block-1');
        });
        
        it('应该正确转换 FSRSCard 为 BrowserCard', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const result = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            const browserCard = result.rows[0];
            
            // 验证基本字段
            expect(browserCard.id).toBe('riff-card-1');
            expect(browserCard.fsrsCardId).toBe('fsrs-card-1');
            expect(browserCard.blockId).toBe('test-block-1');
            expect(browserCard.content).toBeDefined();
            expect(browserCard.fullContent).toBe('Test card content');
            
            // 验证 FSRS 状态字段
            expect(browserCard.state).toBe(2); // Review state
            expect(browserCard.stateLabel).toBe('复习');
            expect(browserCard.stability).toBe(10);
            expect(browserCard.difficulty).toBe(5);
            expect(browserCard.reps).toBe(3);
            expect(browserCard.lapses).toBe(0);
            
            // 验证自定义属性
            expect(browserCard.priority).toBe(5);
            expect(browserCard.suspended).toBe(false);
            expect(browserCard.tags).toEqual(['test']);
            expect(browserCard.cardType).toBe('item');
        });
        
        it('应该记录加载日志', async () => {
            // 验证需求：12.2
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            // 清除之前的日志
            consoleSpy.mockClear();
            
            await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            // 验证记录了加载开始
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Fetching rows for queue')
            );
            
            // 验证记录了加载完成（包含时间、数据量、耗时）
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Fetched rows successfully'),
                expect.objectContaining({
                    queueType,
                    cardCount: 1,
                    duration: expect.stringMatching(/\d+ms/),
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('当没有选中队列时应该返回空数组', async () => {
            const consoleSpy = vi.spyOn(console, 'warn');
            
            const result = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            expect(result.rows).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SiYuanMemo][SRSBrowserAdapter] No queue type selected'
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('fetchRows - 失败场景', () => {
        it('应该在数据加载失败时抛出错误', async () => {
            // 验证需求：8.2
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const errorMessage = 'Failed to load cards';
            mockQueue.getAllCards = vi.fn().mockRejectedValue(new Error(errorMessage));
            
            await expect(adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            })).rejects.toThrow(
                `加载卡片数据失败 (${queueType}): ${errorMessage}`
            );
        });
        
        it('应该记录详细的错误日志', async () => {
            // 验证需求：8.2, 12.4
            const consoleSpy = vi.spyOn(console, 'error');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const errorMessage = 'Failed to load cards';
            mockQueue.getAllCards = vi.fn().mockRejectedValue(new Error(errorMessage));
            
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
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Failed to fetch rows'),
                expect.objectContaining({
                    queueType,
                    error: errorMessage,
                    duration: expect.stringMatching(/\d+ms/),
                })
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('onDataChanged - 观察者接口', () => {
        it('应该响应 card-updated 事件', async () => {
            // 验证需求：3.2, 3.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1', 'test-block-2'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            // 验证记录了事件日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                expect.objectContaining({
                    eventType: 'card-updated',
                    cardIds: ['test-block-1', 'test-block-2'],
                    cardCount: 2,
                })
            );
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-updated event: 2 cards')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该响应 card-deleted 事件', async () => {
            // 验证需求：3.2, 3.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-deleted',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-deleted event: 1 cards')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该响应 queue-changed 事件', async () => {
            // 验证需求：3.2, 3.4
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'queue-changed',
                queueType: 'retrieval-practice' as QueueType,
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling queue-changed event: retrieval-practice')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该调用数据变更回调函数', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            const callback = vi.fn();
            adapter.setOnDataChangeCallback(callback);
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(callback).toHaveBeenCalledWith(event);
        });
    });
    
    describe('setOnDataChangeCallback', () => {
        it('应该设置数据变更回调函数', async () => {
            const callback = vi.fn();
            
            adapter.setOnDataChangeCallback(callback);
            
            // 初始化并触发事件
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(callback).toHaveBeenCalledWith(event);
        });
    });
    
    describe('destroy - 资源清理', () => {
        it('应该取消注册观察者', async () => {
            // 验证需求：3.5
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            adapter.destroy();
            
            expect(mockManager.unregisterObserver).toHaveBeenCalledWith(adapter);
        });
        
        it('应该记录清理日志', async () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            // 清除之前的日志
            consoleSpy.mockClear();
            
            adapter.destroy();
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SiYuanMemo][SRSBrowserAdapter] Destroying adapter'
            );
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SiYuanMemo][SRSBrowserAdapter] Unregistered as observer'
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该清理引用', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            adapter.destroy();
            
            // 验证清理后无法获取数据
            const result = await adapter.fetchRows({
                sortModel: [],
                filterModel: {},
            });
            
            expect(result.rows).toEqual([]);
        });
        
        it('应该只取消注册一次观察者', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeQueueView(queueType);
            
            // 第一次清理
            adapter.destroy();
            
            // 清除调用记录
            vi.clearAllMocks();
            
            // 第二次清理
            adapter.destroy();
            
            // 验证没有重复取消注册
            expect(mockManager.unregisterObserver).not.toHaveBeenCalled();
        });
    });
    
    describe('卡片状态转换', () => {
        it('应该正确转换 New 状态', async () => {
            const newCard: FSRSCard = {
                ...mockCard,
                state: 0, // New
            };
            
            mockQueue.getAllCards = vi.fn().mockResolvedValue([newCard]);
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
            
            expect(result.rows[0].state).toBe(0);
            expect(result.rows[0].stateLabel).toBe('新卡');
        });
        
        it('应该正确转换 Learning 状态', async () => {
            const learningCard: FSRSCard = {
                ...mockCard,
                state: 1, // Learning
            };
            
            mockQueue.getAllCards = vi.fn().mockResolvedValue([learningCard]);
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
            
            expect(result.rows[0].state).toBe(1);
            expect(result.rows[0].stateLabel).toBe('学习中');
        });
        
        it('应该正确转换 Review 状态', async () => {
            const reviewCard: FSRSCard = {
                ...mockCard,
                state: 2, // Review
            };
            
            mockQueue.getAllCards = vi.fn().mockResolvedValue([reviewCard]);
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
            
            expect(result.rows[0].state).toBe(2);
            expect(result.rows[0].stateLabel).toBe('复习');
        });
        
        it('应该正确转换 Relearning 状态', async () => {
            const relearningCard: FSRSCard = {
                ...mockCard,
                state: 3, // Relearning
            };
            
            mockQueue.getAllCards = vi.fn().mockResolvedValue([relearningCard]);
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
            
            expect(result.rows[0].state).toBe(3);
            expect(result.rows[0].stateLabel).toBe('重学');
        });
    });
    
    describe('边界条件', () => {
        it('应该处理空卡片列表', async () => {
            mockQueue.getAllCards = vi.fn().mockResolvedValue([]);
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
            
            expect(result.rows).toEqual([]);
        });
        
        it('应该处理多张卡片', async () => {
            const cards: FSRSCard[] = [
                mockCard,
                { ...mockCard, id: 'fsrs-card-2', riffCardId: 'riff-card-2', blockId: 'test-block-2' },
                { ...mockCard, id: 'fsrs-card-3', riffCardId: 'riff-card-3', blockId: 'test-block-3' },
            ];
            
            mockQueue.getAllCards = vi.fn().mockResolvedValue(cards);
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
            
            expect(result.rows).toHaveLength(3);
            expect(result.rows[0].id).toBe('riff-card-1');
            expect(result.rows[1].id).toBe('riff-card-2');
            expect(result.rows[2].id).toBe('riff-card-3');
        });
        
        it('应该处理缺少可选字段的卡片', async () => {
            const minimalCard: FSRSCard = {
                id: 'fsrs-card-1',
                blockId: 'test-block-1',
                rootId: 'test-root-1',
                due: new Date('2024-01-01'),
                state: 0,
                stability: 0,
                difficulty: 0,
                elapsed_days: 0,
                scheduled_days: 0,
                scheduledDays: 0,
                reps: 0,
                lapses: 0,
                cardType: 'item',
            } as FSRSCard;
            
            mockQueue.getAllCards = vi.fn().mockResolvedValue([minimalCard]);
            
            await adapter.initializeQueueView('retrieval-practice' as QueueType);
            const result = await adapter.fetchRows({ sortModel: [], filterModel: {} });
            
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].priority).toBe(0);
            expect(result.rows[0].suspended).toBe(false);
        });
    });
    
    // ========================================================================
    // Task 1.4: 观察者事件处理测试
    // ========================================================================
    
    describe('Task 1.4: 观察者事件处理测试', () => {
        describe('card-updated 事件处理', () => {
            it('应该处理单个卡片更新事件', async () => {
                // 验证需求：3.3, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-updated',
                    cardIds: ['test-block-1'],
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了事件日志
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'card-updated',
                        cardIds: ['test-block-1'],
                        cardCount: 1,
                    })
                );
                
                // 验证调用了处理方法
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-updated event: 1 cards')
                );
                
                // 验证调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该处理多个卡片更新事件', async () => {
                // 验证需求：3.3, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-updated',
                    cardIds: ['test-block-1', 'test-block-2', 'test-block-3'],
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了正确的卡片数量
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'card-updated',
                        cardCount: 3,
                    })
                );
                
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-updated event: 3 cards')
                );
                
                // 验证调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该处理空卡片列表的更新事件', async () => {
                // 验证需求：3.3, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-updated',
                    cardIds: [],
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了 0 个卡片
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'card-updated',
                        cardCount: 0,
                    })
                );
                
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-updated event: 0 cards')
                );
                
                // 验证仍然调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该处理没有 cardIds 的更新事件', async () => {
                // 验证需求：3.3, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-updated',
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了 0 个卡片
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'card-updated',
                        cardCount: 0,
                    })
                );
                
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-updated event: 0 cards')
                );
                
                // 验证仍然调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
        });
        
        describe('card-deleted 事件处理', () => {
            it('应该处理单个卡片删除事件', async () => {
                // 验证需求：3.3, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-deleted',
                    cardIds: ['test-block-1'],
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了事件日志
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'card-deleted',
                        cardIds: ['test-block-1'],
                        cardCount: 1,
                    })
                );
                
                // 验证调用了处理方法
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-deleted event: 1 cards')
                );
                
                // 验证调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该处理多个卡片删除事件', async () => {
                // 验证需求：3.3, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-deleted',
                    cardIds: ['test-block-1', 'test-block-2'],
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了正确的卡片数量
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'card-deleted',
                        cardCount: 2,
                    })
                );
                
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-deleted event: 2 cards')
                );
                
                // 验证调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该处理空卡片列表的删除事件', async () => {
                // 验证需求：3.3, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-deleted',
                    cardIds: [],
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了 0 个卡片
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'card-deleted',
                        cardCount: 0,
                    })
                );
                
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling card-deleted event: 0 cards')
                );
                
                // 验证仍然调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
        });
        
        describe('queue-changed 事件处理', () => {
            it('应该处理当前队列的变更事件', async () => {
                // 验证需求：3.4, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'queue-changed',
                    queueType: 'retrieval-practice' as QueueType,
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了事件日志
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'queue-changed',
                        queueType: 'retrieval-practice',
                    })
                );
                
                // 验证调用了处理方法
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling queue-changed event: retrieval-practice')
                );
                
                // 验证调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该处理其他队列的变更事件', async () => {
                // 验证需求：3.4, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'queue-changed',
                    queueType: 'final-drill' as QueueType,
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了事件日志
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'queue-changed',
                        queueType: 'final-drill',
                    })
                );
                
                // 验证调用了处理方法
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling queue-changed event: final-drill')
                );
                
                // 验证调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该处理没有指定队列类型的变更事件', async () => {
                // 验证需求：3.4, 10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'queue-changed',
                    timestamp: Date.now(),
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了事件日志（没有 queueType）
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        eventType: 'queue-changed',
                        queueType: undefined,
                    })
                );
                
                // 验证调用了处理方法（显示 'all'）
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Handling queue-changed event: all')
                );
                
                // 验证调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
        });
        
        describe('事件处理的通用行为', () => {
            it('应该在未初始化时也能处理事件', () => {
                // 验证需求：10.3
                const consoleSpy = vi.spyOn(console, 'log');
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const event: DataChangeEvent = {
                    type: 'card-updated',
                    cardIds: ['test-block-1'],
                    timestamp: Date.now(),
                };
                
                // 不应该抛出错误
                expect(() => adapter.onDataChanged(event)).not.toThrow();
                
                // 验证仍然记录了日志
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.any(Object)
                );
                
                // 验证仍然调用了回调函数
                expect(callback).toHaveBeenCalledWith(event);
                
                consoleSpy.mockRestore();
            });
            
            it('应该在没有回调函数时也能处理事件', async () => {
                // 验证需求：10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                
                const event: DataChangeEvent = {
                    type: 'card-updated',
                    cardIds: ['test-block-1'],
                    timestamp: Date.now(),
                };
                
                // 不应该抛出错误
                expect(() => adapter.onDataChanged(event)).not.toThrow();
                
                // 验证仍然记录了日志
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.any(Object)
                );
                
                consoleSpy.mockRestore();
            });
            
            it('应该记录所有事件的时间戳', async () => {
                // 验证需求：12.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const consoleSpy = vi.spyOn(console, 'log');
                
                const timestamp = Date.now();
                const event: DataChangeEvent = {
                    type: 'card-updated',
                    cardIds: ['test-block-1'],
                    timestamp,
                };
                
                adapter.onDataChanged(event);
                
                // 验证记录了时间戳
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[SiYuanMemo][SRSBrowserAdapter] Data changed'),
                    expect.objectContaining({
                        timestamp: new Date(timestamp).toISOString(),
                    })
                );
                
                consoleSpy.mockRestore();
            });
            
            it('应该按顺序处理多个事件', async () => {
                // 验证需求：10.3
                const queueType = 'retrieval-practice' as QueueType;
                await adapter.initializeQueueView(queueType);
                
                const callback = vi.fn();
                adapter.setOnDataChangeCallback(callback);
                
                const events: DataChangeEvent[] = [
                    { type: 'card-updated', cardIds: ['test-block-1'], timestamp: Date.now() },
                    { type: 'card-deleted', cardIds: ['test-block-2'], timestamp: Date.now() },
                    { type: 'queue-changed', queueType: 'retrieval-practice' as QueueType, timestamp: Date.now() },
                ];
                
                // 依次处理事件
                events.forEach(event => adapter.onDataChanged(event));
                
                // 验证所有事件都被处理
                expect(callback).toHaveBeenCalledTimes(3);
                expect(callback).toHaveBeenNthCalledWith(1, events[0]);
                expect(callback).toHaveBeenNthCalledWith(2, events[1]);
                expect(callback).toHaveBeenNthCalledWith(3, events[2]);
            });
        });
    });
});
