/**
 * HybridSyncService 单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HybridSyncService, type HybridSyncConfig } from '../HybridSyncService';
import type { StorageManager } from '@/core/storage/manager';
import type { FSRSCard } from '@/types';
import * as riffApi from '@/core/siyuan/riff';
import * as cardBuilder from '@/core/card-builder';
import * as siyuanApi from '@/core/siyuan/api';

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

describe('HybridSyncService', () => {
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
        } as any;
        
        // 创建配置
        config = {
            deckId: 'test-deck',
            storage: mockStorage,
            incrementalSync: {
                enabled: true,
                triggers: ['plugin-start'],
                useBlacklist: true,
                autoDetectCardType: true,
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
    
    describe('构造函数', () => {
        it('应该正确初始化配置', () => {
            expect(service).toBeDefined();
            const status = service.getSyncStatus();
            expect(status.status).toBe('idle');
            expect(status.lastSyncTime).toBe(0);
            expect(status.lastFullSyncTime).toBe(0);
        });
    });
    
    describe('start()', () => {
        it('应该启动同步服务', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            await service.start();
            
            expect(riffApi.getRiffNewCards).toHaveBeenCalled();
        });
        
        it('应该在启用时执行初始增量同步', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            await service.start();
            
            expect(riffApi.getRiffNewCards).toHaveBeenCalledWith('test-deck', undefined);
        });
        
        it('应该启动全量同步定时器', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            vi.useFakeTimers();
            
            await service.start();
            
            // 验证定时器已设置
            expect(vi.getTimerCount()).toBeGreaterThan(0);
            
            vi.useRealTimers();
        });
        
        it('禁用增量同步时不应该执行初始同步', async () => {
            config.incrementalSync.enabled = false;
            service = new HybridSyncService(config);
            
            await service.start();
            
            expect(riffApi.getRiffNewCards).not.toHaveBeenCalled();
        });
        
        it('禁用全量同步时不应该启动定时器', async () => {
            config.fullSync.enabled = false;
            config.incrementalSync.enabled = false;
            service = new HybridSyncService(config);
            vi.useFakeTimers();
            
            await service.start();
            
            // 验证没有定时器
            expect(vi.getTimerCount()).toBe(0);
            
            vi.useRealTimers();
        });
    });
    
    describe('stop()', () => {
        it('应该停止同步服务', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            await service.start();
            service.stop();
            
            // 验证定时器已清除（通过检查状态）
            const status = service.getSyncStatus();
            expect(status).toBeDefined();
        });
        
        it('应该清除全量同步定时器', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            vi.useFakeTimers();
            
            await service.start();
            const timerCountBefore = vi.getTimerCount();
            expect(timerCountBefore).toBeGreaterThan(0);
            
            service.stop();
            const timerCountAfter = vi.getTimerCount();
            expect(timerCountAfter).toBe(0);
            
            vi.useRealTimers();
        });
        
        it('多次调用 stop() 应该安全', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            await service.start();
            service.stop();
            service.stop(); // 第二次调用
            
            // 不应该抛出错误
            const status = service.getSyncStatus();
            expect(status).toBeDefined();
        });
        
        it('未启动时调用 stop() 应该安全', () => {
            service.stop();
            
            // 不应该抛出错误
            const status = service.getSyncStatus();
            expect(status).toBeDefined();
        });
    });
    
    describe('incrementalSync()', () => {
        it('应该获取新卡片并添加到本地', async () => {
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
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(result.skippedCount).toBe(0);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
            expect(mockStorage.saveCards).toHaveBeenCalled();
        });
        
        it('应该处理多张新卡片', async () => {
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
                {
                    id: 'card-2',
                    riffCard: {
                        id: 'card-2',
                        blockID: 'card-2',
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
                {
                    id: 'card-3',
                    riffCard: {
                        id: 'card-3',
                        blockID: 'card-3',
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
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(3);
            expect(result.skippedCount).toBe(0);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(3);
            expect(mockStorage.saveCards).toHaveBeenCalled();
        });
        
        it('应该处理空的新卡片列表', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(0);
            expect(result.skippedCount).toBe(0);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
        
        it('应该使用 lastSyncTime 作为参数', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            // 第一次同步
            await service.incrementalSync();
            const firstSyncTime = service.getSyncStatus().lastSyncTime;
            
            // 第二次同步
            await service.incrementalSync();
            
            // 验证第二次调用使用了第一次的时间戳
            expect(riffApi.getRiffNewCards).toHaveBeenLastCalledWith('test-deck', firstSyncTime);
        });
        
        it('应该过滤黑名单中的卡片', async () => {
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
            vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set(['card-1']));
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(0);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该过滤黑名单中的部分卡片', async () => {
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
                {
                    id: 'card-2',
                    riffCard: {
                        id: 'card-2',
                        blockID: 'card-2',
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
                {
                    id: 'card-3',
                    riffCard: {
                        id: 'card-3',
                        blockID: 'card-3',
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
            vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set(['card-1', 'card-3']));
            vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
            // 验证只添加了 card-2
            const addedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(addedCard.id).toBe('card-2');
        });
        
        it('禁用黑名单时不应该过滤', async () => {
            config.incrementalSync.useBlacklist = false;
            service = new HybridSyncService(config);
            
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
            vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set(['card-1']));
            vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
        });
        
        it('应该跳过本地已存在的卡片', async () => {
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
            vi.mocked(mockStorage.getCard).mockReturnValue({} as FSRSCard);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(0);
            expect(result.skippedCount).toBe(1);
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该处理混合场景：部分新卡片，部分已存在', async () => {
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
                {
                    id: 'card-2',
                    riffCard: {
                        id: 'card-2',
                        blockID: 'card-2',
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
                {
                    id: 'card-3',
                    riffCard: {
                        id: 'card-3',
                        blockID: 'card-3',
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
            vi.mocked(mockStorage.getCard).mockImplementation((id) => {
                // card-1 和 card-3 已存在，card-2 不存在
                if (id === 'card-1' || id === 'card-3') {
                    return {} as FSRSCard;
                }
                return undefined;
            });
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(result.skippedCount).toBe(2);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
            // 验证只添加了 card-2
            const addedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(addedCard.id).toBe('card-2');
        });
        
        it('应该保留本地已存在卡片的数据', async () => {
            const mockRiffCards = [
                {
                    id: 'card-1',
                    riffCard: {
                        id: 'card-1',
                        blockID: 'card-1',
                        deckID: 'test-deck',
                        due: new Date().toISOString(),
                        reps: 5,
                        lapses: 2,
                        state: 2,
                        lastReview: new Date().toISOString(),
                        stability: 10,
                        difficulty: 5,
                        elapsedDays: 3,
                        scheduledDays: 7,
                    },
                },
            ];
            
            const existingCard: FSRSCard = {
                id: 'card-1',
                blockId: 'card-1',
                due: Date.now() + 86400000,
                stability: 20,
                difficulty: 3,
                elapsedDays: 5,
                scheduledDays: 10,
                reps: 10,
                lapses: 1,
                state: 2,
                lastReview: Date.now() - 86400000,
            };
            
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(mockRiffCards as any);
            vi.mocked(mockStorage.getCard).mockReturnValue(existingCard);
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(0);
            expect(result.skippedCount).toBe(1);
            // 验证没有覆盖本地数据
            expect(mockStorage.setCard).not.toHaveBeenCalled();
        });
        
        it('应该在失败时返回错误', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error('Network error'));
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Network error');
        });
        
        it('应该处理未知错误类型', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue('Unknown error');
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(false);
            expect(result.errorMessage).toBe('Unknown error');
        });
        
        it('失败时不应该修改本地数据', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error('Network error'));
            
            await service.incrementalSync();
            
            expect(mockStorage.setCard).not.toHaveBeenCalled();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
        
        it('应该更新 lastSyncTime', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            const beforeTime = Date.now();
            await service.incrementalSync();
            const afterTime = Date.now();
            
            const status = service.getSyncStatus();
            expect(status.lastSyncTime).toBeGreaterThanOrEqual(beforeTime);
            expect(status.lastSyncTime).toBeLessThanOrEqual(afterTime);
        });
        
        it('成功时应该更新同步状态为 success', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.status).toBe('success');
        });
        
        it('同步过程中状态应该为 syncing', async () => {
            let statusDuringSyncing: string | undefined;
            
            vi.mocked(riffApi.getRiffNewCards).mockImplementation(async () => {
                // 在同步过程中检查状态
                statusDuringSyncing = service.getSyncStatus().status;
                return [];
            });
            
            await service.incrementalSync();
            
            expect(statusDuringSyncing).toBe('syncing');
        });
        
        it('失败时不应该更新 lastSyncTime', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error('Network error'));
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.lastSyncTime).toBe(0);
        });
        
        it('失败时应该更新同步状态为 error', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error('Network error'));
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.status).toBe('error');
        });
        
        it('应该正确转换 RiffCard 为 FSRSCard', async () => {
            const dueDate = new Date('2024-01-15T10:00:00Z');
            const lastReviewDate = new Date('2024-01-10T10:00:00Z');
            
            const mockRiffCards = [
                {
                    id: 'card-1',
                    riffCard: {
                        id: 'card-1',
                        blockID: 'card-1',
                        deckID: 'test-deck',
                        due: dueDate.toISOString(),
                        reps: 5,
                        lapses: 2,
                        state: 2,
                        lastReview: lastReviewDate.toISOString(),
                        stability: 10.5,
                        difficulty: 5.2,
                        elapsedDays: 5,
                        scheduledDays: 7,
                    },
                },
            ];
            
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(mockRiffCards as any);
            vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
            
            await service.incrementalSync();
            
            expect(mockStorage.setCard).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'card-1',
                    blockId: 'card-1',
                    due: dueDate.getTime(),
                    stability: 10.5,
                    difficulty: 5.2,
                    elapsedDays: 5,
                    scheduledDays: 7,
                    reps: 5,
                    lapses: 2,
                    state: 2,
                    lastReview: lastReviewDate.getTime(),
                    deckID: 'test-deck',
                })
            );
        });
        
        it('应该处理缺少 riffCard 数据的情况', async () => {
            const mockRiffCards = [
                {
                    id: 'card-1',
                    riffCard: undefined,
                },
            ];
            
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(mockRiffCards as any);
            vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
            
            await service.incrementalSync();
            
            // 应该使用默认值
            expect(mockStorage.setCard).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'card-1',
                    blockId: 'card-1',
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                    reps: 0,
                    lapses: 0,
                    state: 0,
                    lastReview: 0, // 修复：无效日期应该被转换为 0，而不是 undefined
                    deckID: 'test-deck',
                })
            );
        });
        
        it('只有添加卡片时才保存', async () => {
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
            
            // 测试1: 有新卡片添加
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(mockRiffCards as any);
            vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
            
            await service.incrementalSync();
            expect(mockStorage.saveCards).toHaveBeenCalled();
            
            vi.clearAllMocks();
            
            // 测试2: 没有新卡片添加（都被跳过）
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(mockRiffCards as any);
            vi.mocked(mockStorage.getCard).mockReturnValue({} as FSRSCard);
            
            await service.incrementalSync();
            expect(mockStorage.saveCards).not.toHaveBeenCalled();
        });
    });
    
    describe('fullSync()', () => {
        it('应该检测并添加新卡片', async () => {
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
            vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
            
            const result = await service.fullSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(result.deletedCount).toBe(0);
            expect(mockStorage.setCard).toHaveBeenCalledTimes(1);
        });
        
        it('应该检测并删除本地多余的卡片', async () => {
            vi.mocked(riffApi.getRiffCards).mockResolvedValue([]);
            vi.mocked(mockStorage.getAllCards).mockReturnValue([
                { id: 'card-1', blockId: 'card-1' } as FSRSCard,
            ]);
            
            const result = await service.fullSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(0);
            expect(result.deletedCount).toBe(1);
            expect(mockStorage.removeCard).toHaveBeenCalledWith('card-1');
        });
        
        it('应该清理黑名单', async () => {
            vi.mocked(riffApi.getRiffCards).mockResolvedValue([]);
            vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
            vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set(['card-1', 'card-2']));
            
            const result = await service.fullSync();
            
            expect(result.success).toBe(true);
            expect(result.blacklistCleanedCount).toBe(2);
            expect(mockStorage.removeFromRiffBlacklist).toHaveBeenCalledTimes(2);
        });
        
        it('应该更新 lastFullSyncTime', async () => {
            vi.mocked(riffApi.getRiffCards).mockResolvedValue([]);
            vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
            
            const beforeTime = Date.now();
            await service.fullSync();
            const afterTime = Date.now();
            
            const status = service.getSyncStatus();
            expect(status.lastFullSyncTime).toBeGreaterThanOrEqual(beforeTime);
            expect(status.lastFullSyncTime).toBeLessThanOrEqual(afterTime);
        });
        
        it('失败时不应该更新 lastFullSyncTime', async () => {
            vi.mocked(riffApi.getRiffCards).mockRejectedValue(new Error('Network error'));
            
            await service.fullSync();
            
            const status = service.getSyncStatus();
            expect(status.lastFullSyncTime).toBe(0);
        });
    });
    
    describe('deleteSync()', () => {
        it('应该从 Riff 删除卡片', async () => {
            vi.mocked(riffApi.removeRiffCards).mockResolvedValue({} as any);
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(true);
            expect(riffApi.removeRiffCards).toHaveBeenCalledWith('test-deck', ['card-1']);
        });
        
        it('删除失败时应该加入黑名单', async () => {
            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Network error'));
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(false);
            expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith('card-1');
        });
        
        it('禁用时应该直接返回成功', async () => {
            config.deleteSync.enabled = false;
            service = new HybridSyncService(config);
            
            const result = await service.deleteSync('card-1');
            
            expect(result).toBe(true);
            expect(riffApi.removeRiffCards).not.toHaveBeenCalled();
        });
    });
    
    describe('getSyncStatus()', () => {
        it('应该返回当前同步状态', () => {
            const status = service.getSyncStatus();
            
            expect(status).toEqual({
                status: 'idle',
                lastSyncTime: 0,
                lastFullSyncTime: 0,
            });
        });
        
        it('应该在同步后更新状态', async () => {
            vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([]);
            
            await service.incrementalSync();
            
            const status = service.getSyncStatus();
            expect(status.status).toBe('success');
            expect(status.lastSyncTime).toBeGreaterThan(0);
        });
    });
    
    describe('自动检测卡片类型', () => {
        it('增量同步时应该自动检测新卡片类型', async () => {
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
            vi.mocked(cardBuilder.batchDetectCardType).mockResolvedValue(
                new Map([['card-1', 'item']])
            );
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(result.detectedCount).toBe(1);
            expect(cardBuilder.batchDetectCardType).toHaveBeenCalledWith(['card-1']);
            expect(siyuanApi.setBlockAttrs).toHaveBeenCalled();
        });
        
        it('全量同步时应该自动检测新卡片类型', async () => {
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
            vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
            vi.mocked(cardBuilder.batchDetectCardType).mockResolvedValue(
                new Map([['card-1', 'topic']])
            );
            
            const result = await service.fullSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(result.detectedCount).toBe(1);
            expect(cardBuilder.batchDetectCardType).toHaveBeenCalledWith(['card-1']);
            expect(siyuanApi.setBlockAttrs).toHaveBeenCalled();
        });
        
        it('检测到 Topic 类型时应该初始化 A-Factor', async () => {
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
            vi.mocked(cardBuilder.batchDetectCardType).mockResolvedValue(
                new Map([['card-1', 'topic']])
            );
            vi.mocked(cardBuilder.initializeAFactor).mockReturnValue(2.5);
            
            await service.incrementalSync();
            
            expect(cardBuilder.initializeAFactor).toHaveBeenCalledWith(50);
            expect(siyuanApi.setBlockAttrs).toHaveBeenCalledWith(
                'card-1',
                expect.objectContaining({
                    'custom-fsrs-card-type': 'topic',
                    'custom-fsrs-a-factor': '2.5',
                })
            );
        });
        
        it('禁用自动检测时不应该检测卡片类型', async () => {
            config.incrementalSync.autoDetectCardType = false;
            service = new HybridSyncService(config);
            
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
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.detectedCount).toBeUndefined();
            expect(cardBuilder.batchDetectCardType).not.toHaveBeenCalled();
        });
        
        it('检测失败时不应该影响同步结果', async () => {
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
            vi.mocked(cardBuilder.batchDetectCardType).mockRejectedValue(new Error('Detection failed'));
            
            const result = await service.incrementalSync();
            
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            expect(result.detectedCount).toBe(0);
        });
    });
});

// ==================== 属性测试 (Property-Based Tests) ====================

import * as fc from 'fast-check';

describe('HybridSyncService - Property-Based Tests', () => {
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
    
    // ==================== Arbitraries (生成器) ====================
    
    /**
     * 生成随机卡片 ID
     */
    const cardIdArbitrary = fc.string({ minLength: 1, maxLength: 20 }).map(s => `card-${s}`);
    
    /**
     * 生成随机 RiffBlock
     */
    const riffBlockArbitrary = fc.record({
        id: cardIdArbitrary,
        riffCard: fc.record({
            id: cardIdArbitrary,
            blockID: cardIdArbitrary,
            deckID: fc.constant('test-deck'),
            due: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') }).map(ts => new Date(ts).toISOString()),
            reps: fc.nat({ max: 100 }),
            lapses: fc.nat({ max: 50 }),
            state: fc.integer({ min: 0, max: 3 }),
            lastReview: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2030-12-31') }).map(ts => new Date(ts).toISOString()),
            stability: fc.float({ min: 0, max: 100 }),
            difficulty: fc.float({ min: 0, max: 10 }),
            elapsedDays: fc.nat({ max: 365 }),
            scheduledDays: fc.nat({ max: 365 }),
        }),
    });
    
    /**
     * 生成随机 FSRSCard
     */
    const fsrsCardArbitrary = fc.record({
        id: cardIdArbitrary,
        blockId: cardIdArbitrary,
        due: fc.nat(),
        stability: fc.float({ min: 0, max: 100 }),
        difficulty: fc.float({ min: 0, max: 10 }),
        elapsedDays: fc.nat({ max: 365 }),
        scheduledDays: fc.nat({ max: 365 }),
        reps: fc.nat({ max: 100 }),
        lapses: fc.nat({ max: 50 }),
        state: fc.integer({ min: 0, max: 3 }),
        lastReview: fc.option(fc.nat(), { nil: undefined }),
        deckID: fc.constant('test-deck'),
    });
    
    // ==================== incrementalSync() 属性测试 ====================
    
    describe('incrementalSync() - Property-Based Tests', () => {
        /**
         * **Validates: Requirements 1.4, 1.5**
         * 
         * 属性：增量同步应该过滤黑名单中的所有卡片
         * 
         * 对于任意的新卡片集合和黑名单：
         * - 黑名单中的卡片不应该被添加到本地
         * - 非黑名单中的卡片应该被添加到本地（如果本地不存在）
         */
        it('Property: 增量同步应该过滤黑名单中的所有卡片', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    fc.array(cardIdArbitrary, { maxLength: 20 }),
                    async (newCards, blacklistIds) => {
                        // 确保 ID 唯一
                        const uniqueNewCards = Array.from(
                            new Map(newCards.map(c => [c.id, c])).values()
                        );
                        const uniqueBlacklistIds = new Set(blacklistIds);
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(uniqueNewCards as any);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(uniqueBlacklistIds);
                        vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
                        
                        const addedCards: FSRSCard[] = [];
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            addedCards.push(card);
                        });
                        
                        // Execute
                        const result = await service.incrementalSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        
                        // 计算预期添加的卡片（不在黑名单中）
                        const expectedAdded = uniqueNewCards.filter(c => !uniqueBlacklistIds.has(c.id));
                        
                        // 验证添加数量
                        expect(result.addedCount).toBe(expectedAdded.length);
                        expect(addedCards.length).toBe(expectedAdded.length);
                        
                        // 验证添加的卡片 ID 正确
                        const addedCardIds = new Set(addedCards.map(c => c.id));
                        for (const card of expectedAdded) {
                            expect(addedCardIds.has(card.id)).toBe(true);
                        }
                        
                        // 验证黑名单中的卡片没有被添加
                        for (const card of uniqueNewCards) {
                            if (uniqueBlacklistIds.has(card.id)) {
                                expect(addedCardIds.has(card.id)).toBe(false);
                            }
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.4**
         * 
         * 属性：增量同步应该跳过本地已存在的卡片
         * 
         * 对于任意的新卡片集合和本地卡片集合：
         * - 本地已存在的卡片不应该被覆盖
         * - 本地不存在的卡片应该被添加
         */
        it('Property: 增量同步应该跳过本地已存在的卡片', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    fc.array(cardIdArbitrary, { maxLength: 20 }),
                    async (newCards, existingCardIds) => {
                        // 确保 ID 唯一
                        const uniqueNewCards = Array.from(
                            new Map(newCards.map(c => [c.id, c])).values()
                        );
                        const existingCardIdSet = new Set(existingCardIds);
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(uniqueNewCards as any);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        vi.mocked(mockStorage.getCard).mockImplementation((id) => {
                            return existingCardIdSet.has(id) ? ({} as FSRSCard) : undefined;
                        });
                        
                        const addedCards: FSRSCard[] = [];
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            addedCards.push(card);
                        });
                        
                        // Execute
                        const result = await service.incrementalSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        
                        // 计算预期添加和跳过的卡片
                        const expectedAdded = uniqueNewCards.filter(c => !existingCardIdSet.has(c.id));
                        const expectedSkipped = uniqueNewCards.filter(c => existingCardIdSet.has(c.id));
                        
                        // 验证数量
                        expect(result.addedCount).toBe(expectedAdded.length);
                        expect(result.skippedCount).toBe(expectedSkipped.length);
                        expect(addedCards.length).toBe(expectedAdded.length);
                        
                        // 验证添加的卡片 ID 正确
                        const addedCardIds = new Set(addedCards.map(c => c.id));
                        for (const card of expectedAdded) {
                            expect(addedCardIds.has(card.id)).toBe(true);
                        }
                        
                        // 验证已存在的卡片没有被添加
                        for (const card of uniqueNewCards) {
                            if (existingCardIdSet.has(card.id)) {
                                expect(addedCardIds.has(card.id)).toBe(false);
                            }
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.4, 1.5**
         * 
         * 属性：增量同步应该同时应用黑名单过滤和本地存在检查
         * 
         * 对于任意的新卡片集合、黑名单和本地卡片集合：
         * - 黑名单中的卡片不应该被添加
         * - 本地已存在的卡片不应该被添加
         * - 只有不在黑名单且本地不存在的卡片才应该被添加
         */
        it('Property: 增量同步应该同时应用黑名单过滤和本地存在检查', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    fc.array(cardIdArbitrary, { maxLength: 10 }),
                    fc.array(cardIdArbitrary, { maxLength: 10 }),
                    async (newCards, blacklistIds, existingCardIds) => {
                        // 确保 ID 唯一
                        const uniqueNewCards = Array.from(
                            new Map(newCards.map(c => [c.id, c])).values()
                        );
                        const blacklistIdSet = new Set(blacklistIds);
                        const existingCardIdSet = new Set(existingCardIds);
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(uniqueNewCards as any);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(blacklistIdSet);
                        vi.mocked(mockStorage.getCard).mockImplementation((id) => {
                            return existingCardIdSet.has(id) ? ({} as FSRSCard) : undefined;
                        });
                        
                        const addedCards: FSRSCard[] = [];
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            addedCards.push(card);
                        });
                        
                        // Execute
                        const result = await service.incrementalSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        
                        // 计算预期添加的卡片（不在黑名单且本地不存在）
                        const expectedAdded = uniqueNewCards.filter(
                            c => !blacklistIdSet.has(c.id) && !existingCardIdSet.has(c.id)
                        );
                        
                        // 验证添加数量
                        expect(result.addedCount).toBe(expectedAdded.length);
                        expect(addedCards.length).toBe(expectedAdded.length);
                        
                        // 验证添加的卡片 ID 正确
                        const addedCardIds = new Set(addedCards.map(c => c.id));
                        for (const card of expectedAdded) {
                            expect(addedCardIds.has(card.id)).toBe(true);
                        }
                        
                        // 验证黑名单或已存在的卡片没有被添加
                        for (const card of uniqueNewCards) {
                            if (blacklistIdSet.has(card.id) || existingCardIdSet.has(card.id)) {
                                expect(addedCardIds.has(card.id)).toBe(false);
                            }
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.4**
         * 
         * 属性：增量同步的幂等性（在没有新卡片的情况下）
         * 
         * 对于任意的卡片集合：
         * - 第一次同步后，第二次同步不应该添加任何卡片
         * - 第二次同步应该跳过所有卡片（因为都已存在）
         */
        it('Property: 增量同步应该是幂等的', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    async (newCards) => {
                        // 确保 ID 唯一
                        const uniqueNewCards = Array.from(
                            new Map(newCards.map(c => [c.id, c])).values()
                        );
                        
                        // Setup mocks for first sync
                        vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(uniqueNewCards as any);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
                        
                        let currentLocalCards: FSRSCard[] = [];
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            currentLocalCards.push(card);
                        });
                        
                        // 第一次同步
                        const result1 = await service.incrementalSync();
                        expect(result1.success).toBe(true);
                        
                        const addedCount1 = result1.addedCount;
                        
                        // 更新 mock 以反映第一次同步后的状态
                        const localCardIds = new Set(currentLocalCards.map(c => c.id));
                        vi.mocked(mockStorage.getCard).mockImplementation((id) => {
                            return localCardIds.has(id) ? ({} as FSRSCard) : undefined;
                        });
                        
                        // 清除计数器
                        vi.clearAllMocks();
                        vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(uniqueNewCards as any);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        vi.mocked(mockStorage.getCard).mockImplementation((id) => {
                            return localCardIds.has(id) ? ({} as FSRSCard) : undefined;
                        });
                        
                        let secondSyncAdded = 0;
                        vi.mocked(mockStorage.setCard).mockImplementation(() => {
                            secondSyncAdded++;
                        });
                        
                        // 第二次同步
                        const result2 = await service.incrementalSync();
                        expect(result2.success).toBe(true);
                        
                        // 验证第二次同步没有添加任何卡片
                        expect(result2.addedCount).toBe(0);
                        expect(result2.skippedCount).toBe(addedCount1);
                        expect(secondSyncAdded).toBe(0);
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.4**
         * 
         * 属性：增量同步应该正确转换 RiffCard 为 FSRSCard
         * 
         * 对于任意的 RiffBlock：
         * - 转换后的 FSRSCard 应该包含所有必要字段
         * - 日期字段应该正确转换为时间戳
         * - 数值字段应该保持不变（NaN 转换为 0）
         */
        it('Property: 增量同步应该正确转换 RiffCard 为 FSRSCard', async () => {
            await fc.assert(
                fc.asyncProperty(
                    riffBlockArbitrary,
                    async (riffCard) => {
                        // 清除之前的 mock 调用
                        vi.clearAllMocks();
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffNewCards).mockResolvedValue([riffCard] as any);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
                        
                        let addedCard: FSRSCard | undefined;
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            addedCard = card;
                        });
                        
                        // Execute
                        const result = await service.incrementalSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        expect(result.addedCount).toBe(1);
                        expect(addedCard).toBeDefined();
                        
                        if (addedCard && riffCard.riffCard) {
                            // 验证 ID 字段
                            expect(addedCard.id).toBe(riffCard.id);
                            expect(addedCard.blockId).toBe(riffCard.id);
                            expect(addedCard.deckID).toBe(riffCard.riffCard.deckID);
                            
                            // 验证数值字段（NaN 应该转换为 0）
                            const expectedStability = Number.isNaN(riffCard.riffCard.stability) ? 0 : riffCard.riffCard.stability;
                            const expectedDifficulty = Number.isNaN(riffCard.riffCard.difficulty) ? 0 : riffCard.riffCard.difficulty;
                            
                            expect(addedCard.stability).toBe(expectedStability);
                            expect(addedCard.difficulty).toBe(expectedDifficulty);
                            expect(addedCard.elapsedDays).toBe(riffCard.riffCard.elapsedDays);
                            expect(addedCard.scheduledDays).toBe(riffCard.riffCard.scheduledDays);
                            expect(addedCard.reps).toBe(riffCard.riffCard.reps);
                            expect(addedCard.lapses).toBe(riffCard.riffCard.lapses);
                            expect(addedCard.state).toBe(riffCard.riffCard.state);
                            
                            // 验证日期字段转换
                            expect(addedCard.due).toBe(new Date(riffCard.riffCard.due).getTime());
                            if (riffCard.riffCard.lastReview) {
                                expect(addedCard.lastReview).toBe(new Date(riffCard.riffCard.lastReview).getTime());
                            }
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.4**
         * 
         * 属性：增量同步只在有新卡片添加时才保存
         * 
         * 对于任意的新卡片集合：
         * - 如果有新卡片被添加，应该调用 saveCards
         * - 如果没有新卡片被添加（全部跳过或空列表），不应该调用 saveCards
         */
        it('Property: 增量同步只在有新卡片添加时才保存', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { minLength: 1, maxLength: 20 }), // 至少1张卡片
                    fc.boolean(),
                    async (newCards, shouldAddCards) => {
                        // 确保 ID 唯一
                        const uniqueNewCards = Array.from(
                            new Map(newCards.map(c => [c.id, c])).values()
                        );
                        
                        // 清除之前的 mock 调用
                        vi.clearAllMocks();
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffNewCards).mockResolvedValue(uniqueNewCards as any);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        
                        if (shouldAddCards) {
                            // 本地不存在，应该添加
                            vi.mocked(mockStorage.getCard).mockReturnValue(undefined);
                        } else {
                            // 本地已存在，应该跳过
                            vi.mocked(mockStorage.getCard).mockReturnValue({} as FSRSCard);
                        }
                        
                        // Execute
                        const result = await service.incrementalSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        
                        if (shouldAddCards) {
                            // 有新卡片添加，应该调用 saveCards
                            expect(result.addedCount).toBeGreaterThan(0);
                            expect(mockStorage.saveCards).toHaveBeenCalled();
                        } else {
                            // 没有新卡片添加，不应该调用 saveCards
                            expect(result.addedCount).toBe(0);
                            expect(mockStorage.saveCards).not.toHaveBeenCalled();
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.4**
         * 
         * 属性：增量同步失败时不应该修改本地数据
         * 
         * 对于任意的错误：
         * - 如果 getRiffNewCards 失败，不应该调用 setCard
         * - 如果 getRiffNewCards 失败，不应该调用 saveCards
         * - 应该返回失败结果
         */
        it('Property: 增量同步失败时不应该修改本地数据', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    async (errorMessage) => {
                        // Setup: 模拟失败
                        vi.mocked(riffApi.getRiffNewCards).mockRejectedValue(new Error(errorMessage));
                        
                        // Execute
                        const result = await service.incrementalSync();
                        
                        // Verify
                        expect(result.success).toBe(false);
                        expect(result.errorMessage).toBe(errorMessage);
                        expect(result.addedCount).toBe(0);
                        expect(result.deletedCount).toBe(0);
                        expect(result.skippedCount).toBe(0);
                        expect(mockStorage.setCard).not.toHaveBeenCalled();
                        expect(mockStorage.saveCards).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 30 }
            );
        });
    });
    
    // ==================== fullSync() 属性测试 ====================
    
    describe('fullSync() - Property-Based Tests', () => {
        /**
         * **Validates: Requirements 1.1, 1.9**
         * 
         * 属性：全量同步后，本地卡片集合应该等于 Riff 卡片集合
         * 
         * 对于任意的 Riff 卡片集合和本地卡片集合：
         * - 全量同步后，本地应该包含所有 Riff 卡片
         * - 全量同步后，本地不应该包含 Riff 中不存在的卡片
         */
        it('Property: 全量同步后本地卡片集合应该等于 Riff 卡片集合', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    fc.array(fsrsCardArbitrary, { maxLength: 20 }),
                    async (riffCards, localCards) => {
                        // 确保 ID 唯一
                        const uniqueRiffCards = Array.from(
                            new Map(riffCards.map(c => [c.id, c])).values()
                        );
                        const uniqueLocalCards = Array.from(
                            new Map(localCards.map(c => [c.id, c])).values()
                        );
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue(uniqueLocalCards);
                        
                        const addedCards: FSRSCard[] = [];
                        const removedCardIds: string[] = [];
                        
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            addedCards.push(card);
                        });
                        
                        vi.mocked(mockStorage.removeCard).mockImplementation((id) => {
                            removedCardIds.push(id);
                        });
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        
                        // 计算预期的新增和删除
                        const riffCardIds = new Set(uniqueRiffCards.map(c => c.id));
                        const localCardIds = new Set(uniqueLocalCards.map(c => c.id));
                        
                        const expectedAdded = uniqueRiffCards.filter(c => !localCardIds.has(c.id));
                        const expectedDeleted = uniqueLocalCards.filter(c => !riffCardIds.has(c.id));
                        
                        // 验证新增数量
                        expect(result.addedCount).toBe(expectedAdded.length);
                        expect(addedCards.length).toBe(expectedAdded.length);
                        
                        // 验证删除数量
                        expect(result.deletedCount).toBe(expectedDeleted.length);
                        expect(removedCardIds.length).toBe(expectedDeleted.length);
                        
                        // 验证新增的卡片 ID 正确
                        const addedCardIds = new Set(addedCards.map(c => c.id));
                        for (const card of expectedAdded) {
                            expect(addedCardIds.has(card.id)).toBe(true);
                        }
                        
                        // 验证删除的卡片 ID 正确
                        const removedCardIdSet = new Set(removedCardIds);
                        for (const card of expectedDeleted) {
                            expect(removedCardIdSet.has(card.id)).toBe(true);
                        }
                    }
                ),
                { numRuns: 50 } // 运行 50 次测试
            );
        });
        
        /**
         * **Validates: Requirements 1.10**
         * 
         * 属性：全量同步应该清理黑名单中 Riff 不存在的 ID
         * 
         * 对于任意的 Riff 卡片集合和黑名单：
         * - 黑名单中 Riff 存在的 ID 应该保留
         * - 黑名单中 Riff 不存在的 ID 应该被清理
         */
        it('Property: 全量同步应该清理黑名单中 Riff 不存在的 ID', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    fc.array(cardIdArbitrary, { maxLength: 20 }),
                    async (riffCards, blacklistIds) => {
                        // 确保 ID 唯一
                        const uniqueRiffCards = Array.from(
                            new Map(riffCards.map(c => [c.id, c])).values()
                        );
                        const uniqueBlacklistIds = Array.from(new Set(blacklistIds));
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set(uniqueBlacklistIds));
                        
                        const removedFromBlacklist: string[] = [];
                        vi.mocked(mockStorage.removeFromRiffBlacklist).mockImplementation((id) => {
                            removedFromBlacklist.push(id);
                        });
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        
                        // 计算预期清理的黑名单 ID
                        const riffCardIds = new Set(uniqueRiffCards.map(c => c.id));
                        const expectedCleaned = uniqueBlacklistIds.filter(id => !riffCardIds.has(id));
                        
                        // 验证清理数量
                        expect(result.blacklistCleanedCount).toBe(expectedCleaned.length);
                        expect(removedFromBlacklist.length).toBe(expectedCleaned.length);
                        
                        // 验证清理的 ID 正确
                        const removedSet = new Set(removedFromBlacklist);
                        for (const id of expectedCleaned) {
                            expect(removedSet.has(id)).toBe(true);
                        }
                        
                        // 验证不应该清理 Riff 中存在的 ID
                        for (const id of uniqueBlacklistIds) {
                            if (riffCardIds.has(id)) {
                                expect(removedSet.has(id)).toBe(false);
                            }
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9**
         * 
         * 属性：全量同步的幂等性
         * 
         * 对于任意的 Riff 卡片集合：
         * - 连续两次全量同步应该产生相同的结果
         * - 第二次同步不应该有任何新增或删除
         */
        it('Property: 全量同步应该是幂等的', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    async (riffCards) => {
                        // 确保 ID 唯一
                        const uniqueRiffCards = Array.from(
                            new Map(riffCards.map(c => [c.id, c])).values()
                        );
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
                        
                        let currentLocalCards: FSRSCard[] = [];
                        
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            currentLocalCards.push(card);
                        });
                        
                        vi.mocked(mockStorage.removeCard).mockImplementation((id) => {
                            currentLocalCards = currentLocalCards.filter(c => c.id !== id);
                        });
                        
                        // 第一次同步
                        const result1 = await service.fullSync();
                        expect(result1.success).toBe(true);
                        
                        const addedCount1 = result1.addedCount;
                        const deletedCount1 = result1.deletedCount;
                        
                        // 更新 mock 以反映第一次同步后的状态
                        vi.mocked(mockStorage.getAllCards).mockReturnValue([...currentLocalCards]);
                        
                        // 清除计数器
                        vi.clearAllMocks();
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue([...currentLocalCards]);
                        
                        let secondSyncAdded = 0;
                        let secondSyncDeleted = 0;
                        
                        vi.mocked(mockStorage.setCard).mockImplementation(() => {
                            secondSyncAdded++;
                        });
                        
                        vi.mocked(mockStorage.removeCard).mockImplementation(() => {
                            secondSyncDeleted++;
                        });
                        
                        // 第二次同步
                        const result2 = await service.fullSync();
                        expect(result2.success).toBe(true);
                        
                        // 验证第二次同步没有变化
                        expect(result2.addedCount).toBe(0);
                        expect(result2.deletedCount).toBe(0);
                        expect(secondSyncAdded).toBe(0);
                        expect(secondSyncDeleted).toBe(0);
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9, 1.10**
         * 
         * 属性：全量同步不应该影响 Riff 中存在的本地卡片
         * 
         * 对于任意的 Riff 卡片集合和本地卡片集合：
         * - 如果本地卡片在 Riff 中存在，全量同步不应该删除它
         * - 如果本地卡片在 Riff 中不存在，全量同步应该删除它
         */
        it('Property: 全量同步不应该删除 Riff 中存在的本地卡片', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { minLength: 1, maxLength: 20 }),
                    async (riffCards) => {
                        // 确保 ID 唯一
                        const uniqueRiffCards = Array.from(
                            new Map(riffCards.map(c => [c.id, c])).values()
                        );
                        
                        // 创建本地卡片：包含所有 Riff 卡片
                        const localCards: FSRSCard[] = uniqueRiffCards.map(rc => ({
                            id: rc.id,
                            blockId: rc.id,
                            due: Date.now(),
                            stability: 10,
                            difficulty: 5,
                            elapsedDays: 1,
                            scheduledDays: 1,
                            reps: 1,
                            lapses: 0,
                            state: 2,
                            deckID: 'test-deck',
                        }));
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
                        
                        const removedCardIds: string[] = [];
                        vi.mocked(mockStorage.removeCard).mockImplementation((id) => {
                            removedCardIds.push(id);
                        });
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        expect(result.deletedCount).toBe(0);
                        expect(removedCardIds.length).toBe(0);
                        
                        // 验证没有删除任何 Riff 中存在的卡片
                        const riffCardIds = new Set(uniqueRiffCards.map(c => c.id));
                        for (const id of removedCardIds) {
                            expect(riffCardIds.has(id)).toBe(false);
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9**
         * 
         * 属性：全量同步应该正确处理空的 Riff 卡片集合
         * 
         * 对于任意的本地卡片集合：
         * - 如果 Riff 为空，应该删除所有本地卡片
         * - 不应该添加任何卡片
         */
        it('Property: 全量同步应该正确处理空的 Riff 卡片集合', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(fsrsCardArbitrary, { minLength: 1, maxLength: 20 }),
                    async (localCards) => {
                        // 确保 ID 唯一
                        const uniqueLocalCards = Array.from(
                            new Map(localCards.map(c => [c.id, c])).values()
                        );
                        
                        // Setup mocks: Riff 为空
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue([]);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue(uniqueLocalCards);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        
                        const removedCardIds: string[] = [];
                        vi.mocked(mockStorage.removeCard).mockImplementation((id) => {
                            removedCardIds.push(id);
                        });
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        expect(result.addedCount).toBe(0);
                        expect(result.deletedCount).toBe(uniqueLocalCards.length);
                        expect(removedCardIds.length).toBe(uniqueLocalCards.length);
                        
                        // 验证所有本地卡片都被删除
                        const removedSet = new Set(removedCardIds);
                        for (const card of uniqueLocalCards) {
                            expect(removedSet.has(card.id)).toBe(true);
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9**
         * 
         * 属性：全量同步应该正确处理空的本地卡片集合
         * 
         * 对于任意的 Riff 卡片集合：
         * - 如果本地为空，应该添加所有 Riff 卡片
         * - 不应该删除任何卡片
         */
        it('Property: 全量同步应该正确处理空的本地卡片集合', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { minLength: 1, maxLength: 20 }),
                    async (riffCards) => {
                        // 确保 ID 唯一
                        const uniqueRiffCards = Array.from(
                            new Map(riffCards.map(c => [c.id, c])).values()
                        );
                        
                        // Setup mocks: 本地为空
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        
                        const addedCards: FSRSCard[] = [];
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            addedCards.push(card);
                        });
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        expect(result.addedCount).toBe(uniqueRiffCards.length);
                        expect(result.deletedCount).toBe(0);
                        expect(addedCards.length).toBe(uniqueRiffCards.length);
                        
                        // 验证所有 Riff 卡片都被添加
                        const addedCardIds = new Set(addedCards.map(c => c.id));
                        for (const card of uniqueRiffCards) {
                            expect(addedCardIds.has(card.id)).toBe(true);
                        }
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9**
         * 
         * 属性：全量同步应该正确转换 RiffCard 为 FSRSCard
         * 
         * 对于任意的 RiffBlock：
         * - 转换后的 FSRSCard 应该包含所有必要字段
         * - 日期字段应该正确转换为时间戳
         * - 数值字段应该保持不变
         */
        it('Property: 全量同步应该正确转换 RiffCard 为 FSRSCard', async () => {
            await fc.assert(
                fc.asyncProperty(
                    riffBlockArbitrary,
                    async (riffCard) => {
                        // 清除之前的 mock 调用
                        vi.clearAllMocks();
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue([riffCard] as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue([]);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        
                        let addedCard: FSRSCard | undefined;
                        vi.mocked(mockStorage.setCard).mockImplementation((card) => {
                            addedCard = card;
                        });
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        expect(result.addedCount).toBe(1);
                        expect(addedCard).toBeDefined();
                        
                        if (addedCard && riffCard.riffCard) {
                            // 验证 ID 字段
                            expect(addedCard.id).toBe(riffCard.id);
                            expect(addedCard.blockId).toBe(riffCard.id);
                            expect(addedCard.deckID).toBe(riffCard.riffCard.deckID);
                            
                            // 验证数值字段
                            const expectedStability = Number.isNaN(riffCard.riffCard.stability) ? 0 : riffCard.riffCard.stability;
                            const expectedDifficulty = Number.isNaN(riffCard.riffCard.difficulty) ? 0 : riffCard.riffCard.difficulty;
                            
                            expect(addedCard.stability).toBe(expectedStability);
                            expect(addedCard.difficulty).toBe(expectedDifficulty);
                            expect(addedCard.elapsedDays).toBe(riffCard.riffCard.elapsedDays);
                            expect(addedCard.scheduledDays).toBe(riffCard.riffCard.scheduledDays);
                            expect(addedCard.reps).toBe(riffCard.riffCard.reps);
                            expect(addedCard.lapses).toBe(riffCard.riffCard.lapses);
                            expect(addedCard.state).toBe(riffCard.riffCard.state);
                            
                            // 验证日期字段转换
                            expect(addedCard.due).toBe(new Date(riffCard.riffCard.due).getTime());
                            if (riffCard.riffCard.lastReview) {
                                expect(addedCard.lastReview).toBe(new Date(riffCard.riffCard.lastReview).getTime());
                            }
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9**
         * 
         * 属性：全量同步只在有变化时才保存
         * 
         * 对于任意的 Riff 卡片集合和本地卡片集合：
         * - 如果有新增或删除，应该调用 saveCards
         * - 如果没有变化，不应该调用 saveCards
         */
        it('Property: 全量同步只在有变化时才保存', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 20 }),
                    fc.boolean(),
                    async (riffCards, shouldHaveChanges) => {
                        // 确保 ID 唯一
                        const uniqueRiffCards = Array.from(
                            new Map(riffCards.map(c => [c.id, c])).values()
                        );
                        
                        // 清除之前的 mock 调用
                        vi.clearAllMocks();
                        
                        let localCards: FSRSCard[];
                        
                        if (shouldHaveChanges) {
                            // 有变化：本地为空或有额外卡片
                            if (uniqueRiffCards.length > 0 && Math.random() > 0.5) {
                                // 本地为空，Riff 有卡片（会新增）
                                localCards = [];
                            } else {
                                // 本地有额外卡片（会删除）
                                localCards = [{
                                    id: 'extra-card',
                                    blockId: 'extra-card',
                                    due: Date.now(),
                                    stability: 10,
                                    difficulty: 5,
                                    elapsedDays: 1,
                                    scheduledDays: 1,
                                    reps: 1,
                                    lapses: 0,
                                    state: 2,
                                    deckID: 'test-deck',
                                }];
                            }
                        } else {
                            // 没有变化：本地和 Riff 完全一致
                            localCards = uniqueRiffCards.map(rc => ({
                                id: rc.id,
                                blockId: rc.id,
                                due: Date.now(),
                                stability: 10,
                                difficulty: 5,
                                elapsedDays: 1,
                                scheduledDays: 1,
                                reps: 1,
                                lapses: 0,
                                state: 2,
                                deckID: 'test-deck',
                            }));
                        }
                        
                        // Setup mocks
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue(localCards);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(true);
                        
                        const hasChanges = result.addedCount > 0 || result.deletedCount > 0;
                        
                        if (hasChanges) {
                            // 有变化，应该调用 saveCards
                            expect(mockStorage.saveCards).toHaveBeenCalled();
                        } else {
                            // 没有变化，不应该调用 saveCards
                            expect(mockStorage.saveCards).not.toHaveBeenCalled();
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9**
         * 
         * 属性：全量同步失败时不应该修改本地数据
         * 
         * 对于任意的错误：
         * - 如果 getRiffCards 失败，不应该调用 setCard
         * - 如果 getRiffCards 失败，不应该调用 removeCard
         * - 如果 getRiffCards 失败，不应该调用 saveCards
         * - 应该返回失败结果
         */
        it('Property: 全量同步失败时不应该修改本地数据', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    async (errorMessage) => {
                        // Setup: 模拟失败
                        vi.mocked(riffApi.getRiffCards).mockRejectedValue(new Error(errorMessage));
                        
                        // Execute
                        const result = await service.fullSync();
                        
                        // Verify
                        expect(result.success).toBe(false);
                        expect(result.errorMessage).toBe(errorMessage);
                        expect(result.addedCount).toBe(0);
                        expect(result.deletedCount).toBe(0);
                        expect(mockStorage.setCard).not.toHaveBeenCalled();
                        expect(mockStorage.removeCard).not.toHaveBeenCalled();
                        expect(mockStorage.saveCards).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.9, 1.10**
         * 
         * 属性：全量同步的卡片 ID 对比逻辑应该是对称的
         * 
         * 对于任意的两个卡片集合 A 和 B：
         * - 从 A 同步到 B 的新增数量 = 从 B 同步到 A 的删除数量
         * - 从 A 同步到 B 的删除数量 = 从 B 同步到 A 的新增数量
         */
        it('Property: 全量同步的卡片 ID 对比逻辑应该是对称的', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(riffBlockArbitrary, { maxLength: 15 }),
                    fc.array(fsrsCardArbitrary, { maxLength: 15 }),
                    async (riffCards, localCards) => {
                        // 确保 ID 唯一
                        const uniqueRiffCards = Array.from(
                            new Map(riffCards.map(c => [c.id, c])).values()
                        );
                        const uniqueLocalCards = Array.from(
                            new Map(localCards.map(c => [c.id, c])).values()
                        );
                        
                        // 第一次同步：Riff -> Local
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(uniqueRiffCards as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue(uniqueLocalCards);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        
                        const result1 = await service.fullSync();
                        
                        // 清除 mocks
                        vi.clearAllMocks();
                        
                        // 第二次同步：Local -> Riff（交换角色）
                        // 将本地卡片转换为 RiffBlock 格式
                        const localAsRiff = uniqueLocalCards.map(lc => ({
                            id: lc.id,
                            riffCard: {
                                id: lc.id,
                                blockID: lc.blockId,
                                deckID: lc.deckID || 'test-deck',
                                due: new Date(lc.due).toISOString(),
                                reps: lc.reps,
                                lapses: lc.lapses,
                                state: lc.state,
                                lastReview: lc.lastReview ? new Date(lc.lastReview).toISOString() : '',
                                stability: lc.stability,
                                difficulty: lc.difficulty,
                                elapsedDays: lc.elapsedDays,
                                scheduledDays: lc.scheduledDays,
                            },
                        }));
                        
                        // 将 Riff 卡片转换为 FSRSCard 格式
                        const riffAsLocal: FSRSCard[] = uniqueRiffCards.map(rc => ({
                            id: rc.id,
                            blockId: rc.id,
                            due: rc.riffCard ? new Date(rc.riffCard.due).getTime() : Date.now(),
                            stability: rc.riffCard?.stability || 0,
                            difficulty: rc.riffCard?.difficulty || 0,
                            elapsedDays: rc.riffCard?.elapsedDays || 0,
                            scheduledDays: rc.riffCard?.scheduledDays || 0,
                            reps: rc.riffCard?.reps || 0,
                            lapses: rc.riffCard?.lapses || 0,
                            state: rc.riffCard?.state || 0,
                            lastReview: rc.riffCard?.lastReview ? new Date(rc.riffCard.lastReview).getTime() : 0, // 修复：无效日期应该被转换为 0
                            deckID: rc.riffCard?.deckID || 'test-deck',
                        }));
                        
                        vi.mocked(riffApi.getRiffCards).mockResolvedValue(localAsRiff as any);
                        vi.mocked(mockStorage.getAllCards).mockReturnValue(riffAsLocal);
                        vi.mocked(mockStorage.getRiffBlacklist).mockReturnValue(new Set());
                        
                        const result2 = await service.fullSync();
                        
                        // Verify: 对称性
                        expect(result1.addedCount).toBe(result2.deletedCount);
                        expect(result1.deletedCount).toBe(result2.addedCount);
                    }
                ),
                { numRuns: 30 }
            );
        });
    });
    
    // ==================== deleteSync() 属性测试 ====================
    
    describe('deleteSync() - Property-Based Tests', () => {
        /**
         * **Validates: Requirements 1.8, 1.10**
         * 
         * 属性：删除成功时不应该加入黑名单
         * 
         * 对于任意的卡片 ID：
         * - 如果 Riff 删除成功，不应该调用 addToRiffBlacklist
         * - 如果 Riff 删除成功，应该返回 true
         */
        it('Property: 删除成功时不应该加入黑名单', async () => {
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary,
                    async (cardId) => {
                        // Setup: 删除成功
                        vi.mocked(riffApi.removeRiffCards).mockResolvedValue({} as any);
                        
                        // Execute
                        const result = await service.deleteSync(cardId);
                        
                        // Verify
                        expect(result).toBe(true);
                        expect(riffApi.removeRiffCards).toHaveBeenCalledWith('test-deck', [cardId]);
                        expect(mockStorage.addToRiffBlacklist).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.10**
         * 
         * 属性：删除失败时应该加入黑名单（如果启用后备）
         * 
         * 对于任意的卡片 ID：
         * - 如果 Riff 删除失败且启用黑名单后备，应该调用 addToRiffBlacklist
         * - 如果 Riff 删除失败，应该返回 false
         */
        it('Property: 删除失败时应该加入黑名单', async () => {
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary,
                    async (cardId) => {
                        // Setup: 删除失败
                        vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Network error'));
                        
                        // Execute
                        const result = await service.deleteSync(cardId);
                        
                        // Verify
                        expect(result).toBe(false);
                        expect(riffApi.removeRiffCards).toHaveBeenCalledWith('test-deck', [cardId]);
                        expect(mockStorage.addToRiffBlacklist).toHaveBeenCalledWith(cardId);
                    }
                ),
                { numRuns: 50 }
            );
        });
        
        /**
         * **Validates: Requirements 1.10**
         * 
         * 属性：禁用黑名单后备时，删除失败不应该加入黑名单
         * 
         * 对于任意的卡片 ID：
         * - 如果禁用黑名单后备，删除失败时不应该调用 addToRiffBlacklist
         */
        it('Property: 禁用黑名单后备时删除失败不应该加入黑名单', async () => {
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary,
                    async (cardId) => {
                        // Setup: 禁用黑名单后备
                        config.deleteSync.useBlacklistFallback = false;
                        service = new HybridSyncService(config);
                        
                        // Setup: 删除失败
                        vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Network error'));
                        
                        // Execute
                        const result = await service.deleteSync(cardId);
                        
                        // Verify
                        expect(result).toBe(false);
                        expect(riffApi.removeRiffCards).toHaveBeenCalledWith('test-deck', [cardId]);
                        expect(mockStorage.addToRiffBlacklist).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.8**
         * 
         * 属性：禁用删除同步时应该直接返回成功
         * 
         * 对于任意的卡片 ID：
         * - 如果禁用删除同步，不应该调用 removeRiffCards
         * - 应该返回 true
         */
        it('Property: 禁用删除同步时应该直接返回成功', async () => {
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary,
                    async (cardId) => {
                        // Setup: 禁用删除同步
                        config.deleteSync.enabled = false;
                        service = new HybridSyncService(config);
                        
                        // Execute
                        const result = await service.deleteSync(cardId);
                        
                        // Verify
                        expect(result).toBe(true);
                        expect(riffApi.removeRiffCards).not.toHaveBeenCalled();
                        expect(mockStorage.addToRiffBlacklist).not.toHaveBeenCalled();
                    }
                ),
                { numRuns: 30 }
            );
        });
        
        /**
         * **Validates: Requirements 1.8, 1.10**
         * 
         * 属性：删除同步的确定性
         * 
         * 对于任意的卡片 ID：
         * - 相同的输入应该产生相同的输出
         * - 删除成功/失败的行为应该一致
         */
        it('Property: 删除同步应该是确定性的', async () => {
            await fc.assert(
                fc.asyncProperty(
                    cardIdArbitrary,
                    fc.boolean(),
                    async (cardId, shouldSucceed) => {
                        // 清除之前的 mock 调用
                        vi.clearAllMocks();
                        
                        // Setup 第一次
                        if (shouldSucceed) {
                            vi.mocked(riffApi.removeRiffCards).mockResolvedValue({} as any);
                        } else {
                            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Network error'));
                        }
                        
                        // Execute 第一次
                        const result1 = await service.deleteSync(cardId);
                        const blacklistCalled1 = vi.mocked(mockStorage.addToRiffBlacklist).mock.calls.length;
                        
                        // 清除所有 mock 调用记录
                        vi.clearAllMocks();
                        
                        // 重新设置 mock 实现（第二次，相同的行为）
                        if (shouldSucceed) {
                            vi.mocked(riffApi.removeRiffCards).mockResolvedValue({} as any);
                        } else {
                            vi.mocked(riffApi.removeRiffCards).mockRejectedValue(new Error('Network error'));
                        }
                        
                        // Execute 第二次
                        const result2 = await service.deleteSync(cardId);
                        const blacklistCalled2 = vi.mocked(mockStorage.addToRiffBlacklist).mock.calls.length;
                        
                        // Verify: 两次结果应该相同
                        expect(result1).toBe(result2);
                        expect(blacklistCalled1).toBe(blacklistCalled2);
                        
                        if (shouldSucceed) {
                            expect(result1).toBe(true);
                            expect(blacklistCalled1).toBe(0);
                        } else {
                            expect(result1).toBe(false);
                            expect(blacklistCalled1).toBe(1);
                        }
                    }
                ),
                { numRuns: 50 }
            );
        });
    });
});

    describe('convertRiffCardToFSRSCard - 无效日期处理', () => {
        it('应该正确处理无效的 lastReview 日期（0001-01-01）', async () => {
            // Arrange: 创建一个包含无效日期的 Riff 卡片
            const invalidRiffCard = {
                id: 'test-card-invalid-date',
                blockId: 'test-card-invalid-date',
                ial: {
                    'custom-fsrs-card-type': 'item'
                },
                riffCard: {
                    id: 'test-card-invalid-date',
                    blockID: 'test-card-invalid-date',
                    deckID: 'test-deck',
                    due: '2026-02-15T00:00:00Z',
                    reps: 5,
                    lapses: 1,
                    state: 2,
                    lastReview: '0001-01-01T00:00:00Z', // 无效日期
                    stability: 10,
                    difficulty: 5,
                    elapsedDays: 3,
                    scheduledDays: 7,
                }
            };
            
            vi.mocked(riffApi.getRiffCards).mockResolvedValue([invalidRiffCard] as any);
            
            // Act: 执行全量同步
            const result = await service.fullSync();
            
            // Assert: 验证卡片被正确添加，且 lastReview 被设置为 0
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            
            const addedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(addedCard.lastReview).toBe(0); // 无效日期应该被转换为 0
            expect(addedCard.reps).toBe(5);
            expect(addedCard.state).toBe(2);
        });
        
        it('应该正确处理空的 lastReview 日期', async () => {
            // Arrange: 创建一个 lastReview 为空字符串的 Riff 卡片
            const emptyLastReviewCard = {
                id: 'test-card-empty-date',
                blockId: 'test-card-empty-date',
                ial: {
                    'custom-fsrs-card-type': 'item'
                },
                riffCard: {
                    id: 'test-card-empty-date',
                    blockID: 'test-card-empty-date',
                    deckID: 'test-deck',
                    due: '2026-02-15T00:00:00Z',
                    reps: 0,
                    lapses: 0,
                    state: 0,
                    lastReview: '', // 空字符串
                    stability: 0,
                    difficulty: 0,
                    elapsedDays: 0,
                    scheduledDays: 0,
                }
            };
            
            vi.mocked(riffApi.getRiffCards).mockResolvedValue([emptyLastReviewCard] as any);
            
            // Act: 执行全量同步
            const result = await service.fullSync();
            
            // Assert: 验证卡片被正确添加，且 lastReview 被设置为 0
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            
            const addedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(addedCard.lastReview).toBe(0);
        });
        
        it('应该正确处理有效的 lastReview 日期', async () => {
            // Arrange: 创建一个包含有效日期的 Riff 卡片
            const validDate = '2026-02-10T10:30:00Z';
            const validRiffCard = {
                id: 'test-card-valid-date',
                blockId: 'test-card-valid-date',
                ial: {
                    'custom-fsrs-card-type': 'item'
                },
                riffCard: {
                    id: 'test-card-valid-date',
                    blockID: 'test-card-valid-date',
                    deckID: 'test-deck',
                    due: '2026-02-15T00:00:00Z',
                    reps: 3,
                    lapses: 0,
                    state: 2,
                    lastReview: validDate,
                    stability: 8,
                    difficulty: 4,
                    elapsedDays: 2,
                    scheduledDays: 5,
                }
            };
            
            vi.mocked(riffApi.getRiffCards).mockResolvedValue([validRiffCard] as any);
            
            // Act: 执行全量同步
            const result = await service.fullSync();
            
            // Assert: 验证卡片被正确添加，且 lastReview 被正确转换
            expect(result.success).toBe(true);
            expect(result.addedCount).toBe(1);
            
            const addedCard = vi.mocked(mockStorage.setCard).mock.calls[0][0];
            expect(addedCard.lastReview).toBe(new Date(validDate).getTime());
            expect(addedCard.lastReview).toBeGreaterThan(0);
        });
    });

