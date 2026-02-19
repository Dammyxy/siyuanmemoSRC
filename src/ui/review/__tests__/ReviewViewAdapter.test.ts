/**
 * Review View Adapter Unit Tests
 * 复习界面适配器单元测试
 * 
 * 测试 ReviewViewAdapter 的核心功能：
 * - 初始化成功场景
 * - next 方法
 * - grade 方法
 * - skip 方法
 * - 观察者注册和取消注册
 * - 资源清理
 * 
 * @see .kiro/specs/unified-data-source-ui-integration/requirements.md - 需求 10.2
 * @see .kiro/specs/unified-data-source-ui-integration/design.md - 复习界面集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReviewViewAdapter } from '../ReviewViewAdapter';
import { ReviewViewController } from '../../../application/controllers/ReviewViewController';
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
    elapsedDays: 5,
    scheduled_days: 10,
    scheduledDays: 10,
    reps: 3,
    lapses: 0,
    last_review: new Date('2023-12-22'),
    lastReview: new Date('2023-12-22'),
    cardType: 'item',
    priority: 5,
    suspended: false,
    tags: ['test'],
    note: 'Test note',
    aFactor: 1.0,
    type: 'item',
    leechCount: 0,
    isLeech: false,
    isManuallyAdded: false,
} as FSRSCard;

describe('ReviewViewAdapter', () => {
    let adapter: ReviewViewAdapter;
    let mockManager: UnifiedDataSourceManager;
    let mockQueue: IReviewQueue;
    let mockController: any;
    
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
        
        // 创建 mock 控制器
        mockController = {
            loadNextCard: vi.fn().mockResolvedValue(undefined),
            getCurrentCard: vi.fn().mockReturnValue(mockCard),
            handleButtonClick: vi.fn().mockResolvedValue(undefined),
        };
        
        // 创建 mock 管理器
        mockManager = {
            registerObserver: vi.fn(),
            unregisterObserver: vi.fn(),
            getQueue: vi.fn().mockReturnValue(mockQueue),
        } as any;
        
        // Mock ReviewViewController 构造函数
        vi.spyOn(ReviewViewController.prototype, 'loadNextCard').mockImplementation(mockController.loadNextCard);
        vi.spyOn(ReviewViewController.prototype, 'getCurrentCard').mockImplementation(mockController.getCurrentCard);
        vi.spyOn(ReviewViewController.prototype, 'handleButtonClick').mockImplementation(mockController.handleButtonClick);
        
        // 创建适配器实例
        adapter = new ReviewViewAdapter(mockManager);
    });
    
    afterEach(() => {
        adapter.destroy();
        vi.restoreAllMocks();
    });
    
    describe('构造函数', () => {
        it('应该成功创建适配器实例', () => {
            expect(adapter).toBeDefined();
            expect(adapter).toBeInstanceOf(ReviewViewAdapter);
        });
        
        it('应该记录创建日志', () => {
            const consoleSpy = vi.spyOn(console, 'log');
            
            const newAdapter = new ReviewViewAdapter(mockManager);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[ReviewViewAdapter] Adapter created'
            );
            
            newAdapter.destroy();
            consoleSpy.mockRestore();
        });
    });

    describe('initializeController - 成功场景', () => {
        it('应该成功初始化控制器', async () => {
            // 验证需求：4.1
            const queueType = 'retrieval-practice' as QueueType;
            
            await adapter.initializeController(queueType);
            
            // 验证观察者已注册
            expect(mockManager.registerObserver).toHaveBeenCalledWith(adapter);
        });
        
        it('应该记录初始化日志', async () => {
            // 验证需求：12.1
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            
            await adapter.initializeController(queueType);
            
            // 验证记录了初始化日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Initializing controller'),
                expect.objectContaining({
                    queueType,
                })
            );
            
            // 验证记录了初始化成功
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Controller initialized successfully'),
                expect.objectContaining({
                    queueType,
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该只注册一次观察者', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            
            // 第一次初始化
            await adapter.initializeController(queueType);
            
            // 清除调用记录
            vi.clearAllMocks();
            
            // 第二次初始化（切换队列）
            await adapter.initializeController('final-drill' as QueueType);
            
            // 验证没有重复注册
            expect(mockManager.registerObserver).not.toHaveBeenCalled();
        });
    });
    
    describe('initializeController - 失败场景', () => {
        it('应该在初始化失败时抛出错误', async () => {
            // 验证需求：8.1
            const queueType = 'retrieval-practice' as QueueType;
            const errorMessage = 'Controller initialization failed';
            
            // 模拟初始化失败
            mockManager.registerObserver = vi.fn().mockImplementation(() => {
                throw new Error(errorMessage);
            });
            
            await expect(adapter.initializeController(queueType)).rejects.toThrow(
                `初始化复习控制器失败 (${queueType}): ${errorMessage}`
            );
        });
        
        it('应该记录详细的错误日志', async () => {
            // 验证需求：8.1, 12.4
            const consoleSpy = vi.spyOn(console, 'error');
            const queueType = 'retrieval-practice' as QueueType;
            const errorMessage = 'Controller initialization failed';
            
            // 模拟初始化失败
            mockManager.registerObserver = vi.fn().mockImplementation(() => {
                throw new Error(errorMessage);
            });
            
            try {
                await adapter.initializeController(queueType);
            } catch (error) {
                // 预期会抛出错误
            }
            
            // 验证记录了错误日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Failed to initialize controller'),
                expect.objectContaining({
                    queueType,
                    error: errorMessage,
                })
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('next - 成功场景', () => {
        it('应该成功获取下一张卡片', async () => {
            // 验证需求：4.2, 5.1
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const card = await adapter.next();
            
            expect(card).toBeDefined();
            expect(card?.id).toBe('fsrs-card-1');
            expect(mockController.loadNextCard).toHaveBeenCalledWith(mockQueue);
        });
        
        it('应该更新当前卡片 ID', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            await adapter.next();
            
            const currentCard = adapter.getCurrentCard();
            expect(currentCard?.id).toBe('fsrs-card-1');
        });
        
        it('应该记录获取卡片日志', async () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            // 清除之前的日志
            consoleSpy.mockClear();
            
            await adapter.next();
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Getting next card')
            );
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Next card: fsrs-card-1')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('当队列为空时应该返回 null', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            // 模拟空队列
            mockController.getCurrentCard = vi.fn().mockReturnValue(null);
            
            const card = await adapter.next();
            
            expect(card).toBeNull();
        });
    });
    
    describe('next - 失败场景', () => {
        it('当控制器未初始化时应该抛出错误', async () => {
            await expect(adapter.next()).rejects.toThrow(
                'Controller not initialized, fallback to useReviewSession'
            );
        });
        
        it('应该在加载失败时抛出错误', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const errorMessage = 'Failed to load card';
            mockController.loadNextCard = vi.fn().mockRejectedValue(new Error(errorMessage));
            
            await expect(adapter.next()).rejects.toThrow(errorMessage);
        });
        
        it('应该记录详细的错误日志', async () => {
            const consoleSpy = vi.spyOn(console, 'error');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const errorMessage = 'Failed to load card';
            mockController.loadNextCard = vi.fn().mockRejectedValue(new Error(errorMessage));
            
            try {
                await adapter.next();
            } catch (error) {
                // 预期会抛出错误
            }
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Failed to get next card'),
                expect.any(Error)
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('grade - 成功场景', () => {
        it('应该成功处理评分', async () => {
            // 验证需求：4.2, 5.2
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            await adapter.grade(3);
            
            expect(mockController.handleButtonClick).toHaveBeenCalledWith({
                type: 'rating',
                label: '3',
                value: 3,
            });
        });
        
        it('应该在评分后更新当前卡片', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            // 模拟评分后返回新卡片
            const nextCard: FSRSCard = {
                ...mockCard,
                id: 'fsrs-card-2',
                blockId: 'test-block-2',
            };
            
            // 重新设置 mock 以返回新卡片
            vi.spyOn(ReviewViewController.prototype, 'getCurrentCard')
                .mockReturnValueOnce(nextCard);
            
            await adapter.grade(3);
            
            const currentCard = adapter.getCurrentCard();
            expect(currentCard?.id).toBe('fsrs-card-2');
        });
        
        it('应该记录评分日志', async () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            // 清除之前的日志
            consoleSpy.mockClear();
            
            await adapter.grade(3);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Grading card fsrs-card-1 with rating 3')
            );
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Card graded, next card:')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该支持所有评分值（1-4）', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            for (const rating of [1, 2, 3, 4]) {
                await adapter.next();
                await adapter.grade(rating);
                
                expect(mockController.handleButtonClick).toHaveBeenCalledWith({
                    type: 'rating',
                    label: String(rating),
                    value: rating,
                });
            }
        });
    });
    
    describe('grade - 失败场景', () => {
        it('当控制器未初始化时应该抛出错误', async () => {
            await expect(adapter.grade(3)).rejects.toThrow(
                'Controller not initialized, fallback to useReviewSession'
            );
        });
        
        it('当没有当前卡片时应该直接返回', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            // 不调用 next()，没有当前卡片
            await adapter.grade(3);
            
            // 不应该调用 handleButtonClick
            expect(mockController.handleButtonClick).not.toHaveBeenCalled();
        });
        
        it('应该在评分失败时抛出错误', async () => {
            // 验证需求：8.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            const errorMessage = 'Failed to grade card';
            
            // 重新设置 mock 以抛出错误
            vi.spyOn(ReviewViewController.prototype, 'handleButtonClick')
                .mockRejectedValueOnce(new Error(errorMessage));
            
            await expect(adapter.grade(3)).rejects.toThrow(
                `评分失败 (卡片 fsrs-card-1, 评分 3): ${errorMessage}`
            );
        });
        
        it('应该记录详细的错误日志', async () => {
            // 验证需求：8.3, 12.4
            const consoleSpy = vi.spyOn(console, 'error');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            const errorMessage = 'Failed to grade card';
            
            // 重新设置 mock 以抛出错误
            vi.spyOn(ReviewViewController.prototype, 'handleButtonClick')
                .mockRejectedValueOnce(new Error(errorMessage));
            
            try {
                await adapter.grade(3);
            } catch (error) {
                // 预期会抛出错误
            }
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Failed to grade card'),
                expect.objectContaining({
                    cardId: 'fsrs-card-1',
                    rating: 3,
                    error: errorMessage,
                })
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('skip - 成功场景', () => {
        it('应该成功处理跳过', async () => {
            // 验证需求：4.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            await adapter.skip();
            
            expect(mockController.handleButtonClick).toHaveBeenCalledWith({
                type: 'action',
                label: '下一个',
                action: 'next',
            });
        });
        
        it('应该在跳过后更新当前卡片', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            // 模拟跳过后返回新卡片
            const nextCard: FSRSCard = {
                ...mockCard,
                id: 'fsrs-card-2',
                blockId: 'test-block-2',
            };
            
            // 重新设置 mock 以返回新卡片
            vi.spyOn(ReviewViewController.prototype, 'getCurrentCard')
                .mockReturnValueOnce(nextCard);
            
            await adapter.skip();
            
            const currentCard = adapter.getCurrentCard();
            expect(currentCard?.id).toBe('fsrs-card-2');
        });
        
        it('应该记录跳过日志', async () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            // 清除之前的日志
            consoleSpy.mockClear();
            
            await adapter.skip();
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Skipping card fsrs-card-1')
            );
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Card skipped, next card:')
            );
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('skip - 失败场景', () => {
        it('当控制器未初始化时应该抛出错误', async () => {
            await expect(adapter.skip()).rejects.toThrow(
                'Controller not initialized, fallback to useReviewSession'
            );
        });
        
        it('当没有当前卡片时应该直接返回', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            // 不调用 next()，没有当前卡片
            await adapter.skip();
            
            // 不应该调用 handleButtonClick
            expect(mockController.handleButtonClick).not.toHaveBeenCalled();
        });
        
        it('应该在跳过失败时抛出错误', async () => {
            // 验证需求：8.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            const errorMessage = 'Failed to skip card';
            
            // 重新设置 mock 以抛出错误
            vi.spyOn(ReviewViewController.prototype, 'handleButtonClick')
                .mockRejectedValueOnce(new Error(errorMessage));
            
            await expect(adapter.skip()).rejects.toThrow(
                `跳过失败 (卡片 fsrs-card-1): ${errorMessage}`
            );
        });
        
        it('应该记录详细的错误日志', async () => {
            // 验证需求：8.3, 12.4
            const consoleSpy = vi.spyOn(console, 'error');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            const errorMessage = 'Failed to skip card';
            
            // 重新设置 mock 以抛出错误
            vi.spyOn(ReviewViewController.prototype, 'handleButtonClick')
                .mockRejectedValueOnce(new Error(errorMessage));
            
            try {
                await adapter.skip();
            } catch (error) {
                // 预期会抛出错误
            }
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Failed to skip card'),
                expect.objectContaining({
                    cardId: 'fsrs-card-1',
                    error: errorMessage,
                })
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('onDataChanged - 观察者接口', () => {
        it('应该响应 card-updated 事件', async () => {
            // 验证需求：3.2, 3.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1', 'test-block-2'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            // 验证记录了事件日志
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Data changed'),
                expect.objectContaining({
                    eventType: 'card-updated',
                    cardIds: ['test-block-1', 'test-block-2'],
                    cardCount: 2,
                })
            );
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Handling card-updated event: 2 cards')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该响应 card-deleted 事件', async () => {
            // 验证需求：3.2, 3.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-deleted',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Handling card-deleted event: 1 cards')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该响应 queue-changed 事件', async () => {
            // 验证需求：3.2, 3.4
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'queue-changed',
                queueType: 'retrieval-practice' as QueueType,
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Handling queue-changed event: retrieval-practice')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该调用数据变更回调函数', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
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
        
        it('当当前卡片被更新时应该记录日志', async () => {
            // 验证需求：3.3, 6.2
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['fsrs-card-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Current card fsrs-card-1 was updated')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('当当前卡片被删除时应该自动跳过', async () => {
            // 验证需求：3.3, 6.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-deleted',
                cardIds: ['fsrs-card-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Current card fsrs-card-1 was deleted, skipping to next')
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('setOnDataChangeCallback', () => {
        it('应该设置数据变更回调函数', async () => {
            const callback = vi.fn();
            
            adapter.setOnDataChangeCallback(callback);
            
            // 初始化并触发事件
            await adapter.initializeController('retrieval-practice' as QueueType);
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: ['test-block-1'],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(callback).toHaveBeenCalledWith(event);
        });
    });
    
    describe('getCurrentCard', () => {
        it('应该返回当前卡片', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            await adapter.next();
            
            const currentCard = adapter.getCurrentCard();
            
            expect(currentCard).toBeDefined();
            expect(currentCard?.id).toBe('fsrs-card-1');
        });
        
        it('当控制器未初始化时应该返回 null', () => {
            const currentCard = adapter.getCurrentCard();
            
            expect(currentCard).toBeNull();
        });
    });
    
    describe('getCurrentQueue', () => {
        it('应该返回当前队列', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const currentQueue = adapter.getCurrentQueue();
            
            expect(currentQueue).toBeDefined();
            expect(currentQueue?.getType()).toBe('retrieval-practice');
        });
        
        it('当控制器未初始化时应该返回 null', () => {
            const currentQueue = adapter.getCurrentQueue();
            
            expect(currentQueue).toBeNull();
        });
    });
    
    describe('destroy - 资源清理', () => {
        it('应该取消注册观察者', async () => {
            // 验证需求：4.4
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            adapter.destroy();
            
            expect(mockManager.unregisterObserver).toHaveBeenCalledWith(adapter);
        });
        
        it('应该记录清理日志', async () => {
            const consoleSpy = vi.spyOn(console, 'log');
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            // 清除之前的日志
            consoleSpy.mockClear();
            
            adapter.destroy();
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[ReviewViewAdapter] Destroying adapter'
            );
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[ReviewViewAdapter] Unregistered as observer'
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该清理引用', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            adapter.destroy();
            
            // 验证清理后无法获取数据
            expect(adapter.getCurrentCard()).toBeNull();
            expect(adapter.getCurrentQueue()).toBeNull();
        });
        
        it('应该只取消注册一次观察者', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
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
    
    describe('边界条件', () => {
        it('应该处理没有 cardIds 的事件', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Data changed'),
                expect.objectContaining({
                    eventType: 'card-updated',
                    cardCount: 0,
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该处理空 cardIds 数组的事件', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'card-updated',
                cardIds: [],
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Data changed'),
                expect.objectContaining({
                    eventType: 'card-updated',
                    cardCount: 0,
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该处理没有 queueType 的 queue-changed 事件', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
            const consoleSpy = vi.spyOn(console, 'log');
            
            const event: DataChangeEvent = {
                type: 'queue-changed',
                timestamp: Date.now(),
            };
            
            adapter.onDataChanged(event);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ReviewViewAdapter] Handling queue-changed event: all')
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该在未初始化时也能处理事件', () => {
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
                expect.stringContaining('[ReviewViewAdapter] Data changed'),
                expect.any(Object)
            );
            
            // 验证仍然调用了回调函数
            expect(callback).toHaveBeenCalledWith(event);
            
            consoleSpy.mockRestore();
        });
        
        it('应该在没有回调函数时也能处理事件', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
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
                expect.stringContaining('[ReviewViewAdapter] Data changed'),
                expect.any(Object)
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该记录所有事件的时间戳', async () => {
            // 验证需求：12.3
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
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
                expect.stringContaining('[ReviewViewAdapter] Data changed'),
                expect.objectContaining({
                    timestamp: new Date(timestamp).toISOString(),
                })
            );
            
            consoleSpy.mockRestore();
        });
        
        it('应该按顺序处理多个事件', async () => {
            const queueType = 'retrieval-practice' as QueueType;
            await adapter.initializeController(queueType);
            
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
