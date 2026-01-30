/**
 * QueueHelpers - 队列相关的辅助函数
 * 从 index.ts 拆分出来的工具模块
 */

import { getCardBlockIds } from '@/core/siyuan/block';
import type { QueueItem } from '@/core/queue';
import type { BlockMenuHandler } from './BlockMenuHandler';

export type PracticeQueueFilter = { type: 'doc' | 'tree' | 'sql'; value: string };

export interface QueueHelpersConfig {
  blockMenuHandler: BlockMenuHandler;
  retrievalQueue: { addItems: (items: QueueItem[]) => number; getAllItems: () => any[] };
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
  const cards = await config.blockMenuHandler.buildDrillCardsFromBlockIds(blockIds);
  return config.retrievalQueue.addItems(cards as QueueItem[]);
}

/**
 * 清空练习队列
 * 注意：RetrievalPracticeQueue 可能没有 clear() 方法
 */
export async function clearPracticeQueue(): Promise<void> {
  // TODO: Implement clear functionality if needed
}

/**
 * 创建队列处理器对象
 */
export function createQueueHandlers(config: QueueHelpersConfig) {
  return {
    preview: (filter: PracticeQueueFilter) => previewPracticeQueue(filter),
    add: (filter: PracticeQueueFilter) => addPracticeQueue(filter, config),
    start: () => startPracticeQueue(config),
    clear: () => clearPracticeQueue(),
  };
}

/**
 * 开始练习队列
 */
async function startPracticeQueue(config: QueueHelpersConfig): Promise<void> {
  const cards = config.retrievalQueue.getAllItems();
  if (cards.length === 0) {
    // 由调用方处理消息提示
    return;
  }
  // 由 ReviewDialogManager 处理打开对话框
}
