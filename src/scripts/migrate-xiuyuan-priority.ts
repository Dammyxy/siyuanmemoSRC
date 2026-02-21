/**
 * 迁移脚本：将 Xiuyuan 的 priority 从 0-10 范围转换为 0-100 范围
 * 
 * 背景：
 * - Priority 值对象之前使用 0-10 范围，默认值 5
 * - 现在改为 0-100 范围，默认值 50
 * - 需要迁移已存在的数据
 */

import { UnifiedStorageManager } from '../core/storage/UnifiedStorageManager';
import { Priority } from '../core/xiuyuan/domain/Priority';

export async function migrateXiuyuanPriority(storage: UnifiedStorageManager): Promise<{
  total: number;
  migrated: number;
  errors: number;
}> {
  console.log('[MigrateXiuyuanPriority] Starting migration...');
  
  const stats = {
    total: 0,
    migrated: 0,
    errors: 0,
  };
  
  try {
    // 1. 获取所有 Xiuyuan
    const xiuyuans = storage.getAllXiuYuans();
    stats.total = xiuyuans.length;
    
    console.log(`[MigrateXiuyuanPriority] Found ${stats.total} Xiuyuans`);
    
    // 2. 遍历并迁移
    for (const xiuyuan of xiuyuans) {
      try {
        const currentPriority = xiuyuan.priority;
        
        // 检查是否需要迁移（priority <= 10 表示使用旧范围）
        if (currentPriority !== undefined && currentPriority <= 10) {
          // 转换：0-10 → 0-100
          const newPriority = currentPriority * 10;
          
          console.log(`[MigrateXiuyuanPriority] Migrating Xiuyuan ${xiuyuan.id}: priority ${currentPriority} → ${newPriority}`);
          
          // 更新 priority
          xiuyuan.priority = newPriority;
          
          // 保存到 storage（直接更新 Map）
          (storage as any).xiuyuans.set(xiuyuan.id, xiuyuan);
          
          stats.migrated++;
        }
      } catch (error) {
        console.error(`[MigrateXiuyuanPriority] Failed to migrate Xiuyuan ${xiuyuan.id}:`, error);
        stats.errors++;
      }
    }
    
    // 3. 保存到磁盘
    if (stats.migrated > 0) {
      console.log(`[MigrateXiuyuanPriority] Saving ${stats.migrated} migrated Xiuyuans...`);
      const saveResult = await storage.save();
      
      if (!saveResult.ok) {
        console.error('[MigrateXiuyuanPriority] Failed to save:', saveResult.error);
        throw new Error('Failed to save migrated data');
      }
      
      console.log('[MigrateXiuyuanPriority] Migration completed successfully');
    } else {
      console.log('[MigrateXiuyuanPriority] No Xiuyuans need migration');
    }
    
  } catch (error) {
    console.error('[MigrateXiuyuanPriority] Migration failed:', error);
    throw error;
  }
  
  return stats;
}
