/**
 * HybridSyncService 错误处理测试
 * 
 * 测试所有同步操作的错误处理场景：
 * - 网络错误
 * - API 错误
 * - 删除同步失败
 * - 全量同步失败
 * - 增量同步失败
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HybridSyncService, type HybridSyncConfig } from '../HybridSyncService';
import type { StorageManager } from '@/core/storage/manager';
import * as riffApi from '@/core/siyuan/riff';

// Mock Riff API
vi.mock('@/core/siyuan/riff', () => ({
    getRiffCards: vi.fn(),
    getRiffNewCards: vi.fn(),
    removeRiffCards: vi.fn(),
}));

// Mock card-builder
vi.mock('@/core/card-builder', () => ({
    batchDetectCardType: vi.fn(),
    initializeAFactor: vi.fn(() => 2.5),
}));

// Mock siyuan API
vi.mock('@/core/siyuan/api', () => ({
    setBlockAttrs: vi.fn(),
}));

describe('HybridSyncService - 错误处理测试', () => {
    let service: HybridSyncService;
    let mockStorage: StorageManager;
    let config: HybridSyncConfig;
    
    beforeEach(() => {
        // 创建 mock storage
        mockStorage = {
            getCard: vi.fn(),
            setCard: vi.fn(),
            removeCard: vi.fn(),
            getAllCards: vi.fn(() => []),
            saveCards: vi.fn(),
            getRiffBlacklist: vi.fn(() => new Set()),
            addToRiffBlacklist: vi.fn(),
            removeFromRiffBlacklist: vi.fn(),
            saveRiffBlacklist: vi.fn(),
        } as any;
        
        // 创建配置
        config = {
            deckId: 'test-deck',
            storage: mockStorage,
            incrementalSync: {
                enabled: true,
                triggers: ['plugin-start'],
                useBlacklist: true,
                autoDetectCardType: false, // 禁用自动检测以简化测试
            },
            fullSync: {
                enabled: true,
                interval: 86400000,
                cleanupBlacklist: true,
            },
            deleteSync: {
                enabled: true,
                useBlacklistFallback: true,
            },
        };
        
        // 创建服务
        service = new HybridSyncService(config);
    });
    
    afterEach(() => {
        vi.clearAllMocks();
        service.stop();
    });
    
    // ==================== 网络错误处理 ====================
    
    describe('网络错误处理', () => {
        it('增量同步：网络连接失败应该返回错误结果', async () => {
            const networkError = new Error('Network connection failed');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(networkError);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Network connection failed');
            expect(result.addedCount).toBe(0);
            expect(result.deletedCount).toBe(0);
            expect(result.skippedCount).toBe(0);
        });
        
        it('增量同步：网络超时应该返回错误结果', async () => {
            const timeoutError = new Error('Request timeout');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(timeoutError);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Request timeout');
        });
        
        it('增量同步：网络错误不应该修改本地数据', async () => {
            const networkError = new Error('Network error');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(networkError);
            
            await service.incrementalSync();
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
        
        it('增量同步：网络错误不应该更新 lastSyncTime', async () => {
            const networkError = new Error('Network error');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(networkError);
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.lastSyncTime).toBe(0);
        });
        
        it('增量同步：网络错误应该更新状态为 error', async () => {
            const networkError = new Error('Network error');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(networkError);
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.status).toBe('error');
        });
        
        it('全量同步：网络连接失败应该返回错误结果', async () => {
            const networkError = new Error('Network connection failed');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(networkError);
            
            const result = await service.fullSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Network connection failed');
            expect(result.addedCount).toBe(0);
            expect(result.deletedCount).toBe(0);
        });
        
        it('全量同步：网络错误不应该修改本地数据', async () => {
            const networkError = new Error('Network error');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(networkError);
            
            await service.fullSync();
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.removeCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
        
        it('全量同步：网络错误不应该更新 lastFullSyncTime', async () => {
            const networkError = new Error('Network error');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(networkError);
            
            await service.fullSync();
            
            const status = service.getSyncStatus();
            expect(status.lastFullSyncTime).toBe(0);
        });
        
        it('删除同步：网络错误应该返回 false', async () => {
            const networkError = new Error('Network error');
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(networkError);
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(false);
        });
        
        it('删除同步：网络错误应该加入黑名单（如果启用）', async () => {
            const networkError = new Error('Network error');
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(networkError);
            
            await service.deleteSync('card-1');
            
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith('card-1');
        });
    });
    
    // ==================== API 错误处理 ====================
    
    describe('API 错误处理', () => {
        it('增量同步：400 错误应该返回错误结果', async () => {
            const apiError = new Error('Bad Request (400)');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(apiError);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('400');
        });
        
        it('增量同步：401 未授权错误应该返回错误结果', async () => {
            const apiError = new Error('Unauthorized (401)');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(apiError);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('401');
        });
        
        it('增量同步：403 禁止访问错误应该返回错误结果', async () => {
            const apiError = new Error('Forbidden (403)');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(apiError);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('403');
        });
        
        it('增量同步：404 未找到错误应该返回错误结果', async () => {
            const apiError = new Error('Not Found (404)');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(apiError);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('404');
        });
        
        it('增量同步：500 服务器错误应该返回错误结果', async () => {
            const apiError = new Error('Internal Server Error (500)');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(apiError);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('500');
        });
        
        it('全量同步：API 错误应该返回错误结果', async () => {
            const apiError = new Error('API Error (500)');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(apiError);
            
            const result = await service.fullSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('500');
        });
        
        it('删除同步：API 错误应该返回 false 并加入黑名单', async () => {
            const apiError = new Error('API Error (500)');
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(apiError);
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(false);
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith('card-1');
        });
    });
    
    // ==================== 删除同步失败 ====================
    
    describe('删除同步失败', () => {
        it('删除失败应该返回 false', async () => {
            const error = new Error('Delete failed');
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(error);
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(false);
        });
        
        it('删除失败应该加入黑名单（如果启用）', async () => {
            const error = new Error('Delete failed');
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(error);
            
            await service.deleteSync('card-1');
            
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith('card-1');
        });
        
        it('删除失败不应该加入黑名单（如果禁用）', async () => {
            config.deleteSync.useBlacklistFallback = false;
            service = new HybridSyncService(config);
            
            const error = new Error('Delete failed');
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(error);
            
            await service.deleteSync('card-1');
            
            expect(mockStorage.addToRiffBlacklist).not.toHaveBeenCalled();
        });
        
        it('删除成功应该返回 true', async () => {
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue(undefined);
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(true);
        });
        
        it('删除成功不应该加入黑名单', async () => {
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue(undefined);
            
            await service.deleteSync('card-1');
            
            expect(mockStorage.addToRiffBlacklist).not.toHaveBeenCalled();
        });
        
        it('禁用删除同步时应该直接返回 true', async () => {
            config.deleteSync.enabled = false;
            service = new HybridSyncService(config);
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(true);
            expect(riffApi.removeRiffCards).not.toHaveBeenCalled();
        });
        
        it('删除多张卡片失败应该全部加入黑名单', async () => {
            const error = new Error('Delete failed');
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(error);
            
            await service.deleteSync('card-1');
            await service.deleteSync('card-2');
            await service.deleteSync('card-3');
            
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledTimes(3);
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith('card-1');
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith('card-2');
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith('card-3');
        });
    });
    
    // ==================== 全量同步失败 ====================
    
    describe('全量同步失败', () => {
        it('全量同步失败应该返回错误结果', async () => {
            const error = new Error('Full sync failed');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(error);
            
            const result = await service.fullSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Full sync failed');
        });
        
        it('全量同步失败不应该修改本地数据', async () => {
            const error = new Error('Full sync failed');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(error);
            
            await service.fullSync();
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.removeCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
        
        it('全量同步失败不应该修改黑名单', async () => {
            const error = new Error('Full sync failed');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(error);
            
            await service.fullSync();
            
            expect(mockStorage.removeFromRiffBlacklist).not.toHaveBeenCalled();
        });
        
        it('全量同步失败不应该更新 lastFullSyncTime', async () => {
            const error = new Error('Full sync failed');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(error);
            
            await service.fullSync();
            
            const status = service.getSyncStatus();
            expect(status.lastFullSyncTime).toBe(0);
        });
        
        it('全量同步失败应该更新状态为 error', async () => {
            const error = new Error('Full sync failed');
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(error);
            
            await service.fullSync();
            
            const status = service.getSyncStatus();
            expect(status.status).toBe('error');
        });
        
        it('全量同步部分失败：获取 Riff 卡片成功但保存失败', async () => {
            const mockRiffCards = [
                {
                    id: 'card-1',
                    riffCard: {
                        id: 'card-1',
                        blockID: 'card-1',
                        deckID: 'test-deck',
                        due: new Date().toISOString(),
                        reps: 0,
                        lapses: 0,
                        state: 0,
                        lastReview: '',
                        stability: 0,
                        difficulty: 0,
                        elapsedDays: 0,
                        scheduledDays: 0,
                    },
                },
            ];
            
            vi.mocked(riffApi.getRiffCards).mockResolvedValue(mockRiffCards as any);
            vi.mocked(mockStorage.saveCards).mockRejectedValue(new Error('Save failed'));
            
            // 全量同步应该捕获保存错误
            const result = await service.fullSync();
            
            // 由于 saveCards 在 try-catch 外部，这个测试验证错误传播
            expect(result.success).toBe(false);
        });
    });
    
    // ==================== 增量同步失败 ====================
    
    describe('增量同步失败', () => {
        it('增量同步失败应该返回错误结果', async () => {
            const error = new Error('Incremental sync failed');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(error);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Incremental sync failed');
        });
        
        it('增量同步失败不应该修改本地数据', async () => {
            const error = new Error('Incremental sync failed');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(error);
            
            await service.incrementalSync();
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
        
        it('增量同步失败不应该更新 lastSyncTime', async () => {
            const error = new Error('Incremental sync failed');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(error);
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.lastSyncTime).toBe(0);
        });
        
        it('增量同步失败应该更新状态为 error', async () => {
            const error = new Error('Incremental sync failed');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(error);
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.status).toBe('error');
        });
        
        it('增量同步失败后再次同步应该使用上次成功的 lastSyncTime', async () => {
            // 第一次同步成功
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            await service.incrementalSync();
            const firstSyncTime = service.getSyncStatus().lastSyncTime;
            
            // 第二次同步失败
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error('Sync failed'));
            await service.incrementalSync();
            
            // lastSyncTime 应该保持不变
            const status = service.getSyncStatus();
            expect(status.lastSyncTime).toBe(firstSyncTime);
            
            // 第三次同步应该使用第一次的时间戳
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            await service.incrementalSync();
            
            expect(riffApi.getRiffNewCards).toHaveBeenLastCalledWith('test-deck', firstSyncTime);
        });
        
        it('增量同步部分失败：获取卡片成功但保存失败', async () => {
            const mockRiffCards = [
                {
                    id: 'card-1',
                    riffCard: {
                        id: 'card-1',
                        blockID: 'card-1',
                        deckID: 'test-deck',
                        due: new Date().toISOString(),
                        reps: 0,
                        lapses: 0,
                        state: 0,
                        lastReview: '',
                        stability: 0,
                        difficulty: 0,
                        elapsedDays: 0,
                        scheduledDays: 0,
                    },
                },
            ];
            
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(mockRiffCards as any);
            vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
            vi.mocked(mockStorage.saveCards).mockRejectedValue(new Error('Save failed'));
            
            // 增量同步应该捕获保存错误
            const result = await service.incrementalSync();
            
            // 由于 saveCards 在 try-catch 外部，这个测试验证错误传播
            expect(result.success).toBe(false);
        });
    });
    
    // ==================== 错误恢复测试 ====================
    
    describe('错误恢复', () => {
        it('增量同步失败后再次同步应该能够成功', async () => {
            // 第一次同步失败
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error('Network error'));
            const result1 = await service.incrementalSync();
            expect(result1.success).toBe(false);
            
            // 第二次同步成功
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            const result2 = await service.incrementalSync();
            expect(result2.success).toBe(true);
        });
        
        it('全量同步失败后再次同步应该能够成功', async () => {
            // 第一次同步失败
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(new Error('Network error'));
            const result1 = await service.fullSync();
            expect(result1.success).toBe(false);
            
            // 第二次同步成功
            vi.mocked(riffApi.getRiffCards).mockResolvedValue([]);
            const result2 = await service.fullSync();
            expect(result2.success).toBe(true);
        });
        
        it('删除同步失败后再次删除应该能够成功', async () => {
            // 第一次删除失败
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Network error'));
            const result1 = await service.deleteSync('card-1');
            expect(result1).toBe(false);
            
            // 第二次删除成功
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue(undefined);
            const result2 = await service.deleteSync('card-1');
            expect(result2).toBe(true);
        });
        
        it('错误状态应该在下次成功同步后恢复', async () => {
            // 同步失败
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error('Network error'));
            await service.incrementalSync();
            expect(service.getSyncStatus().status).toBe('error');
            
            // 同步成功
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            await service.incrementalSync();
            expect(service.getSyncStatus().status).toBe('success');
        });
    });
    
    // ==================== 边界情况 ====================
    
    describe('边界情况', () => {
        it('应该处理非 Error 对象的异常', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue('String error');
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Unknown error');
        });
        
        it('应该处理 null 异常', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(null);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Unknown error');
        });
        
        it('应该处理 undefined 异常', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(undefined);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Unknown error');
        });
        
        it('应该处理空错误消息', async () => {
            const error = new Error('');
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(error);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('');
        });
    });
});
