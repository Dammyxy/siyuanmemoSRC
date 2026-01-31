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
  const cards = config.retrievalQueue.getAllItems();
  if (cards.length === 0) {
    // 由调用方处理消息提示
    return;
  }
  // 由 ReviewDialogManager 处理打开对话框
}
