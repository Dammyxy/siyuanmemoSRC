/**
 * QueueHelpers - 队列相关的辅助函数
 * 从 index.ts 拆分出来的工具模块
 */

import { getCardBlockIds } from '@/core/siyuan/block';
import { pushMsg, pushErrMsg } from '@/core/siyuan/api';
import type { QueueItem } from '@/core/queue';
import type { BlockMenuHandler } from './BlockMenuHandler';

export type PracticeQueueFilter = { type: 'doc' | 'tree' | 'sql'; value: string };

export interface QueueHelpersConfig {
  blockMenuHandler: BlockMenuHandler;
  retrievalQueue: { 
    addCard?: (blockId: string, source: 'manual' | 'auto-failed') => Promise<void>;  // ✅ 新架构
    addItems?: (items: QueueItem[]) => number;  // ✅ 旧架构
    getAllCards?: () => Promise<any[]>;  // ✅ 新架构
    getAllItems?: () => any[];  // ✅ 旧架构
    getSize?: () => Promise<number>;  // ✅ 新架构
  };
}

/**
 * 获取练习队列的块 ID 列表
 */
export async function getPracticeQueueBlockIds(filter: PracticeQueueFilter): Promise<string[]> {
  if (!filter.value) {
    return [];
  }
  return getCardBlockIds({ type: filter.type, value: filter.value });
}

/**
 * 预览练习队列（返回卡片数量）
 */
export async function previewPracticeQueue(
  filter: PracticeQueueFilter
): Promise<number> {
  const blockIds = await getPracticeQueueBlockIds(filter);
  return blockIds.length;
}

/**
 * 添加卡片到练习队列
 */
export async function addPracticeQueue(
  filter: PracticeQueueFilter,
  config: QueueHelpersConfig
): Promise<number> {
  const blockIds = await getPracticeQueueBlockIds(filter);
  if (blockIds.length === 0) {
    return 0;
  }
  
  const queue = config.retrievalQueue;
  
  // ✅ 新架构：使用 addCard 方法（逐个添加）
  if (queue?.addCard) {
    let added = 0;
    for (const blockId of blockIds) {
      try {
        await queue.addCard(blockId, 'manual');
        added++;
      } catch (err) {
        console.error(`[QueueHelpers] 添加卡片失败: ${blockId}`, err);
      }
    }
    return added;
  }
  
  // ✅ 旧架构：使用 addItems 方法（批量添加）
  if (queue?.addItems) {
    const cards = await config.blockMenuHandler.buildDrillCardsFromBlockIds(blockIds);
    return queue.addItems(cards as QueueItem[]);
  }
  
  return 0;
}

/**
 * 清空练习队列
 */
export async function clearPracticeQueue(config: QueueHelpersConfig): Promise<void> {
  try {
    // 确认对话框
    const confirmed = confirm('确定要清空练习队列吗？此操作不可撤销。');
    if (!confirmed) return;

    // 清空队列
    const count = await (config.retrievalQueue as any).clear();

    // 显示成功消息
    await pushMsg(`✅ 已清空 ${count} 张卡片`);
  } catch (error) {
    console.error('[QueueHelpers] Failed to clear queue:', error);
    await pushErrMsg('清空队列失败，请查看控制台');
  }
}

/**
 * 创建队列处理器对象
 */
export function createQueueHandlers(config: QueueHelpersConfig) {
  return {
    preview: (filter: PracticeQueueFilter) => previewPracticeQueue(filter),
    add: (filter: PracticeQueueFilter) => addPracticeQueue(filter, config),
    start: () => startPracticeQueue(config),
    clear: () => clearPracticeQueue(config),
  };
}

/**
 * 开始练习队列
 */
async function startPracticeQueue(config: QueueHelpersConfig): Promise<void> {
  const queue = config.retrievalQueue;
  
  // ✅ 新架构：使用 getAllCards 或 getSize
  if (queue?.getAllCards) {
    const cards = await queue.getAllCards();
    if (cards.length === 0) {
      return;
    }
  } else if (queue?.getSize) {
    const size = await queue.getSize();
    if (size === 0) {
      return;
    }
  } else if (queue?.getAllItems) {
    // ✅ 旧架构：使用 getAllItems
    const cards = queue.getAllItems();
    if (cards.length === 0) {
      return;
    }
  }
  
  // 由 ReviewDialogManager 处理打开对话框
}
