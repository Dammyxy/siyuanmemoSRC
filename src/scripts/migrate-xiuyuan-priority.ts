/**
 * 迁移脚本：将 Xiuyuan 的 priority 从 0-10 范围转换为 0-100 范围
 * 
 * 背景：
 * - Priority 值对象之前使用 0-10 范围，默认值 5
 * - 现在改为 0-100 范围，默认值 50
 * - 需要迁移已存在的数据
 */

import { UnifiedStorageManager } from '../core/storage/UnifiedStorageManager';
import { isErr } from '../types/result';
import { createLogger } from '../utils/logger';

const logger = createLogger('migrateXiuyuanPriority');

export async function migrateXiuyuanPriority(storage: UnifiedStorageManager): Promise<{
  total: number;
  migrated: number;
  errors: number;
}> {
  logger.info('[MigrateXiuyuanPriority] Starting migration...');
  
  const stats = {
    total: 0,
    migrated: 0,
    errors: 0,
  };
  
  try {
    // 1. 获取所有 Xiuyuan
    const xiuyuans = storage.getAllXiuYuans();
    stats.total = xiuyuans.length;
    
    logger.info(`[MigrateXiuyuanPriority] Found ${stats.total} Xiuyuans`);
    
    // 2. 遍历并迁移
    for (const xiuyuan of xiuyuans) {
      try {
        const meta: Record<string, unknown> = (xiuyuan.meta && typeof xiuyuan.meta === 'object')
          ? { ...xiuyuan.meta }
          : {};
        const currentPriority = typeof meta.priority === 'number' ? meta.priority : undefined;
        
        // 检查是否需要迁移（priority <= 10 表示使用旧范围）
        if (currentPriority !== undefined && currentPriority <= 10) {
          // 转换：0-10 → 0-100
          const newPriority = currentPriority * 10;
          
          logger.info(`[MigrateXiuyuanPriority] Migrating Xiuyuan ${xiuyuan.id}: priority ${currentPriority} → ${newPriority}`);
          
          // 更新 priority
          xiuyuan.meta = {
            ...meta,
            priority: newPriority,
          };
          
          // 保存到 storage
          storage.upsertXiuYuan(xiuyuan);
          
          stats.migrated++;
        }
      } catch (error) {
        logger.error(`[MigrateXiuyuanPriority] Failed to migrate Xiuyuan ${xiuyuan.id}:`, error);
        stats.errors++;
      }
    }
    
    // 3. 保存到磁盘
    if (stats.migrated > 0) {
      logger.info(`[MigrateXiuyuanPriority] Saving ${stats.migrated} migrated Xiuyuans...`);
      const saveResult = await storage.save();
      
      if (isErr(saveResult)) {
        logger.error('[MigrateXiuyuanPriority] Failed to save:', saveResult.error);
        throw new Error('Failed to save migrated data');
      }
      
      logger.info('[MigrateXiuyuanPriority] Migration completed successfully');
    } else {
      logger.info('[MigrateXiuyuanPriority] No Xiuyuans need migration');
    }
    
  } catch (error) {
    logger.error('[MigrateXiuyuanPriority] Migration failed:', error);
    throw error;
  }
  
  return stats;
}
