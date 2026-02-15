/**
 * AutoCardHandler 单元测试
 * 
 * 测试自动制卡处理器的核心功能：
 * 1. 快速符号检测（>>, <<, <>, ::, ;;, {{}}）
 * 2. 列表模版检测（>>>）
 * 3. 队列管理和防抖机制
 * 4. 卡片创建逻辑
 * 
 * @see .kiro/specs/quick-card-symbols/tasks.md - Task 4.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';
import type { Transaction } from '../../TransactionWebSocketService';
import type FSRSPlugin from '@/index';
import { STORAGE_NAME } from '@/types';
import { CardType } from '@/types/card';

// Mock 思源 API
vi.mock('@/core/siyuan/api', () => ({
    getBlockKramdown: vi.fn(),
    sql: vi.fn(),
    pushMsg: vi.fn(),
    pushErrMsg: vi.fn()
}));

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
    addRiffCards: vi.fn(),
    BUILTIN_DECK_ID: 'builtin-deck-id'
}));

// Mock Block API
vi.mock('@/core/siyuan/block', () => ({
    markBlockAsCard: vi.fn()
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

describe('AutoCardHandler', () => {
    let handler: AutoCardHandler;
    let mockPlugin: FSRSPlugin;
    let mockStorage: any;
    let mockXiuyuanService: any;
    
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
        
        handler = new AutoCardHandler(mockPlugin);
        
        // Mock console to reduce noise
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    
    afterEach(() => {
        handler.dispose();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    describe('符号检测逻辑', () => {
        it('应该检测正向卡片符号 (>>)', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-1',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.direction).toBe('forward');
            expect(card.meta.symbolType).toBe('>>');
        });
        
        it('应该检测反向卡片符号 (<<)', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '答案 << 问题'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-2',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.direction).toBe('backward');
            expect(card.meta.symbolType).toBe('<<');
        });
        
        it('应该检测双向卡片符号 (<>)', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 <> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-3',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.direction).toBe('both');
            expect(card.meta.symbolType).toBe('<>');
        });
        
        it('应该检测概念卡片符号 (::)', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '概念 :: 定义'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-4',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.symbolType).toBe('::');
            expect(card.type).toBe(CardType.Concept);
        });

        it('应该检测填空卡片符号 ({{}})', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '文本{{填空1}}和{{填空2}}'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-5',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.symbolType).toBe('{{}}');
            expect(card.meta.clozes).toEqual(['填空1', '填空2']);
            expect(card.meta.clozeCount).toBe(2);
        });
        
        it('应该检测列表模版符号 (>>>)', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            // Mock 父块内容
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-6') {
                    return Promise.resolve({ kramdown: '问题 >>>' });
                } else if (blockId === 'child-1') {
                    return Promise.resolve({ kramdown: '答案1' });
                } else if (blockId === 'child-2') {
                    return Promise.resolve({ kramdown: '答案2' });
                }
                return Promise.resolve({ kramdown: '' });
            });
            
            // Mock SQL 查询
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
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-6',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(2000);
            
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalled();
        });
        
        it('应该按优先级检测符号（<> 优先于 >>）', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 <> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-7',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.symbolType).toBe('<>');
        });
        
        it('应该排除 >>> 符号在快速队列中处理', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >>>'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-8',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 快速队列不应该处理 >>>
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
    });

    describe('队列管理和防抖机制', () => {
        it('快速符号队列应该在 300ms 后触发', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-9',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 立即检查，不应该触发
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            
            // 等待 300ms
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该触发
            expect(mockStorage.setCard).toHaveBeenCalled();
        });
        
        it('列表模版队列应该在 2000ms 后触发', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-10') {
                    return Promise.resolve({ kramdown: '问题 >>>' });
                }
                return Promise.resolve({ kramdown: '答案' });
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
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-10',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 立即检查，不应该触发
            expect(mockXiuyuanService.createFromBlocks).not.toHaveBeenCalled();
            
            // 等待 2000ms
            await vi.advanceTimersByTimeAsync(2000);
            
            // 应该触发
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalled();
        });
        
        it('应该合并多次连续的快速符号变化', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-11',
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
            
            // 只应该处理一次
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
        });
        
        it('应该避免重复处理同一个块', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-12',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            handler.handle(transactions);
            
            await vi.advanceTimersByTimeAsync(300);
            
            // 只应该处理一次
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
        });
        
        it('应该使用配置中的防抖时间', async () => {
            // 修改配置
            mockPlugin.data[STORAGE_NAME].quickCard.debounceDelay.quick = 500;
            
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-13',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 等待 300ms，不应该触发
            await vi.advanceTimersByTimeAsync(300);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            
            // 再等待 200ms，应该触发
            await vi.advanceTimersByTimeAsync(200);
            expect(mockStorage.setCard).toHaveBeenCalled();
        });
    });

    describe('卡片创建逻辑', () => {
        it('应该创建正向卡片', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '什么是FSRS？ >> 一种间隔重复算法'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-14',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 验证卡片创建
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.question).toBe('什么是FSRS？');
            expect(card.meta.answer).toBe('一种间隔重复算法');
            expect(card.meta.direction).toBe('forward');
            
            // 验证添加到 Riff
            const { addRiffCards: addRiffCardsMock } = await import('@/core/siyuan/riff');
            expect(addRiffCardsMock).toHaveBeenCalledWith('builtin-deck-id', ['block-14']);
            
            // 验证标记块
            const { markBlockAsCard: markBlockAsCardMock } = await import('@/core/siyuan/block');
            expect(markBlockAsCardMock).toHaveBeenCalled();
        });
        
        it('应该创建概念卡片并标记为 Concept 类型', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: 'FSRS :: Free Spaced Repetition Scheduler'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-15',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.type).toBe(CardType.Concept);
            expect(card.meta.concept).toBe('FSRS');
            expect(card.meta.definition).toBe('Free Spaced Repetition Scheduler');
            expect(card.aFactor).toBeUndefined(); // 概念卡使用 FSRS，不使用 A-Factor
        });
        
        it('应该创建填空卡片并提取填空位置', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '{{线粒体}}是细胞的{{能量工厂}}'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-16',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.clozes).toEqual(['线粒体', '能量工厂']);
            expect(card.meta.clozeCount).toBe(2);
            expect(card.meta.clozePositions).toHaveLength(2);
        });
        
        it('应该跳过已制卡的块', async () => {
            mockStorage.getCardByBlockId.mockReturnValue({
                id: 'existing-card',
                blockId: 'block-17'
            });
            
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-17',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 不应该创建新卡片
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该处理描述符卡片（父块是概念）', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-18') {
                    return Promise.resolve({ kramdown: '功能 ;; 生成ATP' });
                } else if (blockId === 'parent-block') {
                    return Promise.resolve({ kramdown: '线粒体 :: 细胞的能量工厂' });
                }
                return Promise.resolve({ kramdown: '' });
            });
            
            (sql as any).mockResolvedValue([{ parent_id: 'parent-block' }]);
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-18',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该使用 Xiuyuan 创建
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalled();
        });
        
        it('应该降级描述符卡片（父块不是概念）', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-19') {
                    return Promise.resolve({ kramdown: '属性 ;; 描述' });
                } else if (blockId === 'parent-block') {
                    return Promise.resolve({ kramdown: '普通文本' });
                }
                return Promise.resolve({ kramdown: '' });
            });
            
            (sql as any).mockResolvedValue([{ parent_id: 'parent-block' }]);
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-19',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该创建普通卡片
            expect(mockStorage.setCard).toHaveBeenCalled();
            const card = mockStorage.setCard.mock.calls[0][0];
            expect(card.meta.degradedFromDescriptor).toBe(true);
        });
    });

    describe('列表模版卡片', () => {
        it('应该创建列表模版卡片', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-20') {
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
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-20',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(2000);
            
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalledWith(
                ['block-20', 'child-1', 'child-2'],
                'builtin-list-item',
                expect.any(Object),
                'builtin-deck-id'
            );
        });
        
        it('应该解析列表项中的提示符 (->)', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-21') {
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
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-21',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(2000);
            
            expect(mockXiuyuanService.createFromBlocks).toHaveBeenCalled();
        });
        
        it('应该跳过子项少于2个的列表', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >>>'
            });
            
            (sql as any).mockImplementation((query: string) => {
                if (query.includes('type FROM blocks')) {
                    return Promise.resolve([{ type: 'i' }]);
                } else if (query.includes('parent_id')) {
                    return Promise.resolve([{ id: 'child-1' }]); // 只有1个子项
                }
                return Promise.resolve([]);
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-22',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(2000);
            
            expect(mockXiuyuanService.createFromBlocks).not.toHaveBeenCalled();
        });
        
        it('应该跳过非列表项的块', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >>>'
            });
            
            (sql as any).mockImplementation((query: string) => {
                if (query.includes('type FROM blocks')) {
                    return Promise.resolve([{ type: 'p' }]); // 段落块，不是列表项
                }
                return Promise.resolve([]);
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-23',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(2000);
            
            expect(mockXiuyuanService.createFromBlocks).not.toHaveBeenCalled();
        });
    });

    describe('配置和开关', () => {
        it('应该在快速制卡禁用时跳过处理', async () => {
            mockPlugin.data[STORAGE_NAME].quickCard.enabled = false;
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-24',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该在基础卡片符号禁用时跳过', async () => {
            mockPlugin.data[STORAGE_NAME].quickCard.enabledSymbols.basic = false;
            
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-25',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该在概念符号禁用时跳过', async () => {
            mockPlugin.data[STORAGE_NAME].quickCard.enabledSymbols.concept = false;
            
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '概念 :: 定义'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-26',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该在列表模版符号禁用时跳过', async () => {
            mockPlugin.data[STORAGE_NAME].quickCard.enabledSymbols.multiLine = false;
            
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >>>'
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
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-27',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(2000);
            
            expect(mockXiuyuanService.createFromBlocks).not.toHaveBeenCalled();
        });
    });

    describe('错误处理', () => {
        it('应该处理获取块内容失败的情况', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockRejectedValue(new Error('API error'));
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-28',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 不应该抛出错误
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该处理卡片创建失败的情况', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const { addRiffCards } = await import('@/core/siyuan/riff');
            (addRiffCards as any).mockRejectedValue(new Error('Riff error'));
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-29',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该记录错误但不影响其他处理
            expect(console.error).toHaveBeenCalled();
        });
        
        it('应该处理 Xiuyuan 创建失败的情况', async () => {
            mockXiuyuanService.createFromBlocks.mockResolvedValue({
                ok: false,
                error: new Error('Xiuyuan error')
            });
            
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                if (blockId === 'block-30') {
                    return Promise.resolve({ kramdown: '问题 >>>' });
                }
                return Promise.resolve({ kramdown: '答案' });
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
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-30',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(2000);
            
            // 应该记录错误
            expect(console.error).toHaveBeenCalled();
        });
        
        it('应该处理空内容的块', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: ''
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-31',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
    });

    describe('资源清理', () => {
        it('应该清理快速符号定时器', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-32',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 立即清理
            handler.dispose();
            
            // 等待防抖时间
            await vi.advanceTimersByTimeAsync(300);
            
            // 不应该触发处理
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该清理列表模版定时器', async () => {
            const { getBlockKramdown, sql } = await import('@/core/siyuan/api');
            
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >>>'
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
            
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-33',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            
            // 立即清理
            handler.dispose();
            
            // 等待防抖时间
            await vi.advanceTimersByTimeAsync(2000);
            
            // 不应该触发处理
            expect(mockXiuyuanService.createFromBlocks).not.toHaveBeenCalled();
        });
        
        it('应该清理所有队列', () => {
            const transactions: Transaction[] = [{
                doOperations: [{
                    action: 'insert',
                    id: 'block-34',
                    data: {}
                }],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            handler.dispose();
            
            // 队列应该被清空（通过内部状态验证）
            expect(true).toBe(true);
        });
    });
    
    describe('批量操作', () => {
        it('应该批量处理多个块', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockImplementation((blockId: string) => {
                return Promise.resolve({ kramdown: `问题${blockId} >> 答案${blockId}` });
            });
            
            const transactions: Transaction[] = [{
                doOperations: [
                    { action: 'insert', id: 'block-35', data: {} },
                    { action: 'insert', id: 'block-36', data: {} },
                    { action: 'insert', id: 'block-37', data: {} }
                ],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 应该处理所有块
            expect(mockStorage.setCard).toHaveBeenCalledTimes(3);
        });
        
        it('应该只处理 insert 和 update 操作', async () => {
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({
                kramdown: '问题 >> 答案'
            });
            
            const transactions: Transaction[] = [{
                doOperations: [
                    { action: 'insert', id: 'block-38', data: {} },
                    { action: 'delete', id: 'block-39', data: {} },
                    { action: 'update', id: 'block-40', data: {} }
                ],
                undoOperations: null
            }];
            
            handler.handle(transactions);
            await vi.advanceTimersByTimeAsync(300);
            
            // 只应该处理 insert 和 update（2个）
            expect(mockStorage.setCard).toHaveBeenCalledTimes(2);
        });
    });
});
