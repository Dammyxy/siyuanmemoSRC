/**
 * Configuration Migrator
 * 
 * 负责将旧版 Riff 集成配置迁移到新版混合同步方案配置
 */

import type { RiffIntegrationConfig } from '@/types/settings';
import { DEFAULT_RIFF_CONFIG } from '@/types/settings';

/**
 * 旧版 Riff 集成配置（已废弃）
 */
interface LegacyRiffIntegrationConfig {
    mode: 'disabled' | 'data-only' | 'full-scheduler';
    dataSourceMode: 'due-only' | 'all' | 'incremental';
    syncToRiff: boolean;
    useRiffScheduler: boolean;
    incrementalUpdateInterval: number;
}

function isLegacyConfig(config: unknown): config is LegacyRiffIntegrationConfig {
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const mode = (config as { mode?: unknown }).mode;
    return mode === 'disabled' || mode === 'data-only' || mode === 'full-scheduler';
}

/**
 * 配置迁移器
 */
export class ConfigMigrator {
    /**
     * 检查是否需要迁移
     * 
     * @param config - 配置对象
     * @returns 是否需要迁移
     */
    static needsMigration(config: unknown): boolean {
        return isLegacyConfig(config);
    }
    
    /**
     * 迁移旧配置到新配置
     * 
     * 迁移规则：
     * - disabled → simple 模式（不使用本地调度器）
     * - data-only → advanced 模式（使用本地调度器 + 混合同步）
     * - full-scheduler → simple 模式（不使用本地调度器）
     * 
     * @param oldConfig - 旧版配置
     * @returns 新版配置
     */
    static migrate(oldConfig: LegacyRiffIntegrationConfig): RiffIntegrationConfig {
        console.log('[SiYuanMemo][ConfigMigrator] Migrating old config:', oldConfig);
        
        let newConfig: RiffIntegrationConfig;
        
        switch (oldConfig.mode) {
            case 'disabled':
                // disabled → simple 模式
                newConfig = {
                    mode: 'simple',
                    useLocalScheduler: false,
                    incrementalSync: {
                        enabled: false,
                        triggers: [],
                        useBlacklist: false
                    },
                    fullSync: {
                        enabled: false,
                        interval: DEFAULT_RIFF_CONFIG.fullSync.interval,
                        cleanupBlacklist: false
                    },
                    deleteSync: {
                        enabled: false,
                        useBlacklistFallback: false
                    }
                };
                break;
                
            case 'data-only':
                // data-only → advanced 模式（混合同步）
                newConfig = {
                    mode: 'advanced',
                    useLocalScheduler: true,
                    incrementalSync: {
                        enabled: true,
                        triggers: ['plugin-start', 'browser-open', 'review-open'],
                        useBlacklist: true
                    },
                    fullSync: {
                        enabled: true,
                        interval: DEFAULT_RIFF_CONFIG.fullSync.interval,
                        cleanupBlacklist: true
                    },
                    deleteSync: {
                        enabled: true,
                        useBlacklistFallback: true
                    }
                };
                break;
                
            case 'full-scheduler':
                // full-scheduler → simple 模式
                newConfig = {
                    mode: 'simple',
                    useLocalScheduler: false,
                    incrementalSync: {
                        enabled: false,
                        triggers: [],
                        useBlacklist: false
                    },
                    fullSync: {
                        enabled: false,
                        interval: DEFAULT_RIFF_CONFIG.fullSync.interval,
                        cleanupBlacklist: false
                    },
                    deleteSync: {
                        enabled: false,
                        useBlacklistFallback: false
                    }
                };
                break;
                
            default:
                // 未知模式，使用默认配置
                console.warn('[SiYuanMemo][ConfigMigrator] Unknown mode, using default config');
                newConfig = { ...DEFAULT_RIFF_CONFIG };
        }
        
        console.log('[SiYuanMemo][ConfigMigrator] Migrated to new config:', newConfig);
        return newConfig;
    }
    
    /**
     * 获取迁移提示消息
     * 
     * @param oldMode - 旧版模式
     * @returns 提示消息
     */
    static getMigrationMessage(oldMode: string): string {
        switch (oldMode) {
            case 'disabled':
                return '您的 Riff 集成配置已更新为简单模式（Simple Mode）';
                
            case 'data-only':
                return `🔄 配置已自动迁移

您的 Riff 集成配置已更新为新的混合同步方案：
- 增量同步：快速获取新卡片
- 全量同步：每24小时检测双向删除
- 双向删除：插件和 Riff 保持一致

详情请查看设置面板。`;
                
            case 'full-scheduler':
                return '您的 Riff 集成配置已更新为简单模式（Simple Mode）';
                
            default:
                return '配置已更新';
        }
    }
}
