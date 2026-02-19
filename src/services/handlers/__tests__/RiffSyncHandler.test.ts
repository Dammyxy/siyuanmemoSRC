/**
 * RiffSyncHandler 单元测试
 * 
 * 测试 Riff 同步处理器的核心功能：
 * 1. 检测 Riff 相关操作
 * 2. 防抖机制
 * 3. 触发增量同步
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiffSyncHandler } from '../RiffSyncHandler';
import type { Transaction } from '../../TransactionWebSocketService';
import type { HybridSyncService } from '../../XiuyuanSyncService';

describe('RiffSyncHandler', () => {
    let handler: RiffSyncHandler;
    let mockHybridSyncService: HybridSyncService;
    let incrementalSyncSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
        // 使用假定时器
        vi.useFakeTimers();
        
        // 创建 mock HybridSyncService
        incrementalSyncSpy = vi.fn().mockResolvedValue({
            success: true,
            addedCount: 0,
            deletedCount: 0,
            skippedCount: 0
        });
        
        mockHybridSyncService = {
            incrementalSync: incrementalSyncSpy
        } as any;
        
        handler = new RiffSyncHandler(mockHybridSyncService);
        
        // Mock console.log to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    
    afterEach(() => {
        handler.dispose();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
    
    describe('检测 Riff 变化', () => {
        it('应该检测 addFlashcards 操作', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'addFlashcards',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
        
        it('应该检测 removeFlashcards 操作', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'removeFlashcards',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
        
        it('应该检测 updateAttrs 中的 custom-riff-decks 变化', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'updateAttrs',
                    id: 'block-123',
                    data: {
                        new: {
                            'custom-riff-decks': '20240101000000-deck123'
                        }
                    }
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
        
        it('应该忽略非 Riff 相关操作', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            expect(incrementalSyncSpy).not.toHaveBeenCalled();
        });
        
        it('应该忽略 updateAttrs 但没有 custom-riff-decks 的操作', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'updateAttrs',
                    id: 'block-123',
                    data: {
                        new: {
                            'custom-other-attr': 'value'
                        }
                    }
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            expect(incrementalSyncSpy).not.toHaveBeenCalled();
        });
    });
    
    describe('防抖机制', () => {
        it('应该在 300ms 后触发同步', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'addFlashcards',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 立即检查，不应该触发
            expect(incrementalSyncSpy).not.toHaveBeenCalled();
            
            // 等待 300ms
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该触发
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
        
        it('应该合并多次连续的变化', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'addFlashcards',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            // 连续触发 3 次
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(100);
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(100);
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 只应该触发一次同步
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
        
        it('应该在防抖期间重置定时器', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'addFlashcards',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(200);
            
            // 在防抖期间再次触发
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(200);
            
            // 此时还不应该触发（总共 400ms，但最后一次触发后只过了 200ms）
            expect(incrementalSyncSpy).not.toHaveBeenCalled();
            
            // 再等 100ms
            await vi.advanceTimersByTimeAsync(100);
            
            // 现在应该触发了
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
    });
    
    describe('错误处理', () => {
        it('应该处理增量同步失败的情况', async () => {
            incrementalSyncSpy.mockRejectedValueOnce(new Error('Sync failed'));
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'addFlashcards',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该调用了 incrementalSync
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
            
            // 等待 Promise 完成
            await vi.waitFor(() => {
                expect(console.error).toHaveBeenCalledWith(
                    '[RiffSync] Incremental sync failed:',
                    expect.any(Error)
                );
            });
        });
    });
    
    describe('资源清理', () => {
        it('应该清理防抖定时器', async () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'addFlashcards',
                    id: 'block-123',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 立即清理
            handler.dispose();
            
            // 等待防抖时间
            await vi.advanceTimersByTimeAsync(300);
            
            // 不应该触发同步
            expect(incrementalSyncSpy).not.toHaveBeenCalled();
        });
    });
    
    describe('批量操作', () => {
        it('应该处理包含多个操作的事务', async () => {
            const transactions: Transaction[] = [{
                doOperations: [
                    {
                        action: 'insert',
                        id: 'block-123',
                        data: {}
                    },
                    {
                        action: 'addFlashcards',
                        id: 'block-456',
                        data: {}
                    },
                    {
                        action: 'update',
                        id: 'block-789',
                        data: {}
                    }
                ],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该触发同步（因为包含 addFlashcards）
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
        
        it('应该处理多个事务', async () => {
            const transactions: Transaction[] = [
                {
                    doOperations: [{
                        action: 'insert',
                        id: 'block-123',
                        data: {}
                    }],
                    undoOperations: null
                },
                {
                    doOperations: [{
                        action: 'addFlashcards',
                        id: 'block-456',
                        data: {}
                    }],
                    undoOperations: null
                }
            ];
            
            handler.handle(transactions);
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该触发同步
            expect(incrementalSyncSpy).toHaveBeenCalledTimes(1);
        });
    });
});
