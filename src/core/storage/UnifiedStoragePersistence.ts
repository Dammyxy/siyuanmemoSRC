/**
 * UnifiedStoragePersistence - 统一存储持久化适配器
 * 
 * @module UnifiedStoragePersistence
 * @description
 * 连接 UnifiedStorageManager 和插件的 MessagePack 存储系统。
 * 提供 load 和 save 回调函数，用于持久化 unified-cards.msgpack 文件。
 * 
 * **职责**：
 * - 使用插件的 loadData/saveData API 读写 MessagePack 文件
 * - 处理数据的序列化和反序列化
 * - 提供错误处理和日志记录
 * 
 * **Validates: Requirements 1.1, 1.7**
 */

import type { Plugin } from 'siyuan';
import type { UnifiedCardStore } from './UnifiedStorageManager';
import { createLogger } from '@/utils/logger';

type PersistencePlugin = Pick<Plugin, 'saveData' | 'loadData'>;

const logger = createLogger('UnifiedStoragePersistence');

/** 统一存储文件名 */
export const UNIFIED_STORAGE_KEY = 'unified-cards.msgpack';

/**
 * 创建持久化回调函数
 * 
 * @param plugin - SiyuanMemo 插件实例
 * @returns 包含 save 和 load 回调的对象
 */
export function createPersistenceCallbacks(plugin: PersistencePlugin) {
  /**
   * 保存回调：将数据序列化为 MessagePack 并保存到文件
   */
  const save = async (data: UnifiedCardStore): Promise<void> => {
    try {
      // 使用插件的 saveData API，会自动编码为 MessagePack 格式
      await plugin.saveData(UNIFIED_STORAGE_KEY, data);
      logger.info('Saved to msgpack', {
        version: data.version,
        xiuyuans: Object.keys(data.xiuyuans).length,
        cards: Object.keys(data.cards).length,
      });
    } catch (error) {
      logger.error('Failed to save', error);
      throw error;
    }
  };

  /**
   * 加载回调：从 MessagePack 文件读取并反序列化数据
   */
  const load = async (): Promise<UnifiedCardStore> => {
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

        logger.info('Loaded from msgpack', {
          version: data.version,
          xiuyuans: Object.keys(data.xiuyuans).length,
          cards: Object.keys(data.cards).length,
        });

        return data as UnifiedCardStore;
      }

      // 文件不存在，返回空数据
      logger.info('No existing data, using empty store');
      return createEmptyStore();
    } catch (error) {
      logger.error('Failed to load', error);
      throw (error instanceof Error ? error : new Error(String(error)));
    }
  };

  return { save, load };
}

/**
 * 创建空的存储数据结构
 */
function createEmptyStore(): UnifiedCardStore {
  return {
    version: 1,
    xiuyuans: {},
    cards: {},
    cardDTOs: {},
    riffBlacklist: [],
  };
}
