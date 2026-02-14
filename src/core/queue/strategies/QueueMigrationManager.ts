/**
 * Queue Migration Manager
 *
 * 管理队列数据格式的版本和迁移
 * Phase 2d.2: 版本化持久化
 */

import type { QueueItem } from '../types';
import { DEFAULT_PRIORITY } from '../abstraction/IPriority';

/**
 * 队列数据格式（版本化）
 */
export interface QueueData {
  version: number; // 数据格式版本
  items: QueueItem[]; // 队列项
  metadata: {
    createdAt: number; // 创建时间戳
    updatedAt: number; // 更新时间戳
    totalReviewed: number; // 已复习卡片数
    initialTotal: number; // 初始总数（用于计算进度）
  };
}

/**
 * 迁移函数类型
 * 输入：旧版本数据
 * 输出：新版本数据（QueueData）
 */
type MigrationFunction = (data: unknown) => QueueData;

/**
 * QueueMigrationManager
 *
 * 管理队列数据的版本检测和迁移
 */
export class QueueMigrationManager {
  private migrations: Map<number, MigrationFunction>;
  private readonly _latestVersion: number = 2; // 当前最新版本

  constructor() {
    this.migrations = new Map();
    this._registerMigrations();
  }

  /**
   * 注册迁移函数
   */
  private _registerMigrations(): void {
    this.migrations.set(1, this._migrateV1ToV2.bind(this));
    // 未来版本迁移...
    // this.migrations.set(2, this._migrateV2ToV3.bind(this));
  }

  /**
   * 检测数据版本
   */
  detectVersion(data: unknown): number {
    // 检查是否是 QueueData 格式（有 version 字段）
    if (this._isQueueData(data)) {
      return data.version;
    }

    // 检查是否是旧版本（数组格式）
    if (Array.isArray(data)) {
      return 1; // 旧版本：数组格式
    }

    throw new Error('Invalid queue data format: unable to detect version');
  }

  /**
   * 迁移数据到最新版本
   */
  migrate(data: unknown): QueueData {
    let version = this.detectVersion(data);
    let currentData = data;

    // 逐步迁移到最新版本
    while (version < this._latestVersion) {
      const migration = this.migrations.get(version);
      if (!migration) {
        throw new Error(`No migration found for version ${version}`);
      }

      try {
        currentData = migration(currentData);
        version++;
      } catch (error) {
        console.error(`[QueueMigrationManager] Migration failed from v${version}:`, error);
        throw error;
      }
    }

    return currentData as QueueData;
  }

  /**
   * 检查是否是 QueueData 格式
   */
  private _isQueueData(data: unknown): data is QueueData {
    return (
      typeof data === 'object' &&
      data !== null &&
      'version' in data &&
      'items' in data &&
      'metadata' in data
    );
  }

  /**
   * V1 → V2 迁移
   * 从数组格式转换为对象格式
   */
  private _migrateV1ToV2(data: unknown): QueueData {
    const items = data as QueueItem[];

    return {
      version: 2,
      items: items.map(item => this._normalizeItem(item)),
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        totalReviewed: 0,
        initialTotal: items.length,
      },
    };
  }

  /**
   * 规范化卡片数据
   * 统一字段名和默认值
   */
  private _normalizeItem(item: QueueItem): QueueItem {
    return {
      cardID: String(item?.cardID || item?.cardId || ''),
      blockID: String(item?.blockID || item?.blockId || ''),
      deckID: String(item?.deckID || item?.deckId || ''),
      priority: typeof item?.priority === 'number' ? item.priority : DEFAULT_PRIORITY,
      nextDues: item?.nextDues || { 1: '', 2: '', 3: '', 4: '' },
      state: item?.state,
      lapses: item?.lapses,
      reps: item?.reps,
      lastReview: item?.lastReview,
      meta: item?.meta || {},
    };
  }

  /**
   * 获取最新版本号
   */
  get latestVersion(): number {
    return this._latestVersion;
  }
}
