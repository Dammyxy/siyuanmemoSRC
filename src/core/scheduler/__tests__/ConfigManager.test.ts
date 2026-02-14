/**
 * ConfigManager 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager } from '../ConfigManager';
import type { StorageManager } from '@/core/storage/manager';
import type { PostponeConfig, AdvanceConfig, SpreadConfig } from '@/types/reschedule';

// Mock StorageManager
const createMockStorage = (): StorageManager => {
    const storage: Record<string, any> = {};
    
    return {
        loadData: vi.fn(async (filename: string) => {
            return storage[filename] || null;
        }),
        saveData: vi.fn(async (filename: string, data: any) => {
            storage[filename] = data;
        })
    } as any;
};

describe('ConfigManager', () => {
    let configManager: ConfigManager;
    let mockStorage: StorageManager;
    
    beforeEach(() => {
        mockStorage = createMockStorage();
        configManager = new ConfigManager(mockStorage);
    });
    
    describe('getDefaultPostponeConfig', () => {
        it('should return default postpone config', () => {
            const config = configManager.getDefaultPostponeConfig();
            
            expect(config.delayFactor).toBe(1.1);
            expect(config.minInterval).toBe(1);
            expect(config.maxInterval).toBe(365);
            expect(config.skipConditions.skipByPriority?.enabled).toBe(false);
            expect(config.skipConditions.skipByInterval?.enabled).toBe(false);
            expect(config.skipConditions.skipByRetrievability?.enabled).toBe(false);
            expect(config.skipConditions.skipByAFactor?.enabled).toBe(false);
            expect(config.skipConditions.skipByPostponeCount?.enabled).toBe(false);
            expect(config.modifyDelayByRetrievability).toBe(false);
            expect(config.modifyDelayByPriority).toBe(false);
            expect(config.skipTopNElements).toBe(0);
        });
    });
    
    describe('getDefaultAdvanceConfig', () => {
        it('should return default advance config', () => {
            const config = configManager.getDefaultAdvanceConfig();
            
            expect(config.maxDays).toBe(30);
            expect(config.randomize).toBe(true);
            expect(config.handleOverdueCards).toBe(true);
        });
    });
    
    describe('getDefaultSpreadConfig', () => {
        it('should return default spread config', () => {
            const config = configManager.getDefaultSpreadConfig();
            
            expect(config.collectingPeriod).toBe(30);
            expect(config.reschedulingPeriod).toBe(30);
            expect(config.considerFutureRepetitions).toBe(false);
            expect(config.sortingCriterion).toBe('random');
            expect(config.maxCardsPerDay).toBeUndefined();
        });
    });
    
    describe('saveConfig and loadConfig', () => {
        it('should save and load postpone config', async () => {
            const config: PostponeConfig = {
                delayFactor: 1.5,
                minInterval: 2,
                maxInterval: 180,
                skipConditions: {
                    skipByPriority: { enabled: true, threshold: 20 },
                    skipByInterval: { enabled: false, threshold: 365 },
                    skipByRetrievability: { enabled: false, threshold: 0.9 },
                    skipByAFactor: { enabled: false, threshold: 1.5 },
                    skipByPostponeCount: { enabled: false, threshold: 10 }
                },
                modifyDelayByRetrievability: true,
                modifyDelayByPriority: false,
                skipTopNElements: 50
            };
            
            await configManager.saveConfig('my-config', config, 'postpone');
            const loaded = await configManager.loadConfig('my-config', 'postpone') as PostponeConfig;
            
            expect(loaded).toEqual(config);
        });
        
        it('should save and load advance config', async () => {
            const config: AdvanceConfig = {
                maxDays: 60,
                randomize: false,
                handleOverdueCards: false
            };
            
            await configManager.saveConfig('exam-prep', config, 'advance');
            const loaded = await configManager.loadConfig('exam-prep', 'advance') as AdvanceConfig;
            
            expect(loaded).toEqual(config);
        });
        
        it('should save and load spread config', async () => {
            const config: SpreadConfig = {
                collectingPeriod: 60,
                reschedulingPeriod: 14,
                considerFutureRepetitions: true,
                sortingCriterion: 'by-priority',
                maxCardsPerDay: 50
            };
            
            await configManager.saveConfig('vacation-prep', config, 'spread');
            const loaded = await configManager.loadConfig('vacation-prep', 'spread') as SpreadConfig;
            
            expect(loaded).toEqual(config);
        });
        
        it('should return null for non-existent config', async () => {
            const loaded = await configManager.loadConfig('non-existent', 'postpone');
            expect(loaded).toBeNull();
        });
        
        it('should handle multiple configs of same type', async () => {
            const config1: PostponeConfig = configManager.getDefaultPostponeConfig();
            config1.delayFactor = 1.2;
            
            const config2: PostponeConfig = configManager.getDefaultPostponeConfig();
            config2.delayFactor = 1.5;
            
            await configManager.saveConfig('light', config1, 'postpone');
            await configManager.saveConfig('heavy', config2, 'postpone');
            
            const loaded1 = await configManager.loadConfig('light', 'postpone') as PostponeConfig;
            const loaded2 = await configManager.loadConfig('heavy', 'postpone') as PostponeConfig;
            
            expect(loaded1.delayFactor).toBe(1.2);
            expect(loaded2.delayFactor).toBe(1.5);
        });
    });
    
    describe('deleteConfig', () => {
        it('should delete existing config', async () => {
            const config = configManager.getDefaultPostponeConfig();
            
            await configManager.saveConfig('temp', config, 'postpone');
            let loaded = await configManager.loadConfig('temp', 'postpone');
            expect(loaded).not.toBeNull();
            
            await configManager.deleteConfig('temp', 'postpone');
            loaded = await configManager.loadConfig('temp', 'postpone');
            expect(loaded).toBeNull();
        });
        
        it('should not affect other configs when deleting', async () => {
            const config1 = configManager.getDefaultPostponeConfig();
            const config2 = configManager.getDefaultAdvanceConfig();
            
            await configManager.saveConfig('config1', config1, 'postpone');
            await configManager.saveConfig('config2', config2, 'advance');
            
            await configManager.deleteConfig('config1', 'postpone');
            
            const loaded1 = await configManager.loadConfig('config1', 'postpone');
            const loaded2 = await configManager.loadConfig('config2', 'advance');
            
            expect(loaded1).toBeNull();
            expect(loaded2).not.toBeNull();
        });
        
        it('should handle deleting non-existent config gracefully', async () => {
            await expect(
                configManager.deleteConfig('non-existent', 'postpone')
            ).resolves.not.toThrow();
        });
    });
    
    describe('error handling', () => {
        it('should handle storage load errors gracefully', async () => {
            const errorStorage = {
                loadData: vi.fn().mockRejectedValue(new Error('Load failed')),
                saveData: vi.fn()
            } as any;
            
            const manager = new ConfigManager(errorStorage);
            const loaded = await manager.loadConfig('any', 'postpone');
            
            expect(loaded).toBeNull();
        });
        
        it('should throw error when storage save fails', async () => {
            const errorStorage = {
                loadData: vi.fn().mockResolvedValue(null),
                saveData: vi.fn().mockRejectedValue(new Error('Save failed'))
            } as any;
            
            const manager = new ConfigManager(errorStorage);
            const config = manager.getDefaultPostponeConfig();
            
            await expect(
                manager.saveConfig('test', config, 'postpone')
            ).rejects.toThrow('Save failed');
        });
    });
    
    describe('config validation', () => {
        it('should preserve all fields when saving and loading', async () => {
            const config: PostponeConfig = {
                delayFactor: 2.5,
                minInterval: 5,
                maxInterval: 500,
                skipConditions: {
                    skipByPriority: { enabled: true, threshold: 15 },
                    skipByInterval: { enabled: true, threshold: 200 },
                    skipByRetrievability: { enabled: true, threshold: 0.85 },
                    skipByAFactor: { enabled: true, threshold: 2.0 },
                    skipByPostponeCount: { enabled: true, threshold: 5 }
                },
                modifyDelayByRetrievability: true,
                modifyDelayByPriority: true,
                skipTopNElements: 100
            };
            
            await configManager.saveConfig('full-config', config, 'postpone');
            const loaded = await configManager.loadConfig('full-config', 'postpone') as PostponeConfig;
            
            // Verify all fields are preserved
            expect(loaded.delayFactor).toBe(config.delayFactor);
            expect(loaded.minInterval).toBe(config.minInterval);
            expect(loaded.maxInterval).toBe(config.maxInterval);
            expect(loaded.skipConditions.skipByPriority).toEqual(config.skipConditions.skipByPriority);
            expect(loaded.skipConditions.skipByInterval).toEqual(config.skipConditions.skipByInterval);
            expect(loaded.skipConditions.skipByRetrievability).toEqual(config.skipConditions.skipByRetrievability);
            expect(loaded.skipConditions.skipByAFactor).toEqual(config.skipConditions.skipByAFactor);
            expect(loaded.skipConditions.skipByPostponeCount).toEqual(config.skipConditions.skipByPostponeCount);
            expect(loaded.modifyDelayByRetrievability).toBe(config.modifyDelayByRetrievability);
            expect(loaded.modifyDelayByPriority).toBe(config.modifyDelayByPriority);
            expect(loaded.skipTopNElements).toBe(config.skipTopNElements);
        });
    });
});
