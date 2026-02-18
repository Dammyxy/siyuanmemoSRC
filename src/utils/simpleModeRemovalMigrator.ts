/**
 * Simple Mode Removal Migrator
 * 
 * 负责将简单模式配置迁移到高级模式，作为移除简单模式功能的一部分
 */

import type { RiffIntegrationConfig } from '@/types/settings';
import { pushMsg, pushErrMsg } from '@/core/siyuan/api';

/**
 * 简单模式移除迁移器
 */
export class SimpleModeRemovalMigrator {
    /**
     * 检查配置是否需要迁移（从简单模式到高级模式）
     * 
     * @param config - Riff 集成配置
     * @returns 是否需要迁移
     */
    static needsMigration(config: RiffIntegrationConfig | undefined): boolean {
        if (!config) {
            return false;
        }
        
        // 如果配置中存在 mode 字段且为 'simple'，需要迁移
        return config.mode === 'simple';
    }
    
    /**
     * 迁移配置：从简单模式切换到高级模式
     * 
     * 迁移规则：
     * - 移除 mode 字段（系统将默认使用高级模式）
     * - 保留其他配置项
     * - 启用增量同步以确保数据完整性
     * 
     * @param oldConfig - 旧版配置
     * @returns 新版配置（移除 mode 字段）
     */
    static migrate(oldConfig: RiffIntegrationConfig): Omit<RiffIntegrationConfig, 'mode'> {
        console.log('[SiYuanMemo][SimpleModeRemovalMigrator] Migrating from simple mode to advanced mode');
        console.log('[SiYuanMemo][SimpleModeRemovalMigrator] Old config:', oldConfig);
        
        // 创建新配置，移除 mode 字段
        const { mode, ...newConfig } = oldConfig;
        
        // 确保启用增量同步，以便迁移数据
        if (!newConfig.incrementalSync.enabled) {
            console.log('[SiYuanMemo][SimpleModeRemovalMigrator] Enabling incremental sync for migration');
            newConfig.incrementalSync = {
                ...newConfig.incrementalSync,
                enabled: true,
                triggers: ['plugin-start', 'browser-open', 'review-open']
            };
        }
        
        // 确保使用本地调度器
        newConfig.useLocalScheduler = true;
        
        console.log('[SiYuanMemo][SimpleModeRemovalMigrator] New config:', newConfig);
        return newConfig;
    }
    
    /**
     * 显示迁移通知给用户
     * 
     * @param wasSimpleMode - 是否从简单模式迁移
     */
    static async showMigrationNotification(wasSimpleMode: boolean): Promise<void> {
        if (wasSimpleMode) {
            const message = `🔄 数据源模式已自动升级

您的配置已从简单模式升级到高级模式：
- ✅ 更快的性能和离线访问
- ✅ 更多的队列类型和功能
- ✅ 数据将自动同步，无需手动操作

详情请查看设置面板。`;
            
            await pushMsg(message, 10000);
            console.log('[SiYuanMemo][SimpleModeRemovalMigrator] Migration notification displayed');
        }
    }
    
    /**
     * 触发增量同步以迁移数据
     * 
     * 注意：此方法需要在 HybridSyncService 初始化后调用
     * 
     * @param syncService - HybridSyncService 实例
     * @returns 同步是否成功
     */
    static async triggerMigrationSync(syncService: any): Promise<boolean> {
        try {
            console.log('[SiYuanMemo][SimpleModeRemovalMigrator] Triggering incremental sync for migration');
            const result = await syncService.incrementalSync();
            
            if (result.success) {
                console.log('[SiYuanMemo][SimpleModeRemovalMigrator] ✅ Migration sync completed successfully');
                console.log(`[SiYuanMemo][SimpleModeRemovalMigrator] Synced ${result.syncedCount} cards`);
                return true;
            } else {
                console.error('[SiYuanMemo][SimpleModeRemovalMigrator] ❌ Migration sync failed:', result.error);
                return false;
            }
        } catch (error) {
            console.error('[SiYuanMemo][SimpleModeRemovalMigrator] ❌ Migration sync error:', error);
            return false;
        }
    }
    
    /**
     * 处理迁移错误
     * 
     * @param error - 错误对象
     * @param context - 错误上下文
     */
    static async handleMigrationError(error: Error, context: string): Promise<void> {
        const errorMessage = `数据迁移失败（${context}），但系统将继续使用高级模式。您可以手动触发全量同步。`;
        
        console.error(`[SiYuanMemo][SimpleModeRemovalMigrator] ❌ Migration error in ${context}:`, error);
        console.error('[SiYuanMemo][SimpleModeRemovalMigrator] Stack trace:', error.stack);
        
        await pushErrMsg(errorMessage, 10000);
    }
    
    /**
     * 执行完整的迁移流程
     * 
     * @param config - 当前配置
     * @param syncService - HybridSyncService 实例（可选，如果提供则触发同步）
     * @returns 迁移后的配置和是否成功
     */
    static async performMigration(
        config: RiffIntegrationConfig,
        syncService?: any
    ): Promise<{
        migratedConfig: Omit<RiffIntegrationConfig, 'mode'>;
        success: boolean;
        syncTriggered: boolean;
    }> {
        const wasSimpleMode = this.needsMigration(config);
        
        if (!wasSimpleMode) {
            console.log('[SiYuanMemo][SimpleModeRemovalMigrator] No migration needed');
            // 即使不是简单模式，也移除 mode 字段以保持一致性
            const { mode, ...cleanConfig } = config;
            return {
                migratedConfig: cleanConfig,
                success: true,
                syncTriggered: false
            };
        }
        
        try {
            // 步骤 1: 迁移配置
            const migratedConfig = this.migrate(config);
            
            // 步骤 2: 触发同步（如果提供了 syncService）
            let syncSuccess = true;
            let syncTriggered = false;
            
            if (syncService) {
                syncTriggered = true;
                syncSuccess = await this.triggerMigrationSync(syncService);
                
                if (!syncSuccess) {
                    await this.handleMigrationError(
                        new Error('Sync failed'),
                        'incremental sync'
                    );
                }
            }
            
            // 步骤 3: 显示通知
            await this.showMigrationNotification(wasSimpleMode);
            
            return {
                migratedConfig,
                success: syncSuccess,
                syncTriggered
            };
        } catch (error) {
            await this.handleMigrationError(error as Error, 'migration process');
            
            // 即使失败，也返回迁移后的配置，让系统继续运行
            const { mode, ...fallbackConfig } = config;
            return {
                migratedConfig: fallbackConfig,
                success: false,
                syncTriggered: false
            };
        }
    }
}
