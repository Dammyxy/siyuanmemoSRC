/**
 * ConfigMigrator Unit Tests
 * 
 * 测试配置迁移逻辑
 */

import { describe, it, expect } from 'vitest';
import { ConfigMigrator } from '../configMigrator';
import { DEFAULT_RIFF_CONFIG } from '@/types/settings';

describe('ConfigMigrator', () => {
    describe('needsMigration', () => {
        it('should return false for null/undefined config', () => {
            expect(ConfigMigrator.needsMigration(null)).toBe(false);
            expect(ConfigMigrator.needsMigration(undefined)).toBe(false);
        });
        
        it('should return true for disabled mode', () => {
            const config = { mode: 'disabled' };
            expect(ConfigMigrator.needsMigration(config)).toBe(true);
        });
        
        it('should return true for data-only mode', () => {
            const config = { mode: 'data-only' };
            expect(ConfigMigrator.needsMigration(config)).toBe(true);
        });
        
        it('should return true for full-scheduler mode', () => {
            const config = { mode: 'full-scheduler' };
            expect(ConfigMigrator.needsMigration(config)).toBe(true);
        });
        
        it('should return false for new format (advanced mode)', () => {
            const config = { mode: 'advanced' };
            expect(ConfigMigrator.needsMigration(config)).toBe(false);
        });
        
        it('should return false for new format (simple mode)', () => {
            const config = { mode: 'simple' };
            expect(ConfigMigrator.needsMigration(config)).toBe(false);
        });
    });
    
    describe('migrate', () => {
        describe('disabled mode migration', () => {
            it('should migrate to simple mode', () => {
                const oldConfig = {
                    mode: 'disabled' as const,
                    dataSourceMode: 'due-only' as const,
                    syncToRiff: false,
                    useRiffScheduler: false,
                    incrementalUpdateInterval: 0
                };
                
                const newConfig = ConfigMigrator.migrate(oldConfig);
                
                expect(newConfig.mode).toBe('simple');
                expect(newConfig.useLocalScheduler).toBe(false);
                expect(newConfig.incrementalSync.enabled).toBe(false);
                expect(newConfig.fullSync.enabled).toBe(false);
                expect(newConfig.deleteSync.enabled).toBe(false);
            });
        });
        
        describe('data-only mode migration', () => {
            it('should migrate to advanced mode with hybrid sync', () => {
                const oldConfig = {
                    mode: 'data-only' as const,
                    dataSourceMode: 'incremental' as const,
                    syncToRiff: false,
                    useRiffScheduler: false,
                    incrementalUpdateInterval: 300000
                };
                
                const newConfig = ConfigMigrator.migrate(oldConfig);
                
                expect(newConfig.mode).toBe('advanced');
                expect(newConfig.useLocalScheduler).toBe(true);
                expect(newConfig.incrementalSync.enabled).toBe(true);
                expect(newConfig.incrementalSync.triggers).toEqual(['plugin-start']);
                expect(newConfig.incrementalSync.useBlacklist).toBe(true);
                expect(newConfig.fullSync.enabled).toBe(true);
                expect(newConfig.fullSync.cleanupBlacklist).toBe(true);
                expect(newConfig.deleteSync.enabled).toBe(true);
                expect(newConfig.deleteSync.useBlacklistFallback).toBe(true);
            });
        });
        
        describe('full-scheduler mode migration', () => {
            it('should migrate to simple mode', () => {
                const oldConfig = {
                    mode: 'full-scheduler' as const,
                    dataSourceMode: 'due-only' as const,
                    syncToRiff: true,
                    useRiffScheduler: true,
                    incrementalUpdateInterval: 0
                };
                
                const newConfig = ConfigMigrator.migrate(oldConfig);
                
                expect(newConfig.mode).toBe('simple');
                expect(newConfig.useLocalScheduler).toBe(false);
                expect(newConfig.incrementalSync.enabled).toBe(false);
                expect(newConfig.fullSync.enabled).toBe(false);
                expect(newConfig.deleteSync.enabled).toBe(false);
            });
        });
        
        describe('interval preservation', () => {
            it('should use default interval for all migrations', () => {
                const modes = ['disabled', 'data-only', 'full-scheduler'] as const;
                
                modes.forEach(mode => {
                    const oldConfig = {
                        mode,
                        dataSourceMode: 'due-only' as const,
                        syncToRiff: false,
                        useRiffScheduler: false,
                        incrementalUpdateInterval: 0
                    };
                    
                    const newConfig = ConfigMigrator.migrate(oldConfig);
                    expect(newConfig.fullSync.interval).toBe(DEFAULT_RIFF_CONFIG.fullSync.interval);
                    expect(newConfig.fullSync.interval).toBe(604800000); // 7天
                });
            });
        });
    });
    
    describe('getMigrationMessage', () => {
        it('should return message for disabled mode', () => {
            const message = ConfigMigrator.getMigrationMessage('disabled');
            expect(message).toContain('简单模式');
            expect(message).toContain('Simple Mode');
        });
        
        it('should return detailed message for data-only mode', () => {
            const message = ConfigMigrator.getMigrationMessage('data-only');
            expect(message).toContain('混合同步方案');
            expect(message).toContain('增量同步');
            expect(message).toContain('全量同步');
            expect(message).toContain('双向删除');
        });
        
        it('should return message for full-scheduler mode', () => {
            const message = ConfigMigrator.getMigrationMessage('full-scheduler');
            expect(message).toContain('简单模式');
            expect(message).toContain('Simple Mode');
        });
        
        it('should return default message for unknown mode', () => {
            const message = ConfigMigrator.getMigrationMessage('unknown');
            expect(message).toBe('配置已更新');
        });
    });
    
    describe('Migration Consistency', () => {
        it('should produce consistent results for same input', () => {
            const oldConfig = {
                mode: 'data-only' as const,
                dataSourceMode: 'incremental' as const,
                syncToRiff: false,
                useRiffScheduler: false,
                incrementalUpdateInterval: 300000
            };
            
            const result1 = ConfigMigrator.migrate(oldConfig);
            const result2 = ConfigMigrator.migrate(oldConfig);
            
            expect(result1).toEqual(result2);
        });
        
        it('should not mutate input config', () => {
            const oldConfig = {
                mode: 'data-only' as const,
                dataSourceMode: 'incremental' as const,
                syncToRiff: false,
                useRiffScheduler: false,
                incrementalUpdateInterval: 300000
            };
            
            const originalMode = oldConfig.mode;
            ConfigMigrator.migrate(oldConfig);
            
            expect(oldConfig.mode).toBe(originalMode);
        });
    });
    
    describe('Edge Cases', () => {
        it('should handle unknown mode with default config', () => {
            const oldConfig = {
                mode: 'unknown-mode' as any,
                dataSourceMode: 'due-only' as const,
                syncToRiff: false,
                useRiffScheduler: false,
                incrementalUpdateInterval: 0
            };
            
            const newConfig = ConfigMigrator.migrate(oldConfig);
            
            // Should use default config
            expect(newConfig.mode).toBe(DEFAULT_RIFF_CONFIG.mode);
            expect(newConfig.useLocalScheduler).toBe(DEFAULT_RIFF_CONFIG.useLocalScheduler);
            expect(newConfig.incrementalSync).toEqual(DEFAULT_RIFF_CONFIG.incrementalSync);
            expect(newConfig.fullSync).toEqual(DEFAULT_RIFF_CONFIG.fullSync);
            expect(newConfig.deleteSync).toEqual(DEFAULT_RIFF_CONFIG.deleteSync);
        });
    });
});
