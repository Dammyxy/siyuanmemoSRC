/**
 * Queue Recovery Manager
 *
 * 管理队列数据的验证和恢复
 * Phase 2d.4: 数据恢复和备份
 */

import type { QueueData } from './QueueMigrationManager';

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * QueueRecoveryManager
 *
 * 验证和恢复队列数据
 */
export class QueueRecoveryManager {
  /**
   * 验证队列数据
   */
  validateQueueData(data: unknown): ValidationResult {
    // 检查 null/undefined
    if (!data) {
      return { valid: false, error: 'Data is null or undefined' };
    }

    // 检查是否是对象
    if (typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, error: 'Data is not an object' };
    }

    // 检查版本号
    const obj = data as Record<string, unknown>;
    if (typeof obj.version !== 'number') {
      return { valid: false, error: 'Missing or invalid version field' };
    }

    // 检查 items 数组
    if (!Array.isArray(obj.items)) {
      return { valid: false, error: 'Missing or invalid items array' };
    }

    // 检查每个 item 的必需字段
    for (let i = 0; i < obj.items.length; i++) {
      const item = obj.items[i];
      if (!item || typeof item !== 'object') {
        return { valid: false, error: `Item at index ${i} is not an object` };
      }

      const itemObj = item as Record<string, unknown>;

      // 检查 cardID
      if (!itemObj.cardID || typeof itemObj.cardID !== 'string') {
        return { valid: false, error: `Item at index ${i} missing valid cardID` };
      }

      // 检查 blockID
      if (!itemObj.blockID || typeof itemObj.blockID !== 'string') {
        return { valid: false, error: `Item at index ${i} missing valid blockID` };
      }
    }

    // 检查 metadata
    if (!obj.metadata || typeof obj.metadata !== 'object') {
      return { valid: false, error: 'Missing or invalid metadata' };
    }

    const metadata = obj.metadata as Record<string, unknown>;

    // 检查 metadata 字段
    if (typeof metadata.createdAt !== 'number') {
      return { valid: false, error: 'Missing or invalid createdAt in metadata' };
    }

    if (typeof metadata.updatedAt !== 'number') {
      return { valid: false, error: 'Missing or invalid updatedAt in metadata' };
    }

    return { valid: true };
  }

  /**
   * 恢复队列数据
   *
   * 尝试从主数据恢复，如果失败则尝试从备份恢复
   *
   * @param rawData 主数据
   * @param backupData 备份数据
   * @returns 恢复后的数据，如果全部失败则返回 null
   */
  recover(rawData: unknown, backupData: unknown | null): QueueData | null {
    // 尝试验证主数据
    const mainValidation = this.validateQueueData(rawData);
    if (mainValidation.valid) {
      console.info('[QueueRecoveryManager] Main data is valid, using it');
      return rawData as QueueData;
    }

    console.warn('[QueueRecoveryManager] Main data validation failed:', mainValidation.error);

    // 尝试加载备份
    if (backupData) {
      const backupValidation = this.validateQueueData(backupData);
      if (backupValidation.valid) {
        console.info('[QueueRecoveryManager] Recovered from backup');
        return backupData as QueueData;
      } else {
        console.warn('[QueueRecoveryManager] Backup validation failed:', backupValidation.error);
      }
    } else {
      console.warn('[QueueRecoveryManager] No backup available');
    }

    // 全部失败
    console.error('[QueueRecoveryManager] Unable to recover queue data');
    return null;
  }

  /**
   * 创建空队列数据
   *
   * 当恢复失败时，返回一个新的空队列
   */
  createEmptyQueue(): QueueData {
    return {
      version: 2,
      items: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalReviewed: 0,
        initialTotal: 0,
      },
    };
  }

  /**
   * 克隆队列数据（用于备份）
   */
  cloneQueueData(data: QueueData): QueueData {
    return JSON.parse(JSON.stringify(data));
  }
}
