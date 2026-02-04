/**
 * RiffCleanupService 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiffCleanupService } from '../RiffCleanupService';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import * as riffApi from '@/core/siyuan/riff';

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
    getRiffCards: vi.fn(),
    removeRiffCards: vi.fn(),
}));

describe('RiffCleanupService', () => {
    let service: RiffCleanupService;
    let mockStorage: StorageManager;
    const deckId = 'test-deck-id';
    
    beforeEach(() => {
        // 创建 mock storage
        mockStorage = {
            getAllCards: vi.fn(),
        } as any;
        
        // 创建服务实例
        service = new RiffCleanupService(deckId, mockStorage);
        
        // 重置 mocks
        vi.clearAllMocks();
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    describe('scanOrphanCards', () => {
        it('should find orphan cards (Riff has but local does not)', async () => {
            // 准备测试数据
            const localCards: FSRSCard[] = [
                { id: 'card-1', blockId: 'block-1' } as FSRSCard,
                { id: 'card-2', blockId: 'block-2' } as FSRSCard,
            ];
            
            const riffCards = [
                { id: 'card-1', content: 'Card 1', hPath: '/path/1' },
                { id: 'card-2', content: 'Card 2', hPath: '/path/2' },
                { id: 'card-3', content: 'Card 3', hPath: '/path/3' }, // orphan
                { id: 'card-4', content: 'Card 4', hPath: '/path/4' }, // orphan
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            
            // 执行扫描
            const result = await service.scanOrphanCards();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.count).toBe(2);
            expect(result.orphanCards).toHaveLength(2);
            expect(result.orphanCards[0].id).toBe('card-3');
            expect(result.orphanCards[1].id).toBe('card-4');
            expect(result.orphanCards[0].content).toBe('Card 3');
            expect(result.orphanCards[0].path).toBe('/path/3');
            
            // 验证 API 调用
            expect(mockStorage.getAllCards).toHaveBeenCalledTimes(1);
            expect(riffApi.getRiffCards).toHaveBeenCalledWith(deckId, {
                dueOnly: false,
                includeNew: true
            });
        });
        
        it('should return empty list when no orphan cards', async () => {
            // 准备测试数据（本地和 Riff 完全一致）
            const localCards: FSRSCard[] = [
                { id: 'card-1', blockId: 'block-1' } as FSRSCard,
                { id: 'card-2', blockId: 'block-2' } as FSRSCard,
            ];
            
            const riffCards = [
                { id: 'card-1', content: 'Card 1', hPath: '/path/1' },
                { id: 'card-2', content: 'Card 2', hPath: '/path/2' },
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            
            // 执行扫描
            const result = await service.scanOrphanCards();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.count).toBe(0);
            expect(result.orphanCards).toHaveLength(0);
        });
        
        it('should return empty list when Riff has fewer cards than local', async () => {
            // 准备测试数据（本地比 Riff 多）
            const localCards: FSRSCard[] = [
                { id: 'card-1', blockId: 'block-1' } as FSRSCard,
                { id: 'card-2', blockId: 'block-2' } as FSRSCard,
                { id: 'card-3', blockId: 'block-3' } as FSRSCard,
            ];
            
            const riffCards = [
                { id: 'card-1', content: 'Card 1', hPath: '/path/1' },
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            
            // 执行扫描
            const result = await service.scanOrphanCards();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.count).toBe(0);
            expect(result.orphanCards).toHaveLength(0);
        });
        
        it('should handle Riff API error', async () => {
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(new Error('Network error'));
            
            // 执行扫描
            const result = await service.scanOrphanCards();
            
            // 验证结果
            expect(result.success).toBe(false);
            expect(result.count).toBe(0);
            expect(result.orphanCards).toHaveLength(0);
            expect(result.errorMessage).toBe('Network error');
        });
        
        it('should handle empty local storage', async () => {
            // 准备测试数据（本地为空）
            const localCards: FSRSCard[] = [];
            
            const riffCards = [
                { id: 'card-1', content: 'Card 1', hPath: '/path/1' },
                { id: 'card-2', content: 'Card 2', hPath: '/path/2' },
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            
            // 执行扫描
            const result = await service.scanOrphanCards();
            
            // 验证结果（所有 Riff 卡片都是残留）
            expect(result.success).toBe(true);
            expect(result.count).toBe(2);
            expect(result.orphanCards).toHaveLength(2);
        });
        
        it('should handle empty Riff', async () => {
            // 准备测试数据（Riff 为空）
            const localCards: FSRSCard[] = [
                { id: 'card-1', blockId: 'block-1' } as FSRSCard,
            ];
            
            const riffCards: any[] = [];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            
            // 执行扫描
            const result = await service.scanOrphanCards();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.count).toBe(0);
            expect(result.orphanCards).toHaveLength(0);
        });
    });
    
    describe('cleanupOrphanCards', () => {
        it('should delete orphan cards successfully', async () => {
            // 准备测试数据
            const orphanCards = [
                { id: 'card-3', blockId: 'card-3', content: 'Card 3' },
                { id: 'card-4', blockId: 'card-4', content: 'Card 4' },
            ];
            
            // 设置 mocks
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue({ name: 'test', size: 0 });
            
            // 执行清理
            const result = await service.cleanupOrphanCards(orphanCards);
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(2);
            expect(result.failedCount).toBe(0);
            
            // 验证 API 调用
            expect(riffApi.removeRiffCards).toHaveBeenCalledWith(deckId, ['card-3', 'card-4']);
        });
        
        it('should handle empty orphan list', async () => {
            // 执行清理（空列表）
            const result = await service.cleanupOrphanCards([]);
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(0);
            expect(result.failedCount).toBe(0);
            
            // 验证 API 未被调用
            expect(riffApi.removeRiffCards).not.toHaveBeenCalled();
        });
        
        it('should handle Riff API error', async () => {
            // 准备测试数据
            const orphanCards = [
                { id: 'card-3', blockId: 'card-3', content: 'Card 3' },
            ];
            
            // 设置 mocks
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Delete failed'));
            
            // 执行清理
            const result = await service.cleanupOrphanCards(orphanCards);
            
            // 验证结果
            expect(result.success).toBe(false);
            expect(result.deletedCount).toBe(0);
            expect(result.failedCount).toBe(1);
            expect(result.errorMessage).toBe('Delete failed');
        });
    });
    
    describe('scanAndCleanup', () => {
        it('should scan and cleanup orphan cards', async () => {
            // 准备测试数据
            const localCards: FSRSCard[] = [
                { id: 'card-1', blockId: 'block-1' } as FSRSCard,
            ];
            
            const riffCards = [
                { id: 'card-1', content: 'Card 1', hPath: '/path/1' },
                { id: 'card-2', content: 'Card 2', hPath: '/path/2' }, // orphan
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue({ name: 'test', size: 0 });
            
            // 执行扫描和清理
            const result = await service.scanAndCleanup();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1);
            expect(result.failedCount).toBe(0);
            
            // 验证 API 调用
            expect(riffApi.getRiffCards).toHaveBeenCalledTimes(1);
            expect(riffApi.removeRiffCards).toHaveBeenCalledWith(deckId, ['card-2']);
        });
        
        it('should return success when no orphan cards found', async () => {
            // 准备测试数据（无残留）
            const localCards: FSRSCard[] = [
                { id: 'card-1', blockId: 'block-1' } as FSRSCard,
            ];
            
            const riffCards = [
                { id: 'card-1', content: 'Card 1', hPath: '/path/1' },
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            
            // 执行扫描和清理
            const result = await service.scanAndCleanup();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(0);
            expect(result.failedCount).toBe(0);
            
            // 验证 removeRiffCards 未被调用
            expect(riffApi.removeRiffCards).not.toHaveBeenCalled();
        });
        
        it('should handle scan error', async () => {
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(new Error('Scan failed'));
            
            // 执行扫描和清理
            const result = await service.scanAndCleanup();
            
            // 验证结果
            expect(result.success).toBe(false);
            expect(result.deletedCount).toBe(0);
            expect(result.failedCount).toBe(0);
            expect(result.errorMessage).toBe('Scan failed');
            
            // 验证 removeRiffCards 未被调用
            expect(riffApi.removeRiffCards).not.toHaveBeenCalled();
        });
        
        it('should handle cleanup error', async () => {
            // 准备测试数据
            const localCards: FSRSCard[] = [];
            
            const riffCards = [
                { id: 'card-1', content: 'Card 1', hPath: '/path/1' },
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Cleanup failed'));
            
            // 执行扫描和清理
            const result = await service.scanAndCleanup();
            
            // 验证结果
            expect(result.success).toBe(false);
            expect(result.deletedCount).toBe(0);
            expect(result.failedCount).toBe(1);
            expect(result.errorMessage).toBe('Cleanup failed');
        });
    });
    
    describe('edge cases', () => {
        it('should handle large number of orphan cards', async () => {
            // 准备测试数据（1000 张残留卡片）
            const localCards: FSRSCard[] = [];
            
            const riffCards = Array.from({ length: 1000 }, (_, i) => ({
                id: `card-${i}`,
                content: `Card ${i}`,
                hPath: `/path/${i}`
            }));
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue({ name: 'test', size: 0 });
            
            // 执行扫描和清理
            const result = await service.scanAndCleanup();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1000);
            expect(result.failedCount).toBe(0);
        });
        
        it('should handle cards with missing content and path', async () => {
            // 准备测试数据（卡片缺少 content 和 path）
            const localCards: FSRSCard[] = [];
            
            const riffCards = [
                { id: 'card-1' }, // 缺少 content 和 hPath
            ];
            
            // 设置 mocks
            vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(riffCards as any);
            
            // 执行扫描
            const result = await service.scanOrphanCards();
            
            // 验证结果
            expect(result.success).toBe(true);
            expect(result.count).toBe(1);
            expect(result.orphanCards[0].id).toBe('card-1');
            expect(result.orphanCards[0].content).toBeUndefined();
            expect(result.orphanCards[0].path).toBeUndefined();
        });
    });
});
