/**
 * 从 Riff 卡片数据中提取元数据
 * 用于补充 Provider 返回的 QueueItem
 *
 * 这个工具函数解决了不同复习模式数据源不一致的问题：
 * - 卡片浏览器使用 browserService.transformRiffBlock() 提供完整的 meta 字段
 * - 其它复习模式直接使用 Riff API，缺少 meta 字段
 *
 * @param card - Riff API 返回的卡片数据
 * @param storageManager - 可选的 StorageManager 实例，用于获取本地存储的卡片数据
 * @returns 包含 answerBlockID 等元数据的对象
 */

import type { StorageManager } from '../storage/manager';

export interface CardMeta {
  answerBlockID?: string;
  xiuyuanID?: string;
  templateID?: string;
  [key: string]: any;
}

/**
 * 从卡片数据中提取元数据
 *
 * 提取策略：
 * 1. 优先从 StorageManager 中获取已保存的 FSRSCard.meta（最可靠）
 * 2. 如果没有 StorageManager，返回空 meta（优雅降级）
 *
 * 注意：不使用 getBlockAttrs() API，避免额外的网络请求影响性能
 */
export async function extractCardMeta(
  card: any,
  storageManager?: StorageManager
): Promise<CardMeta> {
  const meta: CardMeta = {};

  // 提取块 ID
  const blockID = card.blockID || card.blockId;
  if (!blockID) {
    return meta;
  }

  // 策略 1: 从 StorageManager 获取本地存储的卡片数据
  if (storageManager) {
    try {
      const fsrsCard = storageManager.getCard(blockID);
      if (fsrsCard?.meta) {
        // 找到了本地存储的元数据，直接使用
        return {
          answerBlockID: fsrsCard.meta.answerBlockID,
          xiuyuanID: fsrsCard.meta.xiuyuanID,
          templateID: fsrsCard.meta.templateID,
          ...fsrsCard.meta,
        };
      }
    } catch (err) {
      console.warn('[extractCardMeta] Failed to get card from storage:', err);
    }
  }

  // 如果没有找到元数据，返回空对象（优雅降级）
  return meta;
}

/**
 * 批量提取卡片元数据
 * 用于优化性能，避免多次调用
 */
export async function extractCardMetaBatch(
  cards: any[],
  storageManager?: StorageManager
): Promise<Map<string, CardMeta>> {
  const metaMap = new Map<string, CardMeta>();

  for (const card of cards) {
    const blockID = card.blockID || card.blockId;
    if (blockID) {
      const meta = await extractCardMeta(card, storageManager);
      metaMap.set(blockID, meta);
    }
  }

  return metaMap;
}
