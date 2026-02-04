/**
 * SimpleDataRouter Unit Tests
 * 简单模式数据路由器单元测试
 * 
 * 测试 SimpleDataRouter 的核心功能：
 * - 获取卡片数据
 * - 删除卡片（黑名单）
 * - 拒绝更新操作
 * - 返回正确的队列类型和上下文菜单选项
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleDataRouter } from '../SimpleDataRouter';
import { QueueType } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';
import type { RiffBlock } from '../../core/siyuan/riff';

// Mock Riff API
vi.mock('../../core/siyuan/riff', () => ({
    getRiffCards: vi.fn(),
    getRiffCardsByBlockIDs: vi.fn(),
    removeRiffCards: vi.fn(),
    BUILTIN_DECK_ID: '20230218211946-2kw8jgx',
}));

import * as riffApi from '../../core/siyuan/riff';

describe('SimpleDataRouter', () => {
    let router: SimpleDataRouter;
    
    beforeEach(() => {
        router = new SimpleDataRouter();
        vi.clearAllMocks();
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    // ========================================================================
    // 队列类型测试
    // ========================================================================
    
    describe('getAvailableQueueTypes', () => {
        it('应该返回恰好 2 种队列类型', () => {
            // 需求 2.1：简单模式提供恰好两种队列类型
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toHaveLength(2);
        });
        
        it('应该包含检索练习队列', () => {
            // 需求 2.1：检索练习队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toContain(QueueType.RetrievalPractice);
        });
        
        it('应该包含最终训练队列', () => {
            // 需求 2.1：最终训练队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toContain(QueueType.FinalDrill);
        });
        
        it('不应该包含高级模式的队列类型', () => {
            // 需求 2.1：简单模式不提供高级队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).not.toContain(QueueType.IncrementalLearning);
            expect(queueTypes).not.toContain(QueueType.FilterGroup);
            expect(queueTypes).not.toContain(QueueType.NeuralRoam);
        });
    });
    
    // ========================================================================
    // 上下文菜单测试
    // ========================================================================
    
    describe('getContextMenuOptions', () => {
        it('应该返回恰好 3 个上下文菜单选项', () => {
            // 需求 2.3：简单模式提供恰好三个上下文菜单选项
            const options = router.getContextMenuOptions();
            
            expect(options).toHaveLength(3);
        });
        
        it('应该包含"打开"选项', () => {
            // 需求 2.3：打开选项
            const options = router.getContextMenuOptions();
            
            const openOption = options.find(opt => opt.id === 'open');
            expect(openOption).toBeDefined();
            expect(openOption?.label).toBe('打开');
        });
        
        it('应该包含"删除"选项', () => {
            // 需求 2.3：删除选项
            const options = router.getContextMenuOptions();
            
            const deleteOption = options.find(opt => opt.id === 'delete');
            expect(deleteOption).toBeDefined();
            expect(deleteOption?.label).toBe('删除');
        });
        
        it('应该包含"添加到最终训练"选项', () => {
            // 需求 2.3：添加到最终训练选项
            const options = router.getContextMenuOptions();
            
            const addOption = options.find(opt => opt.id === 'add-to-final-drill');
            expect(addOption).toBeDefined();
            expect(addOption?.label).toBe('添加到最终训练');
        });
        
        it('不应该包含高级模式的选项', () => {
            // 需求 2.3：简单模式不提供高级选项
            const options = router.getContextMenuOptions();
            
            const optionIds = options.map(opt => opt.id);
            expect(optionIds).not.toContain('switch-scheduler');
            expect(optionIds).not.toContain('modify-card-type');
            expect(optionIds).not.toContain('set-priority');
            expect(optionIds).not.toContain('sync-to-riff');
        });
    });
    
    // ========================================================================
    // 数据访问测试
    // ========================================================================
    
    describe('getCard', () => {
        it('应该通过 Riff API 获取卡片', async () => {
            // 需求 2.5：从 Riff API 获取数据
            const mockRiffBlock: RiffBlock = {
                id: 'test-card-1',
                box: 'test-box',
                path: '/test/path',
                hPath: 'Test Path',
                content: 'Test content',
                created: '2024-01-01T00:00:00Z',
                updated: '2024-01-02T00:00:00Z',
                type: 'NodeParagraph',
                subType: '',
                ial: {},
                riffCard: {
                    id: 'riff-card-1',
                    blockID: 'test-card-1',
                    deckID: 'test-deck',
                    due: '2024-01-03T00:00:00Z',
                    reps: 5,
                    lapses: 1,
                    state: 2,
                    lastReview: '2024-01-02T00:00:00Z',
                    stability: 10.5,
                    difficulty: 5.2,
                    elapsedDays: 1,
                    scheduledDays: 2,
                },
            };
            
            vi.mocked(riffApi.getRiffCardsByBlockIDs).mockResolvedValue([mockRiffBlock]);
            
            const card = await router.getCard('test-card-1');
            
            expect(riffApi.getRiffCardsByBlockIDs).toHaveBeenCalledWith(['test-card-1']);
            expect(card.id).toBe('test-card-1');
            expect(card.blockId).toBe('test-card-1');
        });
        
        it('应该正确转换 RiffBlock 为 FSRSCard', async () => {
            // 测试数据转换
            const mockRiffBlock: RiffBlock = {
                id: 'test-card-2',
                box: 'test-box',
                path: '/test/path',
                hPath: 'Test Path',
                content: 'Test content',
                created: '2024-01-01T00:00:00Z',
                updated: '2024-01-02T00:00:00Z',
                type: 'NodeParagraph',
                subType: '',
                ial: {},
                riffCard: {
                    id: 'riff-card-2',
                    blockID: 'test-card-2',
                    deckID: 'test-deck',
                    due: '2024-01-03T00:00:00Z',
                    reps: 5,
                    lapses: 1,
                    state: 2,
                    lastReview: '2024-01-02T00:00:00Z',
                    stability: 10.5,
                    difficulty: 5.2,
                    elapsedDays: 1,
                    scheduledDays: 2,
                },
            };
            
            vi.mocked(riffApi.getRiffCardsByBlockIDs).mockResolvedValue([mockRiffBlock]);
            
            const card = await router.getCard('test-card-2');
            
            // 验证 FSRS 字段
            expect(card.stability).toBe(10.5);
            expect(card.difficulty).toBe(5.2);
            expect(card.reps).toBe(5);
            expect(card.lapses).toBe(1);
            expect(card.state).toBe(2);
            expect(card.elapsedDays).toBe(1);
            expect(card.scheduledDays).toBe(2);
            
            // 验证调度器类型
            expect(card.schedulerType).toBe('riff');
            expect(card.syncToRiff).toBe(true);
            expect(card.riffCardId).toBe('riff-card-2');
        });
        
        it('当卡片不存在时应该抛出错误', async () => {
            // 测试错误处理
            vi.mocked(riffApi.getRiffCardsByBlockIDs).mockResolvedValue([]);
            
            await expect(router.getCard('non-existent')).rejects.toThrow('Card not found: non-existent');
        });
    });
    
    describe('getCards', () => {
        it('应该通过 Riff API 获取所有卡片', async () => {
            // 需求 2.5：从 Riff API 获取数据
            const mockRiffBlocks: RiffBlock[] = [
                {
                    id: 'card-1',
                    box: 'test-box',
                    path: '/test/path1',
                    hPath: 'Test Path 1',
                    content: 'Content 1',
                    created: '2024-01-01T00:00:00Z',
                    updated: '2024-01-02T00:00:00Z',
                    type: 'NodeParagraph',
                    subType: '',
                    ial: {},
                },
                {
                    id: 'card-2',
                    box: 'test-box',
                    path: '/test/path2',
                    hPath: 'Test Path 2',
                    content: 'Content 2',
                    created: '2024-01-01T00:00:00Z',
                    updated: '2024-01-02T00:00:00Z',
                    type: 'NodeParagraph',
                    subType: '',
                    ial: {},
                },
            ];
            
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(mockRiffBlocks);
            
            const cards = await router.getCards();
            
            expect(riffApi.getRiffCards).toHaveBeenCalled();
            expect(cards).toHaveLength(2);
            expect(cards[0].id).toBe('card-1');
            expect(cards[1].id).toBe('card-2');
        });
        
        it('应该支持按到期日期过滤', async () => {
            // 测试过滤功能
            const now = new Date('2024-01-15T00:00:00Z');
            const mockRiffBlocks: RiffBlock[] = [
                {
                    id: 'card-due',
                    box: 'test-box',
                    path: '/test/path',
                    hPath: 'Test Path',
                    content: 'Due card',
                    created: '2024-01-01T00:00:00Z',
                    updated: '2024-01-02T00:00:00Z',
                    type: 'NodeParagraph',
                    subType: '',
                    ial: {},
                    riffCard: {
                        id: 'riff-1',
                        blockID: 'card-due',
                        deckID: 'test-deck',
                        due: '2024-01-10T00:00:00Z', // 已到期
                        reps: 0,
                        lapses: 0,
                        state: 0,
                        lastReview: '2024-01-01T00:00:00Z',
                        stability: 0,
                        difficulty: 0,
                        elapsedDays: 0,
                        scheduledDays: 0,
                    },
                },
                {
                    id: 'card-future',
                    box: 'test-box',
                    path: '/test/path',
                    hPath: 'Test Path',
                    content: 'Future card',
                    created: '2024-01-01T00:00:00Z',
                    updated: '2024-01-02T00:00:00Z',
                    type: 'NodeParagraph',
                    subType: '',
                    ial: {},
                    riffCard: {
                        id: 'riff-2',
                        blockID: 'card-future',
                        deckID: 'test-deck',
                        due: '2024-01-20T00:00:00Z', // 未到期
                        reps: 0,
                        lapses: 0,
                        state: 0,
                        lastReview: '2024-01-01T00:00:00Z',
                        stability: 0,
                        difficulty: 0,
                        elapsedDays: 0,
                        scheduledDays: 0,
                    },
                },
            ];
            
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(mockRiffBlocks);
            
            const cards = await router.getCards({
                dueDate: { lte: now },
            });
            
            expect(cards).toHaveLength(1);
            expect(cards[0].id).toBe('card-due');
        });
    });
    
    describe('updateCard', () => {
        it('应该抛出错误（简单模式不允许更新）', async () => {
            // 需求 2.4：简单模式只允许删除
            const mockCard: FSRSCard = {
                id: 'test-card',
                blockId: 'test-card',
                due: Date.now(),
                stability: 0,
                difficulty: 0,
                reps: 0,
                lapses: 0,
                state: 0,
                lastReview: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                priority: 50,
                type: 'item' as any,
                tags: [],
                leechCount: 0,
                isLeech: false,
                skipped: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            
            await expect(router.updateCard(mockCard)).rejects.toThrow('Update not allowed in Simple Mode');
        });
    });
    
    describe('deleteCard', () => {
        it('应该通过 Riff API 删除卡片（黑名单）', async () => {
            // 需求 2.4：通过黑名单删除
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue({ name: 'test-deck', size: 0 });
            
            await router.deleteCard('test-card');
            
            expect(riffApi.removeRiffCards).toHaveBeenCalledWith(
                riffApi.BUILTIN_DECK_ID,
                ['test-card']
            );
        });
    });
});

