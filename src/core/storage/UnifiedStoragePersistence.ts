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

import type SiyuanMemoPlugin from '../../index';
import type { UnifiedCardStore } from './UnifiedStorageManager';

/** 统一存储文件名 */
export const UNIFIED_STORAGE_KEY = 'unified-cards.msgpack';

/**
 * 创建持久化回调函数
 * 
 * @param plugin - SiyuanMemo 插件实例
 * @returns 包含 save 和 load 回调的对象
 */
export function createPersistenceCallbacks(plugin: SiyuanMemoPlugin) {
  /**
   * 保存回调：将数据序列化为 MessagePack 并保存到文件
   */
  const save = async (data: UnifiedCardStore): Promise<void> => {
    try {
      // 使用插件的 saveData API，会自动编码为 MessagePack 格式
      await plugin.saveData(UNIFIED_STORAGE_KEY, data);
      console.log('[UnifiedStorage] Saved to msgpack:', {
        version: data.version,
        xiuyuans: Object.keys(data.xiuyuans).length,
        cards: Object.keys(data.cards).length,
      });
    } catch (error) {
      console.error('[UnifiedStorage] Failed to save:', error);
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
          console.warn('[UnifiedStorage] Invalid data structure, using defaults');
          return createEmptyStore();
        }

        console.log('[UnifiedStorage] Loaded from msgpack:', {
          version: data.version,
          xiuyuans: Object.keys(data.xiuyuans).length,
          cards: Object.keys(data.cards).length,
        });

        return data as UnifiedCardStore;
      }

      // 文件不存在，返回空数据
      console.log('[UnifiedStorage] No existing data, using empty store');
      return createEmptyStore();
    } catch (error) {
      console.error('[UnifiedStorage] Failed to load:', error);
      // 返回空数据而不是抛出错误，允许系统继续运行
      return createEmptyStore();
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
  };
}
