/**
 * Queue Menu Actions - Shared Menu Definitions and Handlers
 *
 * 统一管理所有队列 DataSource 的右键菜单动作
 * 通过复用代码减少重复，同时保持灵活性
 */

import type { CardBrowserAction } from './types';
import type { BrowserCard } from '../../browser/types';
import { batchSetPriority } from '../../browser/browserService';
import { RescheduleService } from '@/core/scheduler/rescheduleService';
import type { StorageManager } from '@/core/storage/StorageManager';
import { InsertAtCommand, RemoveItemsCommand, SetPriorityCommand, AutoSortCommand } from '@/core/queue/commands';

// ========== 动作定义 ==========

/**
 * 基础动作定义
 */
export const BASE_ACTIONS = {
  open: { id: 'open', label: 'Open', icon: 'iconOpen' } as CardBrowserAction,
  removeFromQueue: {
    id: 'remove-from-current-queue',
    label: '从当前队列移除',
    icon: 'iconTrashcan',
    danger: true,
  } as CardBrowserAction,
  insertAt: { id: 'insert-at', label: '插入到位置', icon: 'iconAlignLeft' } as CardBrowserAction,
  setPriority: { id: 'set-priority', label: '设置优先级', icon: 'iconMark' } as CardBrowserAction,
  autoSort: { id: 'auto-sort', label: '自动排序', icon: 'iconSort' } as CardBrowserAction,
  postpone: { id: 'postpone', label: '推迟', icon: 'iconCalendar' } as CardBrowserAction,
  advance: { id: 'advance', label: '提前', icon: 'iconCalendar' } as CardBrowserAction,
  spread: { id: 'spread', label: '分散', icon: 'iconSort' } as CardBrowserAction,
  reset: { id: 'reset', label: '重置', icon: 'iconRefresh', danger: true } as CardBrowserAction,
  suspend: { id: 'suspend', label: '暂停', icon: 'iconPause' } as CardBrowserAction,
};

/**
 * 构建"加入队列"子菜单
 */
export function buildAddToQueueAction(hasQueues: {
  retrieval?: boolean;
  incremental?: boolean;
  finalDrill?: boolean;  // ✅ 改名：deliberate → finalDrill
  filterGroup?: boolean;
  neuralRoam?: boolean;
}): CardBrowserAction | null {
  console.log('[MenuActions] buildAddToQueueAction 被调用，参数:', hasQueues);
  
  const queueActions: CardBrowserAction[] = [];

  if (hasQueues.retrieval) {
    console.log('[MenuActions] ✅ 添加提取练习');
    queueActions.push({
      id: 'add-to-retrieval-queue',
      label: '提取练习',
      icon: 'iconList',
    });
  }
  if (hasQueues.incremental) {
    console.log('[MenuActions] ✅ 添加渐进学习');
    queueActions.push({
      id: 'add-to-incremental-queue',
      label: '渐进学习',
      icon: 'iconBook',
    });
  }
  if (hasQueues.finalDrill) {  // ✅ 改名：deliberate → finalDrill
    console.log('[MenuActions] ✅ 添加刻意练习');
    queueActions.push({
      id: 'add-to-final-drill-queue',  // ✅ 改名：add-to-deliberate-queue → add-to-final-drill-queue
      label: '刻意练习',
      icon: 'iconCards',
    });
  } else {
    console.log('[MenuActions] ❌ 没有添加刻意练习（hasQueues.finalDrill =', hasQueues.finalDrill, ')');
  }
  if (hasQueues.filterGroup) {
    console.log('[MenuActions] ✅ 添加筛选复习');
    queueActions.push({
      id: 'add-to-filter-group-queue',
      label: '筛选复习',
      icon: 'iconFilter',
    });
  }
  if (hasQueues.neuralRoam) {
    console.log('[MenuActions] ✅ 添加神经漫游');
    queueActions.push({
      id: 'add-to-neural-roam-queue',
      label: '神经漫游',
      icon: 'iconGraph',
    });
  }

  console.log('[MenuActions] queueActions 数组:', queueActions);
  console.log('[MenuActions] queueActions.length:', queueActions.length);

  const result = queueActions.length > 0
    ? { id: 'add-to-queue', label: '加入队列', icon: 'iconDownload', submenu: queueActions }
    : null;
    
  console.log('[MenuActions] buildAddToQueueAction 返回值:', result);
  
  return result;
}

/**
 * 构建队列专用动作列表（用于队列 DataSource）
 */
export function buildQueueActions(options: {
  withInsert?: boolean;
  withSort?: boolean;
  withPriority?: boolean;
  withTimeAdjust?: boolean;
}): CardBrowserAction[] {
  const actions: CardBrowserAction[] = [
    BASE_ACTIONS.open,
    BASE_ACTIONS.removeFromQueue,
  ];

  if (options.withInsert) {
    actions.push(BASE_ACTIONS.insertAt);
  }
  if (options.withPriority) {
    actions.push(BASE_ACTIONS.setPriority);
  }
  if (options.withSort) {
    actions.push(BASE_ACTIONS.autoSort);
  }
  if (options.withTimeAdjust) {
    actions.push(BASE_ACTIONS.postpone);
    actions.push(BASE_ACTIONS.advance);
    actions.push(BASE_ACTIONS.spread);
  }

  return actions;
}

// ========== 动作处理器 ==========

/**
 * Queue Trait 访问接口
 */
export type QueueTraitLike = {
  getMutableTrait?: () => any;
  getRemovableTrait?: () => any;
  getPrioritizableTrait?: () => any;
  getAutoSortableTrait?: () => any;
  removeItems?: (items: any[]) => Promise<number> | number;
  insertAt?: (items: any[], index: number) => Promise<void> | void;
  setPriority?: (cardID: string, priority: number) => Promise<boolean> | boolean;
  sort?: () => Promise<void> | void;
};

/**
 * Plugin 接口（用于队列操作）
 */
export type PluginLike = {
  storage?: StorageManager;
  rescheduleService?: RescheduleService;
};

/**
 * 将 BrowserCard 转换为 QueueItem
 */
export function cardsToQueueItems(cards: BrowserCard[]): any[] {
  return cards.map((r) => ({
    cardID: r.fsrsCardId || r.id || r.blockId,
    blockID: r.blockId,
    deckID: r.deckId,
    priority: typeof r.priority === 'number' ? r.priority : 50,
    nextDues: r.nextDues,
    state: r.state,
    lapses: r.lapses,
    reps: r.reps,
    lastReview: r.lastReview,
    meta: r.meta,
  }));
}

/**
 * 从队列移除卡片
 */
export async function removeFromQueue(
  queue: QueueTraitLike | undefined,
  selectedRows: BrowserCard[]
): Promise<number> {
  if (!queue) return 0;

  const items = cardsToQueueItems(selectedRows);

  // 优先使用 Trait 模式
  const trait = queue.getRemovableTrait?.();
  if (trait) {
    const cmd = new RemoveItemsCommand<any>();
    const result = await cmd.execute({ trait, items });
    return result?.removedCount ?? 0;
  }

  // 降级到直接调用
  if (queue.removeItems) {
    return await Promise.resolve(queue.removeItems(items));
  }

  console.warn('[MenuActions] No removeItems method found on queue');
  return 0;
}

/**
 * 插入卡片到指定位置
 */
export async function insertAt(
  queue: QueueTraitLike | undefined,
  selectedRows: BrowserCard[],
  index: number
): Promise<void> {
  if (!queue) return;

  const items = cardsToQueueItems(selectedRows);
  const idx = Math.max(0, Math.floor(index));

  // 优先使用 Trait 模式
  const trait = queue.getMutableTrait?.();
  if (trait) {
    const cmd = new InsertAtCommand<any>();
    await cmd.execute({ trait, items, index: idx });
    return;
  }

  // 降级到直接调用
  if (queue.insertAt) {
    await Promise.resolve(queue.insertAt(items, idx));
  }
}

/**
 * 设置优先级
 */
export async function setPriority(
  queue: QueueTraitLike | undefined,
  selectedRows: BrowserCard[],
  priority: number
): Promise<void> {
  const p = Math.max(0, Math.min(100, Math.floor(priority)));
  const items = cardsToQueueItems(selectedRows);

  // 更新 BrowserCard 中的 priority（用于 UI 刷新）
  for (const r of selectedRows as any[]) {
    r.priority = p;
  }

  if (!queue) return;

  // 优先使用 Trait 模式
  const trait = queue.getPrioritizableTrait?.();
  if (trait) {
    const cmd = new SetPriorityCommand<any>();
    await cmd.execute({ trait, items, priority: p });
    return;
  }

  // 降级到直接调用
  if (queue.setPriority) {
    for (const it of items) {
      const id = String(it?.cardID || '');
      if (!id) continue;
      await Promise.resolve(queue.setPriority(id, p));
    }
  }
}

/**
 * 自动排序
 */
export async function autoSort(queue: QueueTraitLike | undefined): Promise<void> {
  if (!queue) return;

  // 优先使用 Trait 模式
  const trait = queue.getAutoSortableTrait?.();
  if (trait) {
    const cmd = new AutoSortCommand();
    await cmd.execute({ trait });
    return;
  }

  // 降级到直接调用
  if (queue.sort) {
    await Promise.resolve(queue.sort());
  }
}

/**
 * 批量设置优先级（用于 DeckDataSource，直接设置块属性）
 */
export async function batchSetBlockPriority(
  selectedRows: BrowserCard[],
  priority: number
): Promise<void> {
  const p = Math.max(0, Math.min(100, Math.floor(priority)));
  const blockIds = (selectedRows || []).map((r) => r.blockId).filter(Boolean);

  if (blockIds.length === 0) return;

  await batchSetPriority(blockIds, p);

  // 更新 BrowserCard 中的 priority
  for (const r of selectedRows || []) {
    (r as any).priority = p;
  }
}

/**
 * 时间调整（推迟/提前/分散）
 */
export async function adjustTime(
  plugin: PluginLike | undefined,
  selectedRows: BrowserCard[],
  action: 'postpone' | 'advance' | 'spread',
  context?: any
): Promise<any> {
  const rows = (selectedRows || []).map((r) => ({
    blockId: r.blockId,
    cardId: r.id || undefined,
    currentDue: r.due instanceof Date ? r.due : undefined,
  }));

  const service = plugin?.rescheduleService
    ?? (plugin?.storage ? new RescheduleService(plugin.storage) : null);

  if (!service) {
    return null;
  }

  const meta = { source: 'browser' };

  // 解析时间
  const parseTime = (timeStr: string | undefined): Date | null => {
    if (!timeStr) return null;
    if (/^\d{14}$/.test(timeStr)) {
      const y = parseInt(timeStr.slice(0, 4));
      const m = parseInt(timeStr.slice(4, 6)) - 1;
      const d = parseInt(timeStr.slice(6, 8));
      const h = parseInt(timeStr.slice(8, 10));
      const min = parseInt(timeStr.slice(10, 12));
      const s = parseInt(timeStr.slice(12, 14));
      return new Date(Date.UTC(y, m, d, h, min, s));
    }
    const isoParsed = new Date(timeStr);
    if (!Number.isNaN(isoParsed.getTime())) return isoParsed;
    return null;
  };

  // 更新 UI 中的 due 字段
  const updateUIDue = (updated: any[]) => {
    for (const u of updated || []) {
      const d = parseTime(String(u?.newDue || ''));
      const r = (selectedRows || []).find((x) => x.blockId === u?.blockId) as any;
      if (r && d) {
        r.due = d;
        // 需要 import { formatDate } from '../types'
        // r.dueFormatted = formatDate(d);
      }
    }
  };

  let result: any;
  switch (action) {
    case 'postpone':
      const days = Math.max(1, Number(context?.days || 0));
      result = await service.postpone(rows, days, meta);
      updateUIDue(result?.updated);
      break;
    case 'advance':
      const maxDays = Math.max(1, Number(context?.maxDays || 0));
      result = await service.advance(rows, maxDays, meta);
      updateUIDue(result?.updated);
      break;
    case 'spread':
      const spreadDays = Math.max(1, Number(context?.maxDays || context?.days || 0));
      result = await (service as any).spread?.(rows, { maxDays: spreadDays }, meta);
      updateUIDue(result?.updated);
      break;
  }

  return result;
}

/**
 * 加入队列（用于 DeckDataSource）
 */
export async function addToQueue(
  queue: any,
  selectedRows: BrowserCard[],
  queueType: 'retrieval' | 'incremental' | 'final-drill' | 'filter-group' | 'neural-roam'  // ✅ 改名：'deliberate' → 'final-drill'
): Promise<{ added: number; message: string }> {
  console.log('[MenuActions] ========== addToQueue 被调用 ==========');
  console.log('[MenuActions] queueType:', queueType);
  console.log('[MenuActions] selectedRows 数量:', selectedRows?.length);
  console.log('[MenuActions] queue:', queue);
  console.log('[MenuActions] queue 类型:', queue?.constructor?.name);
  
  const items = selectedRows.map((r) => {
    const base = {
      cardID: r.fsrsCardId || r.id || r.blockId,
      blockID: r.blockId,
      deckID: r.deckId,
      priority: typeof r.priority === 'number' ? r.priority : 50,
    };

    // 渐进学习需要特殊处理（保留 cardType 和 meta）
    if (queueType === 'incremental') {
      return {
        ...base,
        cardType: (r as any).cardType,
        meta: {
          'custom-fsrs-type': (r as any).cardType,
          rootId: (r as any).rootId,
          question: (r as any).question,
          answer: (r as any).answer,
        },
      };
    }

    return base;
  });
  
  console.log('[MenuActions] 转换后的 items:', items);

  // 神经漫游：使用 addItems（批量）
  if (queueType === 'neural-roam') {
    console.log('[MenuActions] 处理神经漫游队列');
    if (queue?.addItems) {
      const added = await Promise.resolve(queue.addItems(items));
      return { added, message: `已将卡片设置为神经漫游种子块` };
    }
    return { added: 0, message: '神经漫游队列不可用' };
  }

  // 渐进学习和筛选复习使用 addItems（批量）
  if (queueType === 'incremental' || queueType === 'filter-group') {
    console.log('[MenuActions] 处理渐进学习/筛选复习队列');
    console.log('[MenuActions] queue.addItems 存在:', typeof queue?.addItems === 'function');
    
    if (queue?.addItems) {
      console.log('[MenuActions] ✅ 调用 queue.addItems（批量添加）');
      const added = await Promise.resolve(queue.addItems(items));
      const queueNames = {
        incremental: '渐进学习',
        'filter-group': '筛选复习',
      };
      console.log('[MenuActions] 队列添加完成，共添加:', added);
      return { added, message: `已加入 ${added} 张卡片到${queueNames[queueType]}队列` };
    } else {
      console.error('[MenuActions] ❌ queue.addItems 方法不存在');
      return { added: 0, message: `${queueType === 'incremental' ? '渐进学习' : '筛选复习'}队列不可用` };
    }
  }

  // 刻意练习使用 addItems（批量）
  if (queueType === 'final-drill') {  // ✅ 改名：'deliberate' → 'final-drill'
    console.log('[MenuActions] 处理刻意练习队列');
    console.log('[MenuActions] queue.addItems 存在:', typeof queue?.addItems === 'function');
    
    // 🆕 过滤 Topic 卡片：刻意练习只接受 Item 卡片
    const filteredItems = items.filter((item) => {
      const row = selectedRows.find((r) => (r.fsrsCardId || r.id || r.blockId) === item.cardID);
      const cardType = (row as any)?.cardType;
      
      if (cardType === 'topic') {
        console.log(`[MenuActions] 过滤 Topic 卡片: ${item.blockID}`);
        return false;
      }
      return true;
    });
    
    console.log(`[MenuActions] 过滤后：${filteredItems.length}/${items.length} 张卡片`);
    
    if (filteredItems.length === 0) {
      return { added: 0, message: 'Topic 卡片不能加入刻意练习队列' };
    }
    
    if (queue?.addItems) {
      console.log('[MenuActions] ✅ 调用 queue.addItems（批量添加）');
      const added = await Promise.resolve(queue.addItems(filteredItems));
      console.log('[MenuActions] 刻意练习队列添加完成，共添加:', added);
      const skipped = items.length - filteredItems.length;
      const message = skipped > 0
        ? `已加入 ${added} 张卡片到刻意练习队列（过滤了 ${skipped} 张 Topic 卡片）`
        : `已加入 ${added} 张卡片到刻意练习队列`;
      return { added, message };
    } else {
      console.error('[MenuActions] ❌ queue.addItems 方法不存在');
      return { added: 0, message: '刻意练习队列不可用' };
    }
  }

  // 提取练习使用 addItems（批量）
  if (queueType === 'retrieval') {
    console.log('[MenuActions] 处理提取练习队列');
    
    // 🆕 过滤 Topic 卡片：提取练习只接受 Item 卡片
    const filteredItems = items.filter((item) => {
      const row = selectedRows.find((r) => (r.fsrsCardId || r.id || r.blockId) === item.cardID);
      const cardType = (row as any)?.cardType;
      
      if (cardType === 'topic') {
        console.log(`[MenuActions] 过滤 Topic 卡片: ${item.blockID}`);
        return false;
      }
      return true;
    });
    
    console.log(`[MenuActions] 过滤后：${filteredItems.length}/${items.length} 张卡片`);
    
    if (filteredItems.length === 0) {
      return { added: 0, message: 'Topic 卡片不能加入提取练习队列' };
    }
    
    if (queue?.addItems) {
      const added = await Promise.resolve(queue.addItems(filteredItems));
      const skipped = items.length - filteredItems.length;
      const message = skipped > 0
        ? `已加入 ${added} 张卡片到提取练习队列（过滤了 ${skipped} 张 Topic 卡片）`
        : `已加入 ${added} 张卡片到提取练习队列`;
      return { added, message };
    }
  }

  console.log('[MenuActions] ❌ 没有匹配的队列类型或队列方法不可用');
  return { added: 0, message: '加入队列失败' };
}
