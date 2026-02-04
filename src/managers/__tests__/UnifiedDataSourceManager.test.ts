/**
 * UnifiedDataSourceManager 单元测试
 * 
 * 测试统一数据源管理器的核心功能。
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fc from 'fast-check';
import { UnifiedDataSourceManager } from '../UnifiedDataSourceManager';
import { OperationMode, IDataSourceObserver } from '../../types/unified-data-source';

describe('UnifiedDataSourceManager', () => {
    // 在每个测试前重置单例实例
    beforeEach(() => {
        UnifiedDataSourceManager.resetInstance();
    });
    
    // 在所有测试后清理
    afterAll(() => {
        UnifiedDataSourceManager.resetInstance();
    });
    
    // 创建模拟路由器的辅助函数
    const createMockRouters = () => {
        const mockSimpleRouter = {
            getCard: vi.fn(),
            getCards: vi.fn().mockResolvedValue([]),
            updateCard: vi.fn(),
            deleteCard: vi.fn(),
            getAvailableQueueTypes: vi.fn(),
            getContextMenuOptions: vi.fn(),
        };
        
        const mockAdvancedRouter = {
            getCard: vi.fn(),
            getCards: vi.fn().mockResolvedValue([]),
            updateCard: vi.fn(),
            deleteCard: vi.fn(),
            getAvailableQueueTypes: vi.fn(),
            getContextMenuOptions: vi.fn(),
        };
        
        return { mockSimpleRouter, mockAdvancedRouter };
    };
    
    describe('单例模式', () => {
        it('应该返回相同的实例', () => {
            // 验证需求 1.4：单例模式
            const instance1 = UnifiedDataSourceManager.getInstance();
            const instance2 = UnifiedDataSourceManager.getInstance();
            
            expect(instance1).toBe(instance2);
        });
        
        it('多次调用 getInstance() 应该返回相同的实例', () => {
            // 验证需求 1.4：单例模式
            const instances = Array.from({ length: 10 }, () => 
                UnifiedDataSourceManager.getInstance()
            );
            
            // 所有实例应该相同
            const firstInstance = instances[0];
            instances.forEach(instance => {
                expect(instance).toBe(firstInstance);
            });
        });
        
        it('resetInstance() 后应该创建新实例', () => {
            // 这是测试辅助功能，不是需求的一部分
            const instance1 = UnifiedDataSourceManager.getInstance();
            
            UnifiedDataSourceManager.resetInstance();
            
            const instance2 = UnifiedDataSourceManager.getInstance();
            
            expect(instance1).not.toBe(instance2);
        });
    });
    
    describe('属性测试：单例模式', () => {
        /**
         * 属性 3：单例模式
         * 
         * **Validates: Requirements 1.4**
         * 
         * 对于任何调用序列，多次调用 UnifiedDataSourceManager.getInstance() 
         * 应该返回相同的实例。
         * 
         * 这个属性测试验证：
         * 1. 无论调用 getInstance() 多少次（1-100次）
         * 2. 所有返回的实例都应该是同一个对象引用
         * 3. 这确保了单例模式的正确性
         */
        it('Feature: unified-data-source-architecture, Property 3: 对于任何调用序列，多次调用 UnifiedDataSourceManager.getInstance() 应该返回相同的实例', () => {
            fc.assert(
                fc.property(
                    // 生成一个随机的调用次数（1-100次）
                    fc.integer({ min: 1, max: 100 }),
                    (callCount) => {
                        // 重置实例以确保测试独立性
                        UnifiedDataSourceManager.resetInstance();
                        
                        // 调用 getInstance() callCount 次
                        const instances: UnifiedDataSourceManager[] = [];
                        for (let i = 0; i < callCount; i++) {
                            instances.push(UnifiedDataSourceManager.getInstance());
                        }
                        
                        // 验证：所有实例都应该是同一个对象
                        const firstInstance = instances[0];
                        for (let i = 1; i < instances.length; i++) {
                            expect(instances[i]).toBe(firstInstance);
                        }
                        
                        // 额外验证：所有实例的引用地址都相同
                        const uniqueInstances = new Set(instances);
                        expect(uniqueInstances.size).toBe(1);
                    }
                ),
                { numRuns: 100 } // 运行 100 次测试
            );
        });
    });
    
    describe('初始化', () => {
        it('应该初始化为简单模式', () => {
            // 验证需求 1.1：默认模式
            const manager = UnifiedDataSourceManager.getInstance();
            
            expect(manager.getCurrentMode()).toBe(OperationMode.Simple);
        });
        
        it('应该初始化空的观察者集合', () => {
            // 验证需求 14.1：观察者管理
            const manager = UnifiedDataSourceManager.getInstance();
            
            // 创建一个测试观察者
            const observer: IDataSourceObserver = {
                onDataChanged: vi.fn(),
            };
            
            // 注册观察者应该成功（不抛出错误）
            expect(() => {
                manager.registerObserver(observer);
            }).not.toThrow();
        });
    });
    
    describe('模式管理', () => {
        it('getCurrentMode() 应该返回当前模式', () => {
            // 验证需求 1.1, 1.2：模式管理
            const manager = UnifiedDataSourceManager.getInstance();
            
            expect(manager.getCurrentMode()).toBe(OperationMode.Simple);
        });
        
        it('switchMode() 应该更新当前模式', async () => {
            // 验证需求 4.1：模式切换
            const manager = UnifiedDataSourceManager.getInstance();
            const { mockSimpleRouter, mockAdvancedRouter } = createMockRouters();
            
            // 初始化路由器
            manager.initializeRouters(mockSimpleRouter as any, mockAdvancedRouter as any);
            
            await manager.switchMode(OperationMode.Advanced);
            
            expect(manager.getCurrentMode()).toBe(OperationMode.Advanced);
        });
        
        it('switchMode() 从简单模式切换到高级模式应该触发增量同步', async () => {
            // 验证需求 4.1：简单→高级触发增量同步
            const manager = UnifiedDataSourceManager.getInstance();
            const { mockSimpleRouter, mockAdvancedRouter } = createMockRouters();
            
            // 初始化路由器
            manager.initializeRouters(mockSimpleRouter as any, mockAdvancedRouter as any);
            
            await manager.switchMode(OperationMode.Advanced);
            
            // 验证调用了 getCards 进行同步
            expect(mockSimpleRouter.getCards).toHaveBeenCalled();
            expect(mockAdvancedRouter.getCards).toHaveBeenCalled();
        });
        
        it('switchMode() 从高级模式切换到简单模式应该切换数据源', async () => {
            // 验证需求 4.2：高级→简单切换数据源
            const manager = UnifiedDataSourceManager.getInstance();
            const { mockSimpleRouter, mockAdvancedRouter } = createMockRouters();
            
            // 初始化路由器
            manager.initializeRouters(mockSimpleRouter as any, mockAdvancedRouter as any);
            
            // 先切换到高级模式
            await manager.switchMode(OperationMode.Advanced);
            expect(manager.getCurrentMode()).toBe(OperationMode.Advanced);
            
            // 再切换回简单模式
            await manager.switchMode(OperationMode.Simple);
            expect(manager.getCurrentMode()).toBe(OperationMode.Simple);
        });
        
        it('switchMode() 切换到相同模式应该直接返回', async () => {
            // 验证优化：相同模式不执行切换
            const manager = UnifiedDataSourceManager.getInstance();
            const { mockSimpleRouter, mockAdvancedRouter } = createMockRouters();
            
            // 初始化路由器
            manager.initializeRouters(mockSimpleRouter as any, mockAdvancedRouter as any);
            
            // 当前已经是简单模式，再次切换到简单模式
            await manager.switchMode(OperationMode.Simple);
            
            // 不应该调用 getCards（没有同步）
            expect(mockSimpleRouter.getCards).not.toHaveBeenCalled();
        });
        
        it('switchMode() 失败时应该回滚到原模式', async () => {
            // 验证需求 4.1：错误处理和回滚机制
            const manager = UnifiedDataSourceManager.getInstance();
            const { mockSimpleRouter, mockAdvancedRouter } = createMockRouters();
            
            // 模拟同步失败
            mockSimpleRouter.getCards.mockRejectedValue(new Error('Sync failed'));
            
            // 初始化路由器
            manager.initializeRouters(mockSimpleRouter as any, mockAdvancedRouter as any);
            
            // 尝试切换模式
            await expect(manager.switchMode(OperationMode.Advanced)).rejects.toThrow('模式切换失败');
            
            // 验证模式已回滚
            expect(manager.getCurrentMode()).toBe(OperationMode.Simple);
        });
    });
    
    describe('属性测试：观察者通知', () => {
        /**
         * 属性 4：模式切换观察者通知
         * 
         * **Validates: Requirements 4.3**
         * 
         * 对于任何已注册的观察者集合，当模式切换完成时，所有观察者都应该收到通知。
         * 
         * 这个属性测试验证：
         * 1. 生成随机数量的观察者（0-20个）
         * 2. 注册所有观察者
         * 3. 执行模式切换
         * 4. 验证所有观察者都收到了 'mode-switched' 类型的通知
         * 
         * 注意：如果目标模式与当前模式相同，不会触发通知（优化）
         */
        it('Feature: unified-data-source-architecture, Property 4: 对于任何已注册的观察者集合，当模式切换完成时，所有观察者都应该收到通知', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // 生成随机数量的观察者（0-20个）
                    fc.integer({ min: 0, max: 20 }),
                    // 生成随机的目标模式
                    fc.constantFrom(OperationMode.Simple, OperationMode.Advanced),
                    async (observerCount, targetMode) => {
                        // 重置实例以确保测试独立性
                        UnifiedDataSourceManager.resetInstance();
                        const manager = UnifiedDataSourceManager.getInstance();
                        
                        // 初始化路由器
                        const { mockSimpleRouter, mockAdvancedRouter } = createMockRouters();
                        manager.initializeRouters(mockSimpleRouter as any, mockAdvancedRouter as any);
                        
                        // 创建观察者集合
                        const observers: IDataSourceObserver[] = [];
                        for (let i = 0; i < observerCount; i++) {
                            observers.push({
                                onDataChanged: vi.fn(),
                            });
                        }
                        
                        // 注册所有观察者
                        observers.forEach(observer => {
                            manager.registerObserver(observer);
                        });
                        
                        // 获取当前模式
                        const currentMode = manager.getCurrentMode();
                        
                        // 执行模式切换
                        await manager.switchMode(targetMode);
                        
                        // 如果目标模式与当前模式相同，不会触发通知（优化）
                        if (targetMode === currentMode) {
                            // 验证：所有观察者都不应该收到通知
                            observers.forEach(observer => {
                                expect(observer.onDataChanged).not.toHaveBeenCalled();
                            });
                        } else {
                            // 验证：所有观察者都应该收到通知
                            observers.forEach(observer => {
                                expect(observer.onDataChanged).toHaveBeenCalled();
                                
                                // 验证通知的事件类型是 'mode-switched'
                                const calls = (observer.onDataChanged as any).mock.calls;
                                const hasModeSwitchedEvent = calls.some((call: any[]) => {
                                    const event = call[0];
                                    return event && event.type === 'mode-switched';
                                });
                                
                                expect(hasModeSwitchedEvent).toBe(true);
                            });
                        }
                    }
                ),
                { numRuns: 100 } // 运行 100 次测试
            );
        });
        
        /**
         * 属性 20：数据变更观察者通知
         * 
         * **Validates: Requirements 11.1, 11.2, 14.3, 14.4**
         * 
         * 对于任何数据变更和任何已注册的观察者集合，所有观察者都应该收到包含变更信息的通知。
         * 
         * 这个属性测试验证：
         * 1. 生成随机数量的观察者（0-20个）
         * 2. 注册所有观察者
         * 3. 生成随机的数据变更事件
         * 4. 通知观察者
         * 5. 验证所有观察者都收到了正确的通知，包含完整的变更信息
         */
        it('Feature: unified-data-source-architecture, Property 20: 对于任何数据变更和任何已注册的观察者集合，所有观察者都应该收到包含变更信息的通知', () => {
            fc.assert(
                fc.property(
                    // 生成随机数量的观察者（0-20个）
                    fc.integer({ min: 0, max: 20 }),
                    // 生成随机的数据变更事件
                    fc.oneof(
                        // card-updated 事件
                        fc.record({
                            type: fc.constant('card-updated' as const),
                            cardIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
                            timestamp: fc.integer({ min: 0, max: Date.now() }),
                        }),
                        // card-deleted 事件
                        fc.record({
                            type: fc.constant('card-deleted' as const),
                            cardIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
                            timestamp: fc.integer({ min: 0, max: Date.now() }),
                        }),
                        // queue-changed 事件
                        fc.record({
                            type: fc.constant('queue-changed' as const),
                            queueType: fc.constantFrom(
                                'retrieval-practice' as const,
                                'final-drill' as const,
                                'incremental-learning' as const,
                                'filter-group' as const,
                                'neural-roam' as const
                            ),
                            timestamp: fc.integer({ min: 0, max: Date.now() }),
                        }),
                        // mode-switched 事件
                        fc.record({
                            type: fc.constant('mode-switched' as const),
                            timestamp: fc.integer({ min: 0, max: Date.now() }),
                        })
                    ),
                    (observerCount, event) => {
                        // 重置实例以确保测试独立性
                        UnifiedDataSourceManager.resetInstance();
                        const manager = UnifiedDataSourceManager.getInstance();
                        
                        // 创建观察者集合
                        const observers: IDataSourceObserver[] = [];
                        for (let i = 0; i < observerCount; i++) {
                            observers.push({
                                onDataChanged: vi.fn(),
                            });
                        }
                        
                        // 注册所有观察者
                        observers.forEach(observer => {
                            manager.registerObserver(observer);
                        });
                        
                        // 通知观察者
                        manager.notifyObservers(event);
                        
                        // 验证：所有观察者都应该收到通知
                        observers.forEach(observer => {
                            expect(observer.onDataChanged).toHaveBeenCalledWith(event);
                            expect(observer.onDataChanged).toHaveBeenCalledTimes(1);
                        });
                        
                        // 验证：事件包含必要的变更信息
                        expect(event.type).toBeDefined();
                        expect(event.timestamp).toBeDefined();
                        
                        // 根据事件类型验证特定字段
                        if (event.type === 'card-updated' || event.type === 'card-deleted') {
                            expect(event.cardIds).toBeDefined();
                            expect(Array.isArray(event.cardIds)).toBe(true);
                            expect(event.cardIds!.length).toBeGreaterThan(0);
                        } else if (event.type === 'queue-changed') {
                            expect(event.queueType).toBeDefined();
                        }
                    }
                ),
                { numRuns: 100 } // 运行 100 次测试
            );
        });
    });
    
    describe('观察者管理', () => {
        it('应该能够注册观察者', () => {
            // 验证需求 14.1：注册观察者
            const manager = UnifiedDataSourceManager.getInstance();
            const observer: IDataSourceObserver = {
                onDataChanged: vi.fn(),
            };
            
            expect(() => {
                manager.registerObserver(observer);
            }).not.toThrow();
        });
        
        it('应该能够取消注册观察者', () => {
            // 验证需求 14.2：取消注册观察者
            const manager = UnifiedDataSourceManager.getInstance();
            const observer: IDataSourceObserver = {
                onDataChanged: vi.fn(),
            };
            
            manager.registerObserver(observer);
            
            expect(() => {
                manager.unregisterObserver(observer);
            }).not.toThrow();
        });
        
        it('应该能够注册多个观察者', () => {
            // 验证需求 14.1：注册多个观察者
            const manager = UnifiedDataSourceManager.getInstance();
            const observer1: IDataSourceObserver = {
                onDataChanged: vi.fn(),
            };
            const observer2: IDataSourceObserver = {
                onDataChanged: vi.fn(),
            };
            const observer3: IDataSourceObserver = {
                onDataChanged: vi.fn(),
            };
            
            expect(() => {
                manager.registerObserver(observer1);
                manager.registerObserver(observer2);
                manager.registerObserver(observer3);
            }).not.toThrow();
        });
        
        it('不应该重复注册同一个观察者', () => {
            // 验证观察者集合的唯一性
            const manager = UnifiedDataSourceManager.getInstance();
            const observer: IDataSourceObserver = {
                onDataChanged: vi.fn(),
            };
            
            manager.registerObserver(observer);
            manager.registerObserver(observer); // 重复注册
            
            // 由于使用 Set，重复注册不会导致错误
            // 这是预期行为
            expect(() => {
                manager.unregisterObserver(observer);
            }).not.toThrow();
        });
        
        it('应该通知所有已注册的观察者', () => {
            // 验证需求 14.3：通知观察者
            const manager = UnifiedDataSourceManager.getInstance();
            const observer1 = { onDataChanged: vi.fn() };
            const observer2 = { onDataChanged: vi.fn() };
            const observer3 = { onDataChanged: vi.fn() };
            
            manager.registerObserver(observer1);
            manager.registerObserver(observer2);
            manager.registerObserver(observer3);
            
            const event = {
                type: 'card-updated' as const,
                cardIds: ['card-1'],
                timestamp: Date.now(),
            };
            
            manager.notifyObservers(event);
            
            // 所有观察者都应该收到通知
            expect(observer1.onDataChanged).toHaveBeenCalledWith(event);
            expect(observer2.onDataChanged).toHaveBeenCalledWith(event);
            expect(observer3.onDataChanged).toHaveBeenCalledWith(event);
        });
        
        it('应该在观察者通知中包含错误处理', () => {
            // 验证需求 14.3：错误处理
            const manager = UnifiedDataSourceManager.getInstance();
            
            // 创建一个会抛出错误的观察者
            const failingObserver = {
                onDataChanged: vi.fn(() => {
                    throw new Error('Observer error');
                }),
            };
            
            // 创建正常的观察者
            const normalObserver = {
                onDataChanged: vi.fn(),
            };
            
            manager.registerObserver(failingObserver);
            manager.registerObserver(normalObserver);
            
            const event = {
                type: 'card-updated' as const,
                cardIds: ['card-1'],
                timestamp: Date.now(),
            };
            
            // 通知不应该抛出错误
            expect(() => {
                manager.notifyObservers(event);
            }).not.toThrow();
            
            // 失败的观察者应该被调用
            expect(failingObserver.onDataChanged).toHaveBeenCalledWith(event);
            
            // 正常的观察者也应该被调用（不受失败观察者影响）
            expect(normalObserver.onDataChanged).toHaveBeenCalledWith(event);
        });
        
        it('应该继续通知其他观察者即使某个观察者失败', () => {
            // 验证需求 14.3：错误隔离
            const manager = UnifiedDataSourceManager.getInstance();
            
            const observer1 = { onDataChanged: vi.fn() };
            const observer2 = {
                onDataChanged: vi.fn(() => {
                    throw new Error('Observer 2 failed');
                }),
            };
            const observer3 = { onDataChanged: vi.fn() };
            
            manager.registerObserver(observer1);
            manager.registerObserver(observer2);
            manager.registerObserver(observer3);
            
            const event = {
                type: 'card-updated' as const,
                cardIds: ['card-1'],
                timestamp: Date.now(),
            };
            
            manager.notifyObservers(event);
            
            // 所有观察者都应该被调用
            expect(observer1.onDataChanged).toHaveBeenCalledWith(event);
            expect(observer2.onDataChanged).toHaveBeenCalledWith(event);
            expect(observer3.onDataChanged).toHaveBeenCalledWith(event);
        });
        
        it('取消注册后不应该收到通知', () => {
            // 验证需求 14.2：取消注册效果
            const manager = UnifiedDataSourceManager.getInstance();
            const observer = { onDataChanged: vi.fn() };
            
            manager.registerObserver(observer);
            manager.unregisterObserver(observer);
            
            const event = {
                type: 'card-updated' as const,
                cardIds: ['card-1'],
                timestamp: Date.now(),
            };
            
            manager.notifyObservers(event);
            
            // 观察者不应该收到通知
            expect(observer.onDataChanged).not.toHaveBeenCalled();
        });
        
        it('应该处理不同类型的数据变更事件', () => {
            // 验证需求 14.4：提供变更上下文
            const manager = UnifiedDataSourceManager.getInstance();
            const observer = { onDataChanged: vi.fn() };
            
            manager.registerObserver(observer);
            
            // 测试不同类型的事件
            const events = [
                { type: 'card-updated' as const, cardIds: ['card-1'], timestamp: Date.now() },
                { type: 'card-deleted' as const, cardIds: ['card-2'], timestamp: Date.now() },
                { type: 'queue-changed' as const, queueType: 'retrieval-practice' as const, timestamp: Date.now() },
                { type: 'mode-switched' as const, timestamp: Date.now() },
            ];
            
            events.forEach(event => {
                manager.notifyObservers(event);
            });
            
            // 观察者应该收到所有事件
            expect(observer.onDataChanged).toHaveBeenCalledTimes(4);
            events.forEach(event => {
                expect(observer.onDataChanged).toHaveBeenCalledWith(event);
            });
        });
    });
});
