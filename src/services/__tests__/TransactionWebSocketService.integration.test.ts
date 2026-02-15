/**
 * TransactionWebSocketService 集成测试
 * 
 * 测试端到端的卡片创建流程：
 * 1. WebSocket 连接和事件分发
 * 2. Riff 同步流程
 * 3. 快速符号制卡流程
 * 4. 列表模版制卡流程
 * 5. 错误处理和重连
 * 
 * @see .kiro/specs/quick-card-symbols/tasks.md - Task 4.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransactionWebSocketService, type Transaction } from '../TransactionWebSocketService';
import { RiffSyncHandler } from '../handlers/RiffSyncHandler';
import { AutoCardHandler } from '../handlers/AutoCardHandler';
import type FSRSPlugin from '@/index';
import { STORAGE_NAME } from '@/types';

// Mock WebSocket
class MockWebSocket {
    public onopen: ((event: Event) => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onclose: ((event: CloseEvent) => void) | null = null;
    public readyState: number = 0; // CONNECTING
    
    constructor(public url: string) {
        // Simulate connection opening
        setTimeout(() => {
            this.readyState = 1; // OPEN
            if (this.onopen) {
                this.onopen({} as Event);
            }
        }, 10);
    }
    
    close(code?: number, reason?: string) {
        this.readyState = 3; // CLOSED
        if (this.onclose) {
            this.onclose({ code: code || 1000, reason: reason || '' } as CloseEvent);
        }
    }
    
    send(data: string) {}
}

// Mock global WebSocket
global.WebSocket = MockWebSocket as any;

// Mock 思源 API
vi.mock('@/core/siyuan/api', () => ({
    getBlockKramdown: vi.fn(),
    sql: vi.fn(),
    pushMsg: vi.fn(),
    pushErrMsg: vi.fn()
}));

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
    addRiffCards: vi.fn().mockResolvedValue(undefined),
    BUILTIN_DECK_ID: 'builtin-deck-id'
}));

// Mock Block API
vi.mock('@/core/siyuan/block', () => ({
    markBlockAsCard: vi.fn().mockResolvedValue(undefined)
}));

// Mock Card Types
vi.mock('@/types/card', () => ({
    createDefaultCard: vi.fn((blockId: string) => ({
        id: `card-${blockId}`,
        blockId,
        priority: 1,
        meta: {},
        type: 0
    })),
    CardType: {
        Topic: 1
    }
}));

describe('TransactionWebSocketService Integration Tests', () => {
    let service: TransactionWebSocketService;
    let riffSyncHandler: RiffSyncHandler;
    let autoCardHandler: AutoCardHandler;
    let mockPlugin: FSRSPlugin;
    let mockStorage: any;
    let mockXiuyuanService: any;
    let mockHybridSyncService: any;
    
    beforeEach(() => {
        // 使用假定时器
        vi.useFakeTimers();
        
        // 创建 mock storage
        mockStorage = {
            getCardByBlockId: vi.fn(),
            setCard: vi.fn(),
            saveCards: vi.fn().mockResolvedValue(undefined)
        };
        
        // 创建 mock xiuyuan service
        mockXiuyuanService = {
            createFromBlocks: vi.fn().mockResolvedValue({
                ok: true,
                value: { cards: [{ id: 'xiuyuan-card-1' }] }
            })
        };
        
        // 创建 mock hybrid sync service
        mockHybridSyncService = {
            incrementalSync: vi.fn().mockResolvedValue({
                success: true,
                addedCount: 0,
                deletedCount: 0,
                skippedCount: 0
            })
        };
        
        // 创建 mock plugin
        mockPlugin = {
            storage: mockStorage,
            xiuyuanService: mockXiuyuanService,
            data: {
                [STORAGE_NAME]: {
                    quickCard: {
                        enabled: true,
                        enabledSymbols: {
                            basic: true,
                            concept: true,
                            descriptor: true,
                            cloze: true,
                            multiLine: true
                        },
                        debounceDelay: {
                            quick: 300,
                            list: 2000
                        }
                    }
                }
            }
        } as any;
        
        // 创建服务和处理器
        service = new TransactionWebSocketService(mockPlugin);
        riffSyncHandler = new RiffSyncHandler(mockHybridSyncService);
        autoCardHandler = new AutoCardHandler(mockPlugin);
        
        // 注册处理器
        service.registerHandler(riffSyncHandler);
        service.registerHandler(autoCardHandler);
        
        // Mock console to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    
    afterEach(() => {
        service.stop();
        riffSyncHandler.dispose();
        autoCardHandler.dispose();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    describe('4.3.1 测试 WebSocket 连接和分发', () => {
        it('应该成功建立 WebSocket 连接', async () => {
            service.start();
            
            // 等待连接建立
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            expect(ws).toBeTruthy();
            expect(ws.readyState).toBe(1); // OPEN
        });
        
        it('应该将 transactions 事件分发给所有处理器', async () => {
            const riffSyncSpy = vi.spyOn(riffSyncHandler, 'handle');
            const autoCardSpy = vi.spyOn(autoCardHandler, 'handle');
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            // 模拟 WebSocket 消息
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-1',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // 两个处理器都应该收到事件
            expect(riffSyncSpy).toHaveBeenCalledWith(transactions);
            expect(autoCardSpy).toHaveBeenCalledWith(transactions);
        });
        
        it('应该忽略非 transactions 命令', async () => {
            const riffSyncSpy = vi.spyOn(riffSyncHandler, 'handle');
            const autoCardSpy = vi.spyOn(autoCardHandler, 'handle');
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'other-command',
                        data: {}
                    })
                } as MessageEvent);
            }
            
            // 处理器不应该被调用
            expect(riffSyncSpy).not.toHaveBeenCalled();
            expect(autoCardSpy).not.toHaveBeenCalled();
        });
    });


    describe('4.3.2 测试 Riff 同步流程', () => {
        it('应该检测 addFlashcards 并触发增量同步', async () => {
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'addFlashcards',
                    id: 'block-riff-1',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // 等待防抖（300ms）
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该触发增量同步
            expect(mockHybridSyncService.incrementalSync).toHaveBeenCalledTimes(1);
        });
        
        it('应该检测 removeFlashcards 并触发增量同步', async () => {
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'removeFlashcards',
                    id: 'block-riff-2',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockHybridSyncService.incrementalSync).toHaveBeenCalledTimes(1);
        });
        
        it('应该检测 custom-riff-decks 变化并触发增量同步', async () => {
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'updateAttrs',
                    id: 'block-riff-3',
                    data: {
                        new: {
                            'custom-riff-decks': '20240101000000-deck123'
                        }
                    }
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockHybridSyncService.incrementalSync).toHaveBeenCalledTimes(1);
        });
    });


    describe('4.3.3 测试快速符号制卡流程', () => {
        it('应该端到端创建正向卡片 (>>)', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '什么是FSRS？ >> 一种间隔重复算法'
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-quick-1',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // 等待快速符号防抖（300ms）
            await vi.advanceTimersByTimeAsync(300);
            
            // 验证卡片创建
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.direction).toBe('forward');
            expect(card.meta.symbolType).toBe('>>');
            
            // 验证添加到 Riff
            const { addRiffCards } = await import('@/core/siyuan/riff');
            expect(addRiffCards).toHaveBeenCalledWith('builtin-deck-id', ['block-quick-1']);
            
            // 验证标记块
            const { markBlockAsCard } = await import('@/core/siyuan/block');
            expect(markBlockAsCard).toHaveBeenCalled();
        });
        
        it('应该端到端创建概念卡片 (::)', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: 'FSRS :: Free Spaced Repetition Scheduler'
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-quick-2',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            await vi.advanceTimersByTimeAsync(300);
            
            // 验证概念卡片创建
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.type).toBe(1); // CardType.Topic
            expect(card.meta.symbolType).toBe('::');
            expect(card.aFactor).toBe(2.5);
        });
        
        it('应该端到端创建填空卡片 ({{}})', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '{{线粒体}}是细胞的{{能量工厂}}'
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-quick-3',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            await vi.advanceTimersByTimeAsync(300);
            
            // 验证填空卡片创建
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.symbolType).toBe('{{}}');
            expect(card.meta.clozes).toEqual(['线粒体', '能量工厂']);
            expect(card.meta.clozeCount).toBe(2);
        });
    });


    describe('4.3.4 测试列表模版制卡流程', () => {
        it('应该端到端创建列表模版卡片 (>>>)', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-list-1') {
                    return Promise.resolve({ kramdown: '线粒体的功能有哪些？ >>>' });
                } else if (blockId === 'child-1') {
                    return Promise.resolve({ kramdown: '生成ATP' });
                } else if (blockId === 'child-2') {
                    return Promise.resolve({ kramdown: '调节代谢' });
                }
                return Promise.resolve({ kramdown: '' });
            });
            
            (sql as any).mockImplementation((query: string) => {
                if (query.includes('type FROM blocks')) {
                    return Promise.resolve([{ type: 'i' }]);
                } else if (query.includes('parent_id')) {
                    return Promise.resolve([
                        { id: 'child-1' },
                        { id: 'child-2' }
                    ]);
                }
                return Promise.resolve([]);
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-list-1',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // 等待列表模版防抖（2000ms）
            await vi.advanceTimersByTimeAsync(2000);
            
            // 验证 Xiuyuan 创建
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalledWith(
                ['block-list-1', 'child-1', 'child-2'],
                'builtin-list-item',
                expect.any(Object),
                'builtin-deck-id'
            );
        });
        
        it('应该解析列表项中的提示符 (->)', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-list-2') {
                    return Promise.resolve({ kramdown: '问题 >>>' });
                } else if (blockId === 'child-1') {
                    return Promise.resolve({ kramdown: '提示1 -> 答案1' });
                } else if (blockId === 'child-2') {
                    return Promise.resolve({ kramdown: '提示2 -> 答案2' });
                }
                return Promise.resolve({ kramdown: '' });
            });
            
            (sql as any).mockImplementation((query: string) => {
                if (query.includes('type FROM blocks')) {
                    return Promise.resolve([{ type: 'i' }]);
                } else if (query.includes('parent_id')) {
                    return Promise.resolve([
                        { id: 'child-1' },
                        { id: 'child-2' }
                    ]);
                }
                return Promise.resolve([]);
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-list-2',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            await vi.advanceTimersByTimeAsync(2000);
            
            // 验证 Xiuyuan 创建（应该正确解析提示符）
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalled();
        });
    });


    describe('4.3.5 测试错误处理和重连', () => {
        it('应该处理一个处理器错误不影响其他处理器', async () => {
            // 让 RiffSyncHandler 抛出错误
            vi.spyOn(riffSyncHandler, 'handle').mockImplementation(() => {
                throw new Error('RiffSync error');
            });
            
            const autoCardSpy = vi.spyOn(autoCardHandler, 'handle');
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-error-1',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // AutoCardHandler 应该仍然被调用
            expect(autoCardSpy).toHaveBeenCalledWith(transactions);
        });
        
        it('应该处理卡片创建失败的情况', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const { addRiffCards } = await import('@/core/siyuan/riff');
            (addRiffCards as any).mockRejectedValue(new Error('Riff error'));
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-error-2',
                    data: {}
                }],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该记录错误
            expect(console.error).toHaveBeenCalled();
        });
        
        it('应该在连接关闭后自动重连', async () => {
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            expect(ws.readyState).toBe(1); // OPEN
            
            // 模拟非正常关闭
            ws.close(1006, 'Abnormal closure');
            
            // 等待重连延迟（3000ms）
            await vi.advanceTimersByTimeAsync(3000);
            
            // 应该创建新的连接
            const newWs = (service as any).ws as MockWebSocket;
            expect(newWs).toBeTruthy();
        });
        
        it('应该在正常关闭后不重连', async () => {
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            
            // 模拟正常关闭
            ws.close(1000, 'Normal closure');
            
            // 等待重连延迟
            await vi.advanceTimersByTimeAsync(3000);
            
            // 不应该重连
            const newWs = (service as any).ws as MockWebSocket;
            expect(newWs).toBeNull();
        });
        
        it('应该处理 WebSocket 消息解析错误', async () => {
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            
            if (ws && ws.onmessage) {
                // 发送无效的 JSON
                ws.onmessage({
                    data: 'invalid json'
                } as MessageEvent);
            }
            
            // 应该记录错误但不崩溃
            expect(console.error).toHaveBeenCalled();
        });
    });


    describe('端到端综合测试', () => {
        it('应该同时处理 Riff 同步和快速制卡', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            
            // 发送包含 Riff 操作和块插入的事务
            const transactions: Transaction[] = [{
                doOperations: [
                    {
                        action: 'addFlashcards',
                        id: 'block-riff',
                        data: {}
                    },
                    {
                        action: 'insert',
                        id: 'block-quick',
                        data: {}
                    }
                ],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // 等待防抖
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该触发 Riff 同步
            expect(mockHybridSyncService.incrementalSync).toHaveBeenCalled();
            
            // 应该创建快速卡片
            expect(mockStorage.setCard).toHaveBeenCalled();
        });
        
        it('应该批量处理多个块的快速制卡', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                return Promise.resolve({ kramdown: `问题${blockId} >> 答案${blockId}` });
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            
            // 发送多个块的插入操作
            const transactions: Transaction[] = [{
                doOperations: [
                    { action: 'insert', id: 'block-batch-1', data: {} },
                    { action: 'insert', id: 'block-batch-2', data: {} },
                    { action: 'insert', id: 'block-batch-3', data: {} }
                ],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该创建 3 张卡片
            expect(mockStorage.setCard).toHaveBeenCalledTimes(3);
        });
        
        it('应该正确处理快速符号和列表模版的不同防抖时间', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            // Mock 快速符号块
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-quick') {
                    return Promise.resolve({ kramdown: '问题 >> 答案' });
                } else if (blockId === 'block-list') {
                    return Promise.resolve({ kramdown: '问题 >>>' });
                } else if (blockId === 'child-1' || blockId === 'child-2') {
                    return Promise.resolve({ kramdown: '答案' });
                }
                return Promise.resolve({ kramdown: '' });
            });
            
            (sql as any).mockImplementation((query: string) => {
                if (query.includes('type FROM blocks')) {
                    return Promise.resolve([{ type: 'i' }]);
                } else if (query.includes('parent_id')) {
                    return Promise.resolve([
                        { id: 'child-1' },
                        { id: 'child-2' }
                    ]);
                }
                return Promise.resolve([]);
            });
            
            service.start();
            await vi.advanceTimersByTimeAsync(20);
            
            const ws = (service as any).ws as MockWebSocket;
            
            // 同时发送快速符号和列表模版
            const transactions: Transaction[] = [{
                doOperations: [
                    { action: 'insert', id: 'block-quick', data: {} },
                    { action: 'insert', id: 'block-list', data: {} }
                ],
                undoOperations: null
            }];
            
            if (ws && ws.onmessage) {
                ws.onmessage({
                    data: JSON.stringify({
                        cmd: 'transactions',
                        data: transactions
                    })
                } as MessageEvent);
            }
            
            // 等待 300ms，快速符号应该处理
            await vi.advanceTimersByTimeAsync(300);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
            
            // 再等待 1700ms，列表模版应该处理
            await vi.advanceTimersByTimeAsync(1700);
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalled();
        });
    });
});
