/**
 * UnifiedStoragePersistence - 统一存储持久化适配器
 * 
 * @module UnifiedStoragePersistence
 * @description
 * 连接 SQLite 初始迁移和旧 MessagePack 存储系统。
 * 只提供 load 回调，用于把 unified-cards.msgpack 作为迁移源导入 SQL。
 * 
 * **职责**：
 * - 使用插件的 loadData API 读取旧 MessagePack 文件
 * - 处理旧数据的结构校验
 * - 提供错误处理和日志记录
 * 
 * **Validates: Requirements 1.1, 1.7**
 */

import type { Plugin } from 'siyuan';
import type { StorageLoadReason, UnifiedCardStore } from './UnifiedStorageManager';
import { createLogger } from '@/utils/logger';

type PersistencePlugin = Pick<Plugin, 'loadData'>;

const logger = createLogger('UnifiedStoragePersistence');

/** 统一存储文件名 */
export const UNIFIED_STORAGE_KEY = 'unified-cards.msgpack';

/**
 * 创建旧统一存储加载回调函数
 * 
 * @param plugin - SiyuanMemo 插件实例
 * @returns 包含 load 回调的对象
 */
export function createLegacyStorageLoader(plugin: PersistencePlugin) {
  /**
   * 加载回调：从 MessagePack 文件读取并反序列化数据
   */
  const load = async (reason: StorageLoadReason = 'unspecified'): Promise<UnifiedCardStore> => {
    try {
      // 使用插件的 loadData API，会自动解码 MessagePack 格式
      const data = await plugin.loadData(UNIFIED_STORAGE_KEY);

      if (data) {
        // 验证数据结构
        if (!data.version || !data.xiuyuans || !data.cards) {
          const error = new Error('Invalid unified storage structure');
          logger.error('Invalid data structure, aborting load to prevent overwrite', {
            hasVersion: Boolean((data as { version?: unknown }).version),
            hasXiuyuans: Boolean((data as { xiuyuans?: unknown }).xiuyuans),
            hasCards: Boolean((data as { cards?: unknown }).cards),
          });
          throw error;
        }

        const loadLog = reason === 'pre-save-conflict-check' ? logger.debug.bind(logger) : logger.info.bind(logger);
        loadLog('Loaded legacy unified store from msgpack', {
          reason,
          version: data.version,
          xiuyuans: Object.keys(data.xiuyuans).length,
          cards: Object.keys(data.cards).length,
        });

        return data as UnifiedCardStore;
      }

      // 文件不存在，返回空数据
      const emptyLog = reason === 'pre-save-conflict-check' ? logger.debug.bind(logger) : logger.info.bind(logger);
      emptyLog('No existing data, using empty store', { reason });
      return createEmptyStore();
    } catch (error) {
      logger.error('Failed to load', error);
      throw (error instanceof Error ? error : new Error(String(error)));
    }
  };

  return { load };
}

/**
 * 创建空的存储数据结构
 */
function createEmptyStore(): UnifiedCardStore {
  return {
    version: 2,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    deletedCardDTOs: {},
    deletedXiuyuans: {},
    riffBlacklist: [],
    riffSyncState: {},
  };
}
