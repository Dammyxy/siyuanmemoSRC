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

        it('should disable retired continuous sync when migrating from simple mode', () => {
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

            expect(newConfig.incrementalSync.enabled).toBe(false);
            expect(newConfig.incrementalSync.triggers).toEqual([]);
            expect(newConfig.fullSync.enabled).toBe(false);
            expect(newConfig.deleteSync.enabled).toBe(false);
        });

        it('should preserve non-lifecycle options while disabling continuous sync', () => {
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

            expect(newConfig.incrementalSync.enabled).toBe(false);
            expect(newConfig.incrementalSync.triggers).toEqual([]);
            expect(newConfig.incrementalSync.useBlacklist).toBe(true);
            expect(newConfig.fullSync.cleanupBlacklist).toBe(true);
            expect(newConfig.deleteSync.useBlacklistFallback).toBe(true);
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
            expect(newConfig.deleteSync.enabled).toBe(false);
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

    describe('handleMigrationError', () => {
        it('should log error and show error notification', async () => {
            const error = new Error('Test error');
            const context = 'test context';

            await SimpleModeRemovalMigrator.handleMigrationError(error, context);

            expect(api.pushErrMsg).toHaveBeenCalledWith(
                expect.stringContaining('数据迁移失败'),
                10000
            );
        });
    });

    describe('performMigration', () => {
        it('should perform complete migration without invoking continuous sync', async () => {
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
            expect(result.migratedConfig.incrementalSync.enabled).toBe(false);
            expect(result.migratedConfig.fullSync.enabled).toBe(false);
            expect(result.migratedConfig.deleteSync.enabled).toBe(false);
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

            vi.mocked(api.pushMsg).mockRejectedValueOnce(new Error('Notification unavailable'));
            const result = await SimpleModeRemovalMigrator.performMigration(config);

            expect(result.success).toBe(false);
            expect(result.migratedConfig).not.toHaveProperty('mode');
            expect(api.pushErrMsg).toHaveBeenCalled();
        });
    });
});
