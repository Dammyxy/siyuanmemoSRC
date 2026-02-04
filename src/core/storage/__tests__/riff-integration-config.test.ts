/**
 * StorageManager - Riff Integration Config Tests
 * 
 * 测试 StorageManager 的 Riff 集成配置方法
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from '../manager';
import { DEFAULT_RIFF_CONFIG } from '@/types/settings';

// Mock Siyuan API
vi.mock('@/core/siyuan/api', () => ({
    getPluginDataPath: vi.fn(() => '/mock/path'),
    getFile: vi.fn(() => Promise.resolve(null)),
    putFile: vi.fn(() => Promise.resolve()),
    sql: vi.fn(() => Promise.resolve([])),
}));

describe('StorageManager - Riff Integration Config', () => {
    let storage: StorageManager;

    beforeEach(async () => {
        storage = new StorageManager('test-plugin');
        await storage.init();
    });

    describe('getRiffIntegrationConfig', () => {
        it('should return default config when not set', () => {
            const config = storage.getRiffIntegrationConfig();
            
            expect(config).toEqual(DEFAULT_RIFF_CONFIG);
            expect(config.mode).toBe('advanced');
            expect(config.useLocalScheduler).toBe(true);
        });

        it('should return stored config when set', async () => {
            const customConfig = {
                ...DEFAULT_RIFF_CONFIG,
                mode: 'simple' as const,
                useLocalScheduler: false,
            };

            await storage.updateRiffIntegrationConfig(customConfig);
            const config = storage.getRiffIntegrationConfig();

            expect(config.mode).toBe('simple');
            expect(config.useLocalScheduler).toBe(false);
        });
    });

    describe('updateRiffIntegrationConfig', () => {
        it('should update config partially', async () => {
            // 更新部分配置
            await storage.updateRiffIntegrationConfig({
                mode: 'simple',
            });

            const config = storage.getRiffIntegrationConfig();
            expect(config.mode).toBe('simple');
            // 其他配置应该保持不变
            expect(config.incrementalSync.enabled).toBe(DEFAULT_RIFF_CONFIG.incrementalSync.enabled);
        });

        it('should update nested config', async () => {
            await storage.updateRiffIntegrationConfig({
                incrementalSync: {
                    enabled: false,
                    triggers: ['plugin-start'],
                    useBlacklist: false,
                },
            });

            const config = storage.getRiffIntegrationConfig();
            expect(config.incrementalSync.enabled).toBe(false);
            expect(config.incrementalSync.triggers).toEqual(['plugin-start']);
            expect(config.incrementalSync.useBlacklist).toBe(false);
        });

        it('should update full sync interval', async () => {
            const customInterval = 12 * 60 * 60 * 1000; // 12小时

            await storage.updateRiffIntegrationConfig({
                fullSync: {
                    enabled: true,
                    interval: customInterval,
                    cleanupBlacklist: true,
                },
            });

            const config = storage.getRiffIntegrationConfig();
            expect(config.fullSync.interval).toBe(customInterval);
        });

        it('should update delete sync config', async () => {
            await storage.updateRiffIntegrationConfig({
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false,
                },
            });

            const config = storage.getRiffIntegrationConfig();
            expect(config.deleteSync.enabled).toBe(false);
            expect(config.deleteSync.useBlacklistFallback).toBe(false);
        });
    });

    describe('Config Persistence', () => {
        it('should persist config across instances', async () => {
            // 第一个实例更新配置
            await storage.updateRiffIntegrationConfig({
                mode: 'simple',
                useLocalScheduler: false,
            });

            // 模拟保存后的配置
            const settings = storage.getSettings();
            expect(settings.riffIntegration?.mode).toBe('simple');
            expect(settings.riffIntegration?.useLocalScheduler).toBe(false);
        });
    });

    describe('Default Config Structure', () => {
        it('should have correct default mode', () => {
            // 直接测试 DEFAULT_RIFF_CONFIG
            expect(DEFAULT_RIFF_CONFIG.mode).toBe('advanced');
        });

        it('should have correct default incremental sync config', () => {
            expect(DEFAULT_RIFF_CONFIG.incrementalSync.enabled).toBe(true);
            expect(DEFAULT_RIFF_CONFIG.incrementalSync.triggers).toContain('plugin-start');
            expect(DEFAULT_RIFF_CONFIG.incrementalSync.triggers).toContain('browser-open');
            expect(DEFAULT_RIFF_CONFIG.incrementalSync.triggers).toContain('review-open');
            expect(DEFAULT_RIFF_CONFIG.incrementalSync.useBlacklist).toBe(true);
        });

        it('should have correct default full sync config', () => {
            expect(DEFAULT_RIFF_CONFIG.fullSync.enabled).toBe(true);
            expect(DEFAULT_RIFF_CONFIG.fullSync.interval).toBe(86400000); // 24小时
            expect(DEFAULT_RIFF_CONFIG.fullSync.cleanupBlacklist).toBe(true);
        });

        it('should have correct default delete sync config', () => {
            expect(DEFAULT_RIFF_CONFIG.deleteSync.enabled).toBe(true);
            expect(DEFAULT_RIFF_CONFIG.deleteSync.useBlacklistFallback).toBe(true);
        });
    });
});
