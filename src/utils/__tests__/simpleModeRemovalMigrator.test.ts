/**
 * Unit Tests for SimpleModeRemovalMigrator
 * 
 * Tests the configuration migration logic for removing simple mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleModeRemovalMigrator } from '../simpleModeRemovalMigrator';
import type { RiffIntegrationConfig } from '@/types/settings';
import * as api from '@/core/siyuan/api';

// Mock the siyuan API
vi.mock('@/core/siyuan/api', () => ({
    pushMsg: vi.fn(),
    pushErrMsg: vi.fn()
}));

describe('SimpleModeRemovalMigrator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear console logs
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('needsMigration', () => {
        it('should return true when config has mode="simple"', () => {
            const config: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            expect(SimpleModeRemovalMigrator.needsMigration(config)).toBe(true);
        });

        it('should return false when config has mode="advanced"', () => {
            const config: RiffIntegrationConfig = {
                mode: 'advanced',
                useLocalScheduler: true,
                incrementalSync: {
                    enabled: true,
                    triggers: ['plugin-start'],
                    useBlacklist: true
                },
                fullSync: {
                    enabled: true,
                    interval: 86400000,
                    cleanupBlacklist: true
                },
                deleteSync: {
                    enabled: true,
                    useBlacklistFallback: true
                }
            };

            expect(SimpleModeRemovalMigrator.needsMigration(config)).toBe(false);
        });

        it('should return false when config is undefined', () => {
            expect(SimpleModeRemovalMigrator.needsMigration(undefined)).toBe(false);
        });
    });

    describe('migrate', () => {
        it('should remove mode field from config', () => {
            const oldConfig: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            const newConfig = SimpleModeRemovalMigrator.migrate(oldConfig);

            expect(newConfig).not.toHaveProperty('mode');
            expect(newConfig.useLocalScheduler).toBe(true);
        });

        it('should enable incremental sync when migrating from simple mode', () => {
            const oldConfig: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            const newConfig = SimpleModeRemovalMigrator.migrate(oldConfig);

            expect(newConfig.incrementalSync.enabled).toBe(true);
            expect(newConfig.incrementalSync.triggers).toContain('plugin-start');
            expect(newConfig.incrementalSync.triggers).toContain('browser-open');
            expect(newConfig.incrementalSync.triggers).toContain('review-open');
        });

        it('should preserve existing incremental sync settings if already enabled', () => {
            const oldConfig: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: true,
                    triggers: ['plugin-start'],
                    useBlacklist: true
                },
                fullSync: {
                    enabled: true,
                    interval: 86400000,
                    cleanupBlacklist: true
                },
                deleteSync: {
                    enabled: true,
                    useBlacklistFallback: true
                }
            };

            const newConfig = SimpleModeRemovalMigrator.migrate(oldConfig);

            expect(newConfig.incrementalSync.enabled).toBe(true);
            expect(newConfig.incrementalSync.triggers).toEqual(['plugin-start']);
            expect(newConfig.incrementalSync.useBlacklist).toBe(true);
        });

        it('should set useLocalScheduler to true', () => {
            const oldConfig: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            const newConfig = SimpleModeRemovalMigrator.migrate(oldConfig);

            expect(newConfig.useLocalScheduler).toBe(true);
        });

        it('should preserve other configuration fields', () => {
            const oldConfig: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: true,
                    triggers: ['plugin-start'],
                    useBlacklist: true
                },
                fullSync: {
                    enabled: true,
                    interval: 3600000,
                    cleanupBlacklist: true
                },
                deleteSync: {
                    enabled: true,
                    useBlacklistFallback: false
                }
            };

            const newConfig = SimpleModeRemovalMigrator.migrate(oldConfig);

            expect(newConfig.fullSync.interval).toBe(3600000);
            expect(newConfig.fullSync.cleanupBlacklist).toBe(true);
            expect(newConfig.deleteSync.enabled).toBe(true);
            expect(newConfig.deleteSync.useBlacklistFallback).toBe(false);
        });
    });

    describe('showMigrationNotification', () => {
        it('should show notification when migrating from simple mode', async () => {
            await SimpleModeRemovalMigrator.showMigrationNotification(true);

            expect(api.pushMsg).toHaveBeenCalledTimes(1);
            expect(api.pushMsg).toHaveBeenCalledWith(
                expect.stringContaining('数据源模式已自动升级'),
                10000
            );
        });

        it('should not show notification when not migrating from simple mode', async () => {
            await SimpleModeRemovalMigrator.showMigrationNotification(false);

            expect(api.pushMsg).not.toHaveBeenCalled();
        });
    });

    describe('triggerMigrationSync', () => {
        it('should trigger incremental sync and return true on success', async () => {
            const mockSyncService = {
                incrementalSync: vi.fn().mockResolvedValue({
                    success: true,
                    syncedCount: 10,
                    error: null
                })
            };

            const result = await SimpleModeRemovalMigrator.triggerMigrationSync(mockSyncService);

            expect(result).toBe(true);
            expect(mockSyncService.incrementalSync).toHaveBeenCalledTimes(1);
        });

        it('should return false when sync fails', async () => {
            const mockSyncService = {
                incrementalSync: vi.fn().mockResolvedValue({
                    success: false,
                    syncedCount: 0,
                    error: 'Sync failed'
                })
            };

            const result = await SimpleModeRemovalMigrator.triggerMigrationSync(mockSyncService);

            expect(result).toBe(false);
            expect(mockSyncService.incrementalSync).toHaveBeenCalledTimes(1);
        });

        it('should return false and log error when sync throws exception', async () => {
            const mockSyncService = {
                incrementalSync: vi.fn().mockRejectedValue(new Error('Network error'))
            };

            const result = await SimpleModeRemovalMigrator.triggerMigrationSync(mockSyncService);

            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe('handleMigrationError', () => {
        it('should log error and show error notification', async () => {
            const error = new Error('Test error');
            const context = 'test context';

            await SimpleModeRemovalMigrator.handleMigrationError(error, context);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Migration error in test context'),
                error
            );
            expect(api.pushErrMsg).toHaveBeenCalledWith(
                expect.stringContaining('数据迁移失败'),
                10000
            );
        });
    });

    describe('performMigration', () => {
        it('should perform complete migration from simple mode with sync', async () => {
            const config: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            const mockSyncService = {
                incrementalSync: vi.fn().mockResolvedValue({
                    success: true,
                    syncedCount: 5,
                    error: null
                })
            };

            const result = await SimpleModeRemovalMigrator.performMigration(
                config,
                mockSyncService
            );

            expect(result.success).toBe(true);
            expect(result.syncTriggered).toBe(true);
            expect(result.migratedConfig).not.toHaveProperty('mode');
            expect(mockSyncService.incrementalSync).toHaveBeenCalledTimes(1);
            expect(api.pushMsg).toHaveBeenCalled();
        });

        it('should perform migration without sync when syncService not provided', async () => {
            const config: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            const result = await SimpleModeRemovalMigrator.performMigration(config);

            expect(result.success).toBe(true);
            expect(result.syncTriggered).toBe(false);
            expect(result.migratedConfig).not.toHaveProperty('mode');
            expect(api.pushMsg).toHaveBeenCalled();
        });

        it('should handle sync failure gracefully', async () => {
            const config: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            const mockSyncService = {
                incrementalSync: vi.fn().mockResolvedValue({
                    success: false,
                    syncedCount: 0,
                    error: 'Sync failed'
                })
            };

            const result = await SimpleModeRemovalMigrator.performMigration(
                config,
                mockSyncService
            );

            expect(result.success).toBe(false);
            expect(result.syncTriggered).toBe(true);
            expect(result.migratedConfig).not.toHaveProperty('mode');
            expect(api.pushErrMsg).toHaveBeenCalled();
        });

        it('should not migrate when config is already advanced mode', async () => {
            const config: RiffIntegrationConfig = {
                mode: 'advanced',
                useLocalScheduler: true,
                incrementalSync: {
                    enabled: true,
                    triggers: ['plugin-start'],
                    useBlacklist: true
                },
                fullSync: {
                    enabled: true,
                    interval: 86400000,
                    cleanupBlacklist: true
                },
                deleteSync: {
                    enabled: true,
                    useBlacklistFallback: true
                }
            };

            const result = await SimpleModeRemovalMigrator.performMigration(config);

            expect(result.success).toBe(true);
            expect(result.syncTriggered).toBe(false);
            expect(result.migratedConfig).not.toHaveProperty('mode');
            expect(api.pushMsg).not.toHaveBeenCalled();
        });

        it('should return fallback config on migration error', async () => {
            const config: RiffIntegrationConfig = {
                mode: 'simple',
                useLocalScheduler: false,
                incrementalSync: {
                    enabled: false,
                    triggers: [],
                    useBlacklist: false
                },
                fullSync: {
                    enabled: false,
                    interval: 86400000,
                    cleanupBlacklist: false
                },
                deleteSync: {
                    enabled: false,
                    useBlacklistFallback: false
                }
            };

            const mockSyncService = {
                incrementalSync: vi.fn().mockRejectedValue(new Error('Network error'))
            };

            const result = await SimpleModeRemovalMigrator.performMigration(
                config,
                mockSyncService
            );

            expect(result.success).toBe(false);
            expect(result.migratedConfig).not.toHaveProperty('mode');
            expect(api.pushErrMsg).toHaveBeenCalled();
        });
    });
});
