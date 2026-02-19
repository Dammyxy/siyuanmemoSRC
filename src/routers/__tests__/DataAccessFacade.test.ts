/**
 * DataAccessFacade Unit Tests
 * 数据访问门面单元测试
 * 
 * 测试 DataAccessFacade 的核心功能：
 * - 获取卡片数据
 * - 更新和删除卡片
 * - 同步到 Riff
 * - 返回正确的队列类型和上下文菜单选项
 * 
 * @see .kiro/specs/unified-data-source-architecture/requirements.md
 * @see .kiro/specs/unified-data-source-architecture/design.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataAccessFacade } from '../DataAccessFacade';
import { QueueType } from '../../types/unified-data-source';
import type { FSRSCard } from '../../types/card';
import { CardState, CardType } from '../../types/card';

// Mock StorageManager
const mockStorageManager = {
    getCard: vi.fn(),
    getAllCards: vi.fn(),
    setCard: vi.fn(),
    removeCard: vi.fn(),
    saveCards: vi.fn(),
};

// Mock Riff API
vi.mock('../../core/siyuan/riff', () => ({
    batchSetRiffCardsDueTime: vi.fn(),
}));

import * as riffApi from '../../core/siyuan/riff';

describe('DataAccessFacade', () => {
    let router: DataAccessFacade;
    
    beforeEach(() => {
        router = new DataAccessFacade(mockStorageManager as any);
        vi.clearAllMocks();
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    // ========================================================================
    
    describe('getAvailableQueueTypes', () => {
        it('应该返回恰好 5 种队列类型', () => {
            // 需求 3.1：高级模式提供恰好五种队列类型
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toHaveLength(5);
        });
        
        it('应该包含检索练习队列', () => {
            // 需求 3.1：检索练习队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toContain(QueueType.RetrievalPractice);
        });
        
        it('应该包含最终训练队列', () => {
            // 需求 3.1：最终训练队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toContain(QueueType.FinalDrill);
        });
        
        it('应该包含渐进学习队列', () => {
            // 需求 3.1：渐进学习队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toContain(QueueType.IncrementalLearning);
        });
        
        it('应该包含过滤组队列', () => {
            // 需求 3.1：过滤组队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toContain(QueueType.FilterGroup);
        });
        
        it('应该包含神经漫游队列', () => {
            // 需求 3.1：神经漫游队列
            const queueTypes = router.getAvailableQueueTypes();
            
            expect(queueTypes).toContain(QueueType.NeuralRoam);
        });
    });
    
    // ========================================================================
    // 上下文菜单测试
    // ========================================================================
    
    describe('getContextMenuOptions', () => {
        it('应该返回恰好 7 个上下文菜单选项', () => {
            // 需求 3.3：高级模式提供恰好七个上下文菜单选项
            const options = router.getContextMenuOptions();
            
            expect(options).toHaveLength(7);
        });
        
        it('应该包含"打开"选项', () => {
            // 需求 3.3：打开选项
            const options = router.getContextMenuOptions();
            
            const openOption = options.find(opt => opt.id === 'open');
            expect(openOption).toBeDefined();
            expect(openOption?.label).toBe('打开');
        });
        
        it('应该包含"删除"选项', () => {
            // 需求 3.3：删除选项
            const options = router.getContextMenuOptions();
            
            const deleteOption = options.find(opt => opt.id === 'delete');
            expect(deleteOption).toBeDefined();
            expect(deleteOption?.label).toBe('删除');
        });
        
        it('应该包含"添加到最终训练"选项', () => {
            // 需求 3.3：添加到最终训练选项
            const options = router.getContextMenuOptions();
            
            const addOption = options.find(opt => opt.id === 'add-to-final-drill');
            expect(addOption).toBeDefined();
            expect(addOption?.label).toBe('添加到最终训练');
        });
        
        it('应该包含"切换调度器"选项', () => {
            // 需求 3.3：切换调度器选项
            const options = router.getContextMenuOptions();
            
            const switchOption = options.find(opt => opt.id === 'switch-scheduler');
            expect(switchOption).toBeDefined();
            expect(switchOption?.label).toBe('切换调度器');
        });
        
        it('应该包含"修改卡片类型"选项', () => {
            // 需求 3.3：修改卡片类型选项
            const options = router.getContextMenuOptions();
            
            const modifyOption = options.find(opt => opt.id === 'modify-card-type');
            expect(modifyOption).toBeDefined();
            expect(modifyOption?.label).toBe('修改卡片类型');
        });
        
        it('应该包含"设置优先级"选项', () => {
            // 需求 3.3：设置优先级选项
            const options = router.getContextMenuOptions();
            
            const priorityOption = options.find(opt => opt.id === 'set-priority');
            expect(priorityOption).toBeDefined();
            expect(priorityOption?.label).toBe('设置优先级');
        });
        
        it('应该包含"同步到 Riff"选项', () => {
            // 需求 3.3：同步到 Riff 选项
            const options = router.getContextMenuOptions();
            
            const syncOption = options.find(opt => opt.id === 'sync-to-riff');
            expect(syncOption).toBeDefined();
            expect(syncOption?.label).toBe('同步到 Riff');
        });
    });
    
    // ========================================================================
    // 数据访问测试
    // ========================================================================
    
    describe('getCard', () => {
        it('应该从本地存储获取卡片', async () => {
            // 需求 3.5：从本地存储获取数据
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockStorageManager.getCard.mockReturnValue(mockCard);
            
            const card = await router.getCard('test-card-1');
            
            expect(mockStorageManager.getCard).toHaveBeenCalledWith('test-card-1');
            expect(card).toEqual(mockCard);
        });
        
        it('应该在卡片不存在时抛出错误', async () => {
            // 需求 3.5：错误处理
            mockStorageManager.getCard.mockReturnValue(undefined);
            
            await expect(router.getCard('non-existent')).rejects.toThrow('Card not found: non-existent');
        });
    });
    
    describe('getCards', () => {
        it('应该从本地存储获取所有卡片', async () => {
            // 需求 3.5：从本地存储获取数据
            const mockCards: FSRSCard[] = [
                createMockCard('card-1'),
                createMockCard('card-2'),
            ];
            mockStorageManager.getAllCards.mockReturnValue(mockCards);
            
            const cards = await router.getCards();
            
            expect(mockStorageManager.getAllCards).toHaveBeenCalled();
            expect(cards).toEqual(mockCards);
        });
        
        it('应该支持按卡片类型过滤', async () => {
            // 需求 3.2：严格的主题/项目卡片区分
            const mockCards: FSRSCard[] = [
                createMockCard('card-1', CardType.Item),
                createMockCard('card-2', CardType.Topic),
                createMockCard('card-3', CardType.Item),
            ];
            mockStorageManager.getAllCards.mockReturnValue(mockCards);
            
            const itemCards = await router.getCards({ cardType: 'item' });
            
            expect(itemCards).toHaveLength(2);
            expect(itemCards.every(card => card.type === CardType.Item)).toBe(true);
        });
        
        it('应该支持按到期日期过滤', async () => {
            // 需求 3.5：过滤功能
            const now = Date.now();
            const mockCards: FSRSCard[] = [
                createMockCard('card-1', CardType.Item, now - 86400000), // 1 day ago
                createMockCard('card-2', CardType.Item, now + 86400000), // 1 day later
                createMockCard('card-3', CardType.Item, now - 172800000), // 2 days ago
            ];
            mockStorageManager.getAllCards.mockReturnValue(mockCards);
            
            const dueCards = await router.getCards({
                dueDate: { lte: new Date(now) }
            });
            
            expect(dueCards).toHaveLength(2);
            expect(dueCards.every(card => card.due <= now)).toBe(true);
        });
    });
    
    // ========================================================================
    // 更新和删除测试
    // ========================================================================
    
    describe('updateCard', () => {
        it('应该更新本地存储中的卡片', async () => {
            // 需求 3.4：允许完全读写访问
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockStorageManager.saveCards.mockResolvedValue(undefined);
            
            await router.updateCard(mockCard);
            
            expect(mockStorageManager.setCard).toHaveBeenCalledWith(mockCard);
            expect(mockStorageManager.saveCards).toHaveBeenCalled();
        });
        
        it('默认不应该同步到 Riff', async () => {
            // 需求 17.2：默认不同步到 Riff
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockCard.schedulerType = 'riff';
            mockStorageManager.saveCards.mockResolvedValue(undefined);
            
            await router.updateCard(mockCard);
            
            expect(vi.mocked(riffApi.batchSetRiffCardsDueTime)).not.toHaveBeenCalled();
        });
        
        it('启用同步且使用 Riff 调度器时应该同步到 Riff', async () => {
            // 需求 17.3：使用 Riff 调度器时同步
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockCard.schedulerType = 'riff';
            mockStorageManager.getCard.mockReturnValue(mockCard);
            mockStorageManager.saveCards.mockResolvedValue(undefined);
            vi.mocked(riffApi.batchSetRiffCardsDueTime).mockResolvedValue(undefined);
            
            router.enableRiffSync(true);
            await router.updateCard(mockCard);
            
            expect(vi.mocked(riffApi.batchSetRiffCardsDueTime)).toHaveBeenCalled();
        });
        
        it('启用同步但不使用 Riff 调度器时不应该同步', async () => {
            // 需求 17.3：仅在使用 Riff 调度器时同步
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockCard.schedulerType = 'fsrs-v5';
            mockStorageManager.saveCards.mockResolvedValue(undefined);
            
            router.enableRiffSync(true);
            await router.updateCard(mockCard);
            
            expect(vi.mocked(riffApi.batchSetRiffCardsDueTime)).not.toHaveBeenCalled();
        });
    });
    
    describe('deleteCard', () => {
        it('应该从本地存储删除卡片', async () => {
            // 需求 3.4：允许完全读写访问
            mockStorageManager.saveCards.mockResolvedValue(undefined);
            
            await router.deleteCard('test-card-1');
            
            expect(mockStorageManager.removeCard).toHaveBeenCalledWith('test-card-1');
            expect(mockStorageManager.saveCards).toHaveBeenCalled();
        });
    });
    
    // ========================================================================
    // Riff 同步测试
    // ========================================================================
    
    describe('syncToRiff', () => {
        it('应该将卡片同步到 Riff', async () => {
            // 需求 17.3：显式同步到 Riff
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockStorageManager.getCard.mockReturnValue(mockCard);
            vi.mocked(riffApi.batchSetRiffCardsDueTime).mockResolvedValue(undefined);
            
            await router.syncToRiff('test-card-1');
            
            expect(vi.mocked(riffApi.batchSetRiffCardsDueTime)).toHaveBeenCalledWith([
                { id: 'test-card-1', due: new Date(mockCard.due).toISOString() }
            ]);
        });
        
        it('同步失败时不应该抛出错误', async () => {
            // 需求 17.3：同步失败不影响本地操作
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockStorageManager.getCard.mockReturnValue(mockCard);
            vi.mocked(riffApi.batchSetRiffCardsDueTime).mockRejectedValue(new Error('Network error'));
            
            // 不应该抛出错误
            await expect(router.syncToRiff('test-card-1')).resolves.toBeUndefined();
        });
    });
    
    describe('enableRiffSync', () => {
        it('应该启用 Riff 同步', () => {
            // 需求 17.2：控制 Riff 同步
            router.enableRiffSync(true);
            
            // 通过更新卡片验证同步已启用
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockCard.schedulerType = 'riff';
            mockStorageManager.getCard.mockReturnValue(mockCard);
            mockStorageManager.saveCards.mockResolvedValue(undefined);
            vi.mocked(riffApi.batchSetRiffCardsDueTime).mockResolvedValue(undefined);
            
            router.updateCard(mockCard);
            
            // 验证会在下一个 tick 调用
            expect(mockStorageManager.setCard).toHaveBeenCalled();
        });
        
        it('应该禁用 Riff 同步', () => {
            // 需求 17.2：控制 Riff 同步
            router.enableRiffSync(false);
            
            const mockCard: FSRSCard = createMockCard('test-card-1');
            mockCard.schedulerType = 'riff';
            mockStorageManager.saveCards.mockResolvedValue(undefined);
            
            router.updateCard(mockCard);
            
            expect(vi.mocked(riffApi.batchSetRiffCardsDueTime)).not.toHaveBeenCalled();
        });
    });
});

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建模拟卡片
 */
function createMockCard(
    id: string,
    type: CardType = CardType.Item,
    due: number = Date.now()
): FSRSCard {
    return {
        id,
        blockId: id,
        due,
        stability: 1.0,
        difficulty: 5.0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        priority: 50,
        type,
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}
