/**
 * RiffIntegrationConfig Unit Tests
 * 
 * 测试 Riff 集成配置接口和默认配置
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_RIFF_CONFIG, type RiffIntegrationConfig } from '../settings';

describe('RiffIntegrationConfig', () => {
    describe('DEFAULT_RIFF_CONFIG', () => {
        it('should have correct mode', () => {
            expect(DEFAULT_RIFF_CONFIG.mode).toBe('advanced');
        });
        
        it('should use local scheduler by default', () => {
            expect(DEFAULT_RIFF_CONFIG.useLocalScheduler).toBe(true);
        });
        
        describe('incrementalSync', () => {
            it('should be enabled by default', () => {
                expect(DEFAULT_RIFF_CONFIG.incrementalSync.enabled).toBe(true);
            });
            
            it('should default to plugin-start only', () => {
                const triggers = DEFAULT_RIFF_CONFIG.incrementalSync.triggers;
                expect(triggers).toEqual(['plugin-start']);
            });
            
            it('should use blacklist by default', () => {
                expect(DEFAULT_RIFF_CONFIG.incrementalSync.useBlacklist).toBe(true);
            });
        });
        
        describe('fullSync', () => {
            it('should be enabled by default', () => {
                expect(DEFAULT_RIFF_CONFIG.fullSync.enabled).toBe(true);
            });
            
            it('should have 7-day interval', () => {
                const expectedInterval = 7 * 24 * 60 * 60 * 1000; // 7天（毫秒）
                expect(DEFAULT_RIFF_CONFIG.fullSync.interval).toBe(expectedInterval);
                expect(DEFAULT_RIFF_CONFIG.fullSync.interval).toBe(604800000);
            });
            
            it('should cleanup blacklist by default', () => {
                expect(DEFAULT_RIFF_CONFIG.fullSync.cleanupBlacklist).toBe(true);
            });
        });
        
        describe('deleteSync', () => {
            it('should be enabled by default', () => {
                expect(DEFAULT_RIFF_CONFIG.deleteSync.enabled).toBe(true);
            });
            
            it('should use blacklist fallback by default', () => {
                expect(DEFAULT_RIFF_CONFIG.deleteSync.useBlacklistFallback).toBe(true);
            });
        });
    });
    
    describe('Configuration Structure', () => {
        it('should accept valid advanced mode config', () => {
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
            
            expect(config.mode).toBe('advanced');
            expect(config.useLocalScheduler).toBe(true);
        });
        
        it('should accept valid simple mode config', () => {
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
            
            expect(config.mode).toBe('simple');
            expect(config.useLocalScheduler).toBe(false);
        });
        
        it('should accept custom trigger combinations', () => {
            const config: RiffIntegrationConfig = {
                ...DEFAULT_RIFF_CONFIG,
                incrementalSync: {
                    enabled: true,
                    triggers: ['plugin-start', 'browser-open'], // 只启用两个触发器
                    useBlacklist: true
                }
            };
            
            expect(config.incrementalSync.triggers).toHaveLength(2);
            expect(config.incrementalSync.triggers).not.toContain('review-open');
        });
        
        it('should accept custom full sync interval', () => {
            const customInterval = 12 * 60 * 60 * 1000; // 12小时
            const config: RiffIntegrationConfig = {
                ...DEFAULT_RIFF_CONFIG,
                fullSync: {
                    enabled: true,
                    interval: customInterval,
                    cleanupBlacklist: true
                }
            };
            
            expect(config.fullSync.interval).toBe(customInterval);
        });
    });
    
    describe('Configuration Validation', () => {
        it('should have consistent advanced mode settings', () => {
            // 高阶模式应该启用本地调度器和同步功能
            const config: RiffIntegrationConfig = {
                mode: 'advanced',
                useLocalScheduler: true,
                incrementalSync: {
                    enabled: true,
                    triggers: ['plugin-start', 'browser-open', 'review-open'],
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
            
            expect(config.mode).toBe('advanced');
            expect(config.useLocalScheduler).toBe(true);
            expect(config.incrementalSync.enabled).toBe(true);
            expect(config.fullSync.enabled).toBe(true);
            expect(config.deleteSync.enabled).toBe(true);
        });
        
        it('should have consistent simple mode settings', () => {
            // 简单模式应该禁用本地调度器和同步功能
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
            
            expect(config.mode).toBe('simple');
            expect(config.useLocalScheduler).toBe(false);
            expect(config.incrementalSync.enabled).toBe(false);
            expect(config.fullSync.enabled).toBe(false);
            expect(config.deleteSync.enabled).toBe(false);
        });
    });
    
    describe('Interval Values', () => {
        it('should support common interval values', () => {
            const intervals = {
                '12hours': 12 * 60 * 60 * 1000,
                '24hours': 24 * 60 * 60 * 1000,
                '48hours': 48 * 60 * 60 * 1000,
                '7days': 7 * 24 * 60 * 60 * 1000
            };
            
            expect(intervals['12hours']).toBe(43200000);
            expect(intervals['24hours']).toBe(86400000);
            expect(intervals['48hours']).toBe(172800000);
            expect(intervals['7days']).toBe(604800000);
        });
    });
});
