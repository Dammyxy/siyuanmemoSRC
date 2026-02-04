/**
 * Data Routing Property-Based Tests
 * 数据路由属性测试
 * 
 * 使用 fast-check 进行基于属性的测试，验证数据路由的核心属性：
 * - 属性 1：简单模式数据路由
 * - 属性 2：高级模式数据路由
 * - 属性 5：简单模式操作限制
 * 
 * **Validates: Requirements 1.1, 1.2, 2.4, 2.5, 3.5**
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 * @see .kiro/specs/unified-data-source-architecture/tasks.md - Task 3.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { UnifiedDataSourceManager } from '../../managers/UnifiedDataSourceManager';
import { SimpleDataRouter } from '../SimpleDataRouter';
import { AdvancedDataRouter } from '../AdvancedDataRouter';
import { OperationMode } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';
import { CardState, CardType } from '../../types/card';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Riff API
vi.mock('../../core/siyuan/riff', () => ({
    getRiffCards: vi.fn(),
    getRiffCardsByBlockIDs: vi.fn(),
    removeRiffCards: vi.fn(),
    batchSetRiffCardsDueTime: vi.fn(),
    BUILTIN_DECK_ID: '20230218211946-2kw8jgx',
}));

import * as riffApi from '../../core/siyuan/riff';

// Mock StorageManager
const mockStorageManager = {
    getCard: vi.fn(),
    getAllCards: vi.fn(),
    setCard: vi.fn(),
    removeCard: vi.fn(),
    saveCards: vi.fn(),
};

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * 生成随机卡片 ID
 */
const cardIdArbitrary = (): fc.Arbitrary<string> => {
    return fc.uuid();
};

/**
 * 生成随机卡片
 */
const cardArbitrary = (): fc.Arbitrary<FSRSCard> => {
    return fc.record({
        id: fc.uuid(),
        blockId: fc.uuid(),
        due: fc.integer({ min: Date.now() - 86400000 * 365, max: Date.now() + 86400000 * 365 }),
        stability: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
        difficulty: fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }),
        reps: fc.integer({ min: 0, max: 1000 }),
        lapses: fc.integer({ min: 0, max: 100 }),
        state: fc.constantFrom(CardState.New, CardState.Learning, CardState.Review, CardState.Relearning),
        lastReview: fc.integer({ min: 0, max: Date.now() }),
        elapsedDays: fc.integer({ min: 0, max: 365 }),
        scheduledDays: fc.integer({ min: 0, max: 365 }),
        priority: fc.integer({ min: 0, max: 100 }),
        type: fc.constantFrom(CardType.Item, CardType.Topic),
        tags: fc.array(fc.string(), { maxLength: 5 }),
        leechCount: fc.integer({ min: 0, max: 10 }),
        isLeech: fc.boolean(),
        skipped: fc.boolean(),
        createdAt: fc.integer({ min: Date.now() - 86400000 * 365, max: Date.now() }),
        updatedAt: fc.integer({ min: Date.now() - 86400000 * 365, max: Date.now() }),
        schedulerType: fc.constantFrom('fsrs-v5', 'riff', 'a-factor'),
        syncToRiff: fc.boolean(),
        riffCardId: fc.option(fc.uuid(), { nil: undefined }),
    });
};

/**
 * 生成随机 RiffBlock（用于模拟 Riff API 响应）
 */
const riffBlockArbitrary = () => {
    return fc.record({
        id: fc.uuid(),
        box: fc.string(),
        path: fc.string(),
        hPath: fc.string(),
        content: fc.string(),
        created: fc.integer({ min: Date.now() - 86400000 * 365, max: Date.now() }).map(t => new Date(t).toISOString()),
        updated: fc.integer({ min: Date.now() - 86400000 * 365, max: Date.now() }).map(t => new Date(t).toISOString()),
        type: fc.constant('NodeParagraph'),
        subType: fc.constant(''),
        ial: fc.constant({}),
        riffCard: fc.option(fc.record({
            id: fc.uuid(),
            blockID: fc.uuid(),
            deckID: fc.string(),
            due: fc.integer({ min: Date.now() - 86400000 * 365, max: Date.now() + 86400000 * 365 }).map(t => new Date(t).toISOString()),
            reps: fc.integer({ min: 0, max: 100 }),
            lapses: fc.integer({ min: 0, max: 10 }),
            state: fc.integer({ min: 0, max: 3 }),
            lastReview: fc.integer({ min: Date.now() - 86400000 * 365, max: Date.now() }).map(t => new Date(t).toISOString()),
            stability: fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
            difficulty: fc.float({ min: Math.fround(1), max: Math.fround(10), noNaN: true }),
            elapsedDays: fc.integer({ min: 0, max: 365 }),
            scheduledDays: fc.integer({ min: 0, max: 365 }),
        }), { nil: undefined }),
    });
};

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Data Routing Property-Based Tests', () => {
    let simpleRouter: SimpleDataRouter;
    let advancedRouter: AdvancedDataRouter;
    
    beforeEach(() => {
        // 重置所有 mock
        vi.clearAllMocks();
        
        // 创建路由器实例
        simpleRouter = new SimpleDataRouter();
        advancedRouter = new AdvancedDataRouter(mockStorageManager as any);
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    // ========================================================================
    // 属性 1：简单模式数据路由
    // ========================================================================
    
    describe('Property 1: 简单模式数据路由', () => {
        it('Feature: unified-data-source-architecture, Property 1: 对于任何数据请求，当系统处于简单模式时，该请求应该被路由到 Riff_API', async () => {
            /**
             * **Validates: Requirements 1.1, 2.5**
             * 
             * 属性：简单模式下的所有数据请求都应该路由到 Riff API
             * 
             * 测试策略：
             * 1. 生成随机卡片 ID
             * 2. 模拟 Riff API 返回数据
             * 3. 调用 SimpleDataRouter.getCard()
             * 4. 验证 Riff API 被调用
             */
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary(),
                    riffBlockArbitrary(),
                    async (cardId, riffBlock) => {
                        // 设置 mock：Riff API 返回数据
                        riffBlock.id = cardId;
                        if (riffBlock.riffCard) {
                            riffBlock.riffCard.blockID = cardId;
                        }
                        vi.mocked(riffApi.getRiffCardsByBlockIDs).mockResolvedValue([riffBlock]);
                        
                        // 执行：通过 SimpleDataRouter 获取卡片
                        const card = await simpleRouter.getCard(cardId);
                        
                        // 验证：Riff API 被调用
                        expect(riffApi.getRiffCardsByBlockIDs).toHaveBeenCalledWith([cardId]);
                        
                        // 验证：返回的卡片 ID 正确
                        expect(card.id).toBe(cardId);
                        expect(card.blockId).toBe(cardId);
                        
                        // 验证：卡片标记为使用 Riff 调度器
                        expect(card.schedulerType).toBe('riff');
                        expect(card.syncToRiff).toBe(true);
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('Feature: unified-data-source-architecture, Property 1 (getCards): 对于任何批量数据请求，当系统处于简单模式时，该请求应该被路由到 Riff_API', async () => {
            /**
             * **Validates: Requirements 1.1, 2.5**
             * 
             * 属性：简单模式下的批量数据请求都应该路由到 Riff API
             * 
             * 测试策略：
             * 1. 生成随机 RiffBlock 数组
             * 2. 模拟 Riff API 返回数据
             * 3. 调用 SimpleDataRouter.getCards()
             * 4. 验证 Riff API 被调用
             */
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary(), { minLength: 0, maxLength: 20 }),
                    async (riffBlocks) => {
                        // 设置 mock：Riff API 返回数据
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffBlocks);
                        
                        // 执行：通过 SimpleDataRouter 获取卡片列表
                        const cards = await simpleRouter.getCards();
                        
                        // 验证：Riff API 被调用
                        expect(riffApi.getRiffCards).toHaveBeenCalled();
                        
                        // 验证：返回的卡片数量正确
                        expect(cards).toHaveLength(riffBlocks.length);
                        
                        // 验证：所有卡片都标记为使用 Riff 调度器
                        for (const card of cards) {
                            expect(card.schedulerType).toBe('riff');
                            expect(card.syncToRiff).toBe(true);
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('Feature: unified-data-source-architecture, Property 1 (deleteCard): 对于任何删除请求，当系统处于简单模式时，该请求应该被路由到 Riff_API', async () => {
            /**
             * **Validates: Requirements 1.1, 2.4**
             * 
             * 属性：简单模式下的删除请求都应该路由到 Riff API（黑名单）
             * 
             * 测试策略：
             * 1. 生成随机卡片 ID
             * 2. 调用 SimpleDataRouter.deleteCard()
             * 3. 验证 Riff API 的 removeRiffCards 被调用
             */
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary(),
                    async (cardId) => {
                        // 设置 mock：Riff API 删除成功
                        vi.mocked(riffApi.removeRiffCards).mockResolvedValue({ name: 'test-deck', size: 0 });
                        
                        // 执行：通过 SimpleDataRouter 删除卡片
                        await simpleRouter.deleteCard(cardId);
                        
                        // 验证：Riff API 的 removeRiffCards 被调用
                        expect(riffApi.removeRiffCards).toHaveBeenCalledWith(
                            riffApi.BUILTIN_DECK_ID,
                            [cardId]
                        );
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
    
    // ========================================================================
    // 属性 2：高级模式数据路由
    // ========================================================================
    
    describe('Property 2: 高级模式数据路由', () => {
        it('Feature: unified-data-source-architecture, Property 2: 对于任何数据请求，当系统处于高级模式时，该请求应该被路由到本地存储', async () => {
            /**
             * **Validates: Requirements 1.2, 3.5**
             * 
             * 属性：高级模式下的所有数据请求都应该路由到本地存储
             * 
             * 测试策略：
             * 1. 生成随机卡片 ID 和卡片数据
             * 2. 模拟本地存储返回数据
             * 3. 调用 AdvancedDataRouter.getCard()
             * 4. 验证本地存储被调用，Riff API 未被调用
             */
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary(),
                    cardArbitrary(),
                    async (cardId, card) => {
                        // 设置卡片 ID
                        card.id = cardId;
                        card.blockId = cardId;
                        
                        // 设置 mock：本地存储返回数据
                        mockStorageManager.getCard.mockReturnValue(card);
                        
                        // 执行：通过 AdvancedDataRouter 获取卡片
                        const result = await advancedRouter.getCard(cardId);
                        
                        // 验证：本地存储被调用
                        expect(mockStorageManager.getCard).toHaveBeenCalledWith(cardId);
                        
                        // 验证：Riff API 未被调用
                        expect(riffApi.getRiffCardsByBlockIDs).not.toHaveBeenCalled();
                        
                        // 验证：返回的卡片正确
                        expect(result).toEqual(card);
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('Feature: unified-data-source-architecture, Property 2 (getCards): 对于任何批量数据请求，当系统处于高级模式时，该请求应该被路由到本地存储', async () => {
            /**
             * **Validates: Requirements 1.2, 3.5**
             * 
             * 属性：高级模式下的批量数据请求都应该路由到本地存储
             * 
             * 测试策略：
             * 1. 生成随机卡片数组
             * 2. 模拟本地存储返回数据
             * 3. 调用 AdvancedDataRouter.getCards()
             * 4. 验证本地存储被调用，Riff API 未被调用
             */
            await fc.assert(
                fc.asyncProperty(
                    fc.array(cardArbitrary(), { minLength: 0, maxLength: 20 }),
                    async (cards) => {
                        // 设置 mock：本地存储返回数据
                        mockStorageManager.getAllCards.mockReturnValue(cards);
                        
                        // 执行：通过 AdvancedDataRouter 获取卡片列表
                        const result = await advancedRouter.getCards();
                        
                        // 验证：本地存储被调用
                        expect(mockStorageManager.getAllCards).toHaveBeenCalled();
                        
                        // 验证：Riff API 未被调用
                        expect(riffApi.getRiffCards).not.toHaveBeenCalled();
                        
                        // 验证：返回的卡片正确
                        expect(result).toEqual(cards);
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('Feature: unified-data-source-architecture, Property 2 (updateCard): 对于任何更新请求，当系统处于高级模式时，该请求应该被路由到本地存储', async () => {
            /**
             * **Validates: Requirements 1.2, 3.4, 3.5**
             * 
             * 属性：高级模式下的更新请求都应该路由到本地存储
             * 
             * 测试策略：
             * 1. 生成随机卡片
             * 2. 调用 AdvancedDataRouter.updateCard()
             * 3. 验证本地存储被调用，默认不同步到 Riff
             */
            await fc.assert(
                fc.asyncProperty(
                    cardArbitrary(),
                    async (card) => {
                        // 设置 mock：本地存储保存成功
                        mockStorageManager.saveCards.mockResolvedValue(undefined);
                        
                        // 执行：通过 AdvancedDataRouter 更新卡片
                        await advancedRouter.updateCard(card);
                        
                        // 验证：本地存储被调用
                        expect(mockStorageManager.setCard).toHaveBeenCalledWith(card);
                        expect(mockStorageManager.saveCards).toHaveBeenCalled();
                        
                        // 验证：默认不同步到 Riff（需求 17.2）
                        expect(riffApi.batchSetRiffCardsDueTime).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('Feature: unified-data-source-architecture, Property 2 (deleteCard): 对于任何删除请求，当系统处于高级模式时，该请求应该被路由到本地存储', async () => {
            /**
             * **Validates: Requirements 1.2, 3.4, 3.5**
             * 
             * 属性：高级模式下的删除请求都应该路由到本地存储
             * 
             * 测试策略：
             * 1. 生成随机卡片 ID
             * 2. 调用 AdvancedDataRouter.deleteCard()
             * 3. 验证本地存储被调用，Riff API 未被调用
             */
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary(),
                    async (cardId) => {
                        // 设置 mock：本地存储删除成功
                        mockStorageManager.saveCards.mockResolvedValue(undefined);
                        
                        // 执行：通过 AdvancedDataRouter 删除卡片
                        await advancedRouter.deleteCard(cardId);
                        
                        // 验证：本地存储被调用
                        expect(mockStorageManager.removeCard).toHaveBeenCalledWith(cardId);
                        expect(mockStorageManager.saveCards).toHaveBeenCalled();
                        
                        // 验证：Riff API 未被调用
                        expect(riffApi.removeRiffCards).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
    
    // ========================================================================
    // 属性 5：简单模式操作限制
    // ========================================================================
    
    describe('Property 5: 简单模式操作限制', () => {
        it('Feature: unified-data-source-architecture, Property 5: 对于任何修改操作（除删除外），当系统处于简单模式时，该操作应该被拒绝', async () => {
            /**
             * **Validates: Requirements 2.4**
             * 
             * 属性：简单模式下的更新操作应该被拒绝
             * 
             * 测试策略：
             * 1. 生成随机卡片
             * 2. 调用 SimpleDataRouter.updateCard()
             * 3. 验证抛出错误，错误消息包含 "Update not allowed in Simple Mode"
             */
            await fc.assert(
                fc.asyncProperty(
                    cardArbitrary(),
                    async (card) => {
                        // 执行并验证：更新操作应该抛出错误
                        await expect(simpleRouter.updateCard(card)).rejects.toThrow(
                            'Update not allowed in Simple Mode'
                        );
                        
                        // 验证：Riff API 未被调用
                        expect(riffApi.batchSetRiffCardsDueTime).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 100 }
            );
        });
        
        it('Feature: unified-data-source-architecture, Property 5 (delete allowed): 简单模式下的删除操作应该被允许', async () => {
            /**
             * **Validates: Requirements 2.4**
             * 
             * 属性：简单模式下的删除操作应该被允许（通过黑名单）
             * 
             * 测试策略：
             * 1. 生成随机卡片 ID
             * 2. 调用 SimpleDataRouter.deleteCard()
             * 3. 验证不抛出错误，Riff API 被调用
             */
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary(),
                    async (cardId) => {
                        // 设置 mock：Riff API 删除成功
                        vi.mocked(riffApi.removeRiffCards).mockResolvedValue({ name: 'test-deck', size: 0 });
                        
                        // 执行：删除操作应该成功
                        await expect(simpleRouter.deleteCard(cardId)).resolves.toBeUndefined();
                        
                        // 验证：Riff API 被调用
                        expect(riffApi.removeRiffCards).toHaveBeenCalledWith(
                            riffApi.BUILTIN_DECK_ID,
                            [cardId]
                        );
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
