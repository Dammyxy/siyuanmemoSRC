/**
 * ConfigManager - 管理重新调度操作的配置持久化
 * 
 * 功能：
 * - 保存/加载/删除 Postpone、Advance、Spread 配置
 * - 提供默认配置
 * - 集成 StorageManager 进行持久化
 * 
 * 使用示例：
 * ```typescript
 * const configManager = new ConfigManager(storage);
 * 
 * // 获取默认配置
 * const defaultConfig = configManager.getDefaultPostponeConfig();
 * 
 * // 保存配置
 * await configManager.saveConfig('my-preset', customConfig, 'postpone');
 * 
 * // 加载配置
 * const config = await configManager.loadConfig('my-preset', 'postpone');
 * 
 * // 删除配置
 * await configManager.deleteConfig('my-preset', 'postpone');
 * ```
 * 
 * 验证需求：11.1, 11.2, 11.3, 11.4, 11.5
 */

import type { PostponeConfig, AdvanceConfig, SpreadConfig, SortingCriterion } from '@/types/reschedule';
import type { StorageManager } from '@/core/storage/manager';

/** 配置存储格式 */
export interface RescheduleConfigs {
    postpone: Record<string, PostponeConfig>;
    advance: Record<string, AdvanceConfig>;
    spread: Record<string, SpreadConfig>;
}

export class ConfigManager {
    private static readonly CONFIG_FILE = 'reschedule-configs.json';
    
    constructor(private storage: StorageManager) {}
    
    /**
     * 保存配置
     * @param name 配置名称
     * @param config 配置对象
     * @param type 配置类型
     */
    async saveConfig(
        name: string,
        config: PostponeConfig | AdvanceConfig | SpreadConfig,
        type: 'postpone' | 'advance' | 'spread'
    ): Promise<void> {
        const configs = await this.loadAllConfigs();
        
        // 确保配置类型对象存在
        if (!configs[type]) {
            configs[type] = {} as any;
        }
        
        configs[type][name] = config as any;
        await this.saveAllConfigs(configs);
    }
    
    /**
     * 加载配置
     * @param name 配置名称
     * @param type 配置类型
     * @returns 配置对象，如果不存在则返回 null
     */
    async loadConfig(
        name: string,
        type: 'postpone' | 'advance' | 'spread'
    ): Promise<PostponeConfig | AdvanceConfig | SpreadConfig | null> {
        const configs = await this.loadAllConfigs();
        return configs[type][name] ?? null;
    }
    
    /**
     * 删除配置
     * @param name 配置名称
     * @param type 配置类型
     */
    async deleteConfig(
        name: string,
        type: 'postpone' | 'advance' | 'spread'
    ): Promise<void> {
        const configs = await this.loadAllConfigs();
        delete configs[type][name];
        await this.saveAllConfigs(configs);
    }
    
    /**
     * 获取默认 Postpone 配置
     */
    getDefaultPostponeConfig(): PostponeConfig {
        return {
            delayFactor: 1.1,
            minInterval: 1,
            maxInterval: 365,
            includeNonOutstanding: false,  // 默认为 Postpone 模式（仅处理到期卡片）
            skipConditions: {
                skipByPriority: { enabled: false, threshold: 10 },
                skipByInterval: { enabled: false, threshold: 365 },
                skipByRetrievability: { enabled: false, threshold: 0.9 },
                skipByAFactor: { enabled: false, threshold: 1.5 },
                skipByPostponeCount: { enabled: false, threshold: 10 }
            },
            modifyDelayByRetrievability: false,
            modifyDelayByPriority: false,
            skipTopNElements: 0
        };
    }
    
    /**
     * 获取默认 Advance 配置
     */
    getDefaultAdvanceConfig(): AdvanceConfig {
        return {
            maxDays: 30,
            randomize: true,
            handleOverdueCards: true
        };
    }
    
    /**
     * 获取默认 Spread 配置
     */
    getDefaultSpreadConfig(): SpreadConfig {
        return {
            collectingPeriod: 30,
            reschedulingPeriod: 30,
            considerFutureRepetitions: false,
            sortingCriterion: 'random' as SortingCriterion,
            maxCardsPerDay: undefined
        };
    }
    
    /**
     * 加载所有配置
     * @returns 所有配置对象
     */
    private async loadAllConfigs(): Promise<RescheduleConfigs> {
        try {
            const data = await this.storage.loadData(ConfigManager.CONFIG_FILE);
            if (data) {
                return data as RescheduleConfigs;
            }
        } catch (error) {
            console.warn('[ConfigManager] Failed to load configs:', error);
        }
        
        // 返回空配置
        return {
            postpone: {},
            advance: {},
            spread: {}
        };
    }
    
    /**
     * 保存所有配置
     * @param configs 所有配置对象
     */
    private async saveAllConfigs(configs: RescheduleConfigs): Promise<void> {
        try {
            await this.storage.saveData(ConfigManager.CONFIG_FILE, configs);
        } catch (error) {
            console.error('[ConfigManager] Failed to save configs:', error);
            throw error;
        }
    }
}
