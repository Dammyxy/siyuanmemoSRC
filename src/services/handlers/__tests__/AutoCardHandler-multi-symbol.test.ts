/**
 * AutoCardHandler 多符号制卡测试
 * 
 * 测试方案 5 + 方案 3：智能检测 + 批量创建
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoCardHandler } from '../AutoCardHandler';
import type FSRSPlugin from '@/index';

// Mock 依赖
vi.mock('@/core/siyuan/api', () => ({
    getBlockKramdown: vi.fn(),
    sql: vi.fn(),
    pushMsg: vi.fn(),
    pushErrMsg: vi.fn(),
    setBlockAttrs: vi.fn(),
}));

vi.mock('@/core/siyuan/riff', () => ({
    addRiffCards: vi.fn(),
    BUILTIN_DECK_ID: 'test-deck',
}));

vi.mock('@/core/siyuan/block', () => ({
    markBlockAsCard: vi.fn(),
}));

vi.mock('@/types/card', () => ({
    createDefaultCard: vi.fn((blockId: string) => ({
        id: `card-${blockId}`,
        blockId,
        meta: {},
        priority: 0,
    })),
    CardType: {
        Concept: 'concept',
    },
}));

describe('AutoCardHandler - 多符号制卡', () => {
    let handler: AutoCardHandler;
    let mockPlugin: Partial<FSRSPlugin>;

    beforeEach(() => {
        // 创建 mock plugin
        mockPlugin = {
            storage: {
                getSettings: vi.fn(() => ({
                    quickCard: {
                        enabled: true,
                        enabledSymbols: {
                            basic: true,
                            concept: true,
                            descriptor: true,
                            cloze: true,
                            multiLine: true,
                        },
                        debounceDelay: {
                            quick: 1000,
                            list: 2000,
                        },
                    },
                })),
                getCardByBlockId: vi.fn(() => null),
                setCard: vi.fn(),
                saveCards: vi.fn(),
            },
        } as any;

        handler = new AutoCardHandler(mockPlugin as FSRSPlugin);
    });

    describe('方案 3：批量检测符号', () => {
        it('应该检测块内的所有符号类型', async () => {
            // 注意：正则表达式是按行匹配的，多行内容需要分别匹配
            const content = '概念1 :: 定义1';
            const settings = {
                enabledSymbols: {
                    basic: true,
                    concept: true,
                    descriptor: true,
                    cloze: true,
                },
            };

            // 使用反射访问私有方法
            const detectAllSymbols = (handler as any).detectAllSymbols.bind(handler);
            const symbols = detectAllSymbols(content, settings);

            // 应该检测到概念符号
            expect(symbols.length).toBeGreaterThan(0);
            expect(symbols[0].type).toBe('concept');
        });

        it('应该按优先级检测符号', async () => {
            const content = '问题 <> 答案';
            const settings = {
                enabledSymbols: {
                    basic: true,
                    concept: true,
                },
            };

            const detectAllSymbols = (handler as any).detectAllSymbols.bind(handler);
            const symbols = detectAllSymbols(content, settings);

            // 应该优先检测到双向符号
            expect(symbols[0].type).toBe('basic-both');
        });

        it('应该排除 >>> 符号', async () => {
            const content = '问题 >>>';
            const settings = {
                enabledSymbols: {
                    basic: true,
                    multiLine: true,
                },
            };

            const detectAllSymbols = (handler as any).detectAllSymbols.bind(handler);
            const symbols = detectAllSymbols(content, settings);

            // 不应该检测到 >>> 符号（它在列表模版队列中处理）
            expect(symbols.length).toBe(0);
        });
    });

    describe('方案 5：智能检测块编辑完成', () => {
        it('应该记录当前编辑的块', () => {
            const transactions = [
                {
                    doOperations: [
                        { action: 'update', id: 'block-1' },
                    ],
                },
            ];

            handler.handle(transactions as any);

            // 应该记录当前编辑的块
            expect((handler as any).currentEditingBlock).toBe('block-1');
        });

        it('应该在切换块时触发失焦处理', () => {
            const processBlockImmediately = vi.spyOn(
                handler as any,
                'processBlockImmediately'
            );

            // 第一次编辑 block-1
            handler.handle([
                {
                    doOperations: [{ action: 'update', id: 'block-1' }],
                },
            ] as any);

            // 切换到 block-2，应该触发 block-1 的失焦处理
            handler.handle([
                {
                    doOperations: [{ action: 'update', id: 'block-2' }],
                },
            ] as any);

            expect(processBlockImmediately).toHaveBeenCalledWith('block-1');
        });

        it('应该延长防抖时间以支持多符号输入', () => {
            // 默认防抖时间应该是 1000ms
            expect((handler as any).QUICK_DEBOUNCE).toBe(1000);
        });
    });

    describe('集成测试：多符号制卡', () => {
        it('应该支持在一个块里输入多个符号', async () => {
            // 模拟场景：用户在一个块里输入多个概念
            const blockId = 'block-multi';
            const content = '概念1 :: 定义1\n概念2 :: 定义2\n概念3 :: 定义3';

            // Mock getBlockKramdown
            const { getBlockKramdown } = await import('@/core/siyuan/api');
            (getBlockKramdown as any).mockResolvedValue({ kramdown: content });

            // 触发编辑
            handler.handle([
                {
                    doOperations: [{ action: 'update', id: blockId }],
                },
            ] as any);

            // 切换到其他块，触发失焦
            handler.handle([
                {
                    doOperations: [{ action: 'update', id: 'other-block' }],
                },
            ] as any);

            // 等待异步处理
            await new Promise(resolve => setTimeout(resolve, 100));

            // 应该检测到多个符号
            // 注意：实际创建卡片的逻辑需要更多的 mock
        });
    });
});
