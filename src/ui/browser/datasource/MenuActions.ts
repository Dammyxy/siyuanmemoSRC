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
import { InsertAtCommand, RemoveCommand, SetPriorityCommand, AutoSortCommand } from '@/core/queue/commands';

// ========== 动作定义 ==========

/**
 * 基础动作定义
 */
export const BASE_ACTIONS = {
  open: { id: 'open', label: 'Open', icon: 'iconOpen' } as CardBrowserAction,
  removeFromQueue: {
    id: 'remove-from-current-queue',
    label: '从当前队列移除',
    icon: 'iconMin',
    danger: true,
  } as CardBrowserAction,
  deleteCard: {
    id: 'delete-card',
    label: '取消闪卡',
    icon: 'iconTrashcan',
    danger: true,
  } as CardBrowserAction,
  insertAt: { id: 'insert-at', label: '插入到位置', icon: 'iconAlignLeft' } as CardBrowserAction,
  setPriority: { id: 'set-priority', label: '设置优先级', icon: 'iconMark' } as CardBrowserAction,
  autoSort: { id: 'auto-sort', label: '自动排序', icon: 'iconSort' } as CardBrowserAction,
  postpone: { id: 'postpone', label: '推迟', icon: 'iconCalendar' } as CardBrowserAction,
  advance: { id: 'advance', label: '提前', icon: 'iconCalendar' } as CardBrowserAction,
  // spread 已移至工具栏独立按钮，不再出现在右键菜单
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
  withDelete?: boolean;  // 🆕 是否包含删除操作
}): CardBrowserAction[] {
  const actions: CardBrowserAction[] = [
    BASE_ACTIONS.open,
    BASE_ACTIONS.removeFromQueue,
  ];

  if (options.withDelete) {
    actions.push(BASE_ACTIONS.deleteCard);
  }
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
    // spread 已移至工具栏独立按钮，不再出现在右键菜单
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
  remove?: (items: any[]) => Promise<number> | number;
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
 * 将 BrowserCard 转换为队列项
 */
export function cardsToQueueItems(cards: BrowserCard[]): any[] {
  console.log('[MenuActions] ========== cardsToQueueItems 转换开始 ==========');
  console.log('[MenuActions] 输入 BrowserCard 数量:', cards.length);
  
  const result = cards.map((r, index) => {
    const cardID = r.fsrsCardId || r.id || r.blockId;
    const item = {
      cardID,
      blockID: r.blockId,
      deckID: r.deckId,
      priority: typeof r.priority === 'number' ? r.priority : 50,
      nextDues: r.nextDues,
      state: r.state,
      lapses: r.lapses,
      reps: r.reps,
      lastReview: r.lastReview,
      meta: r.meta,
    };
    
    console.log(`[MenuActions] 转换卡片 ${index + 1}/${cards.length}:`, {
      input: {
        id: r.id,
        fsrsCardId: r.fsrsCardId,
        blockId: r.blockId,
        deckId: r.deckId,
        nextDues: r.nextDues,
        priority: r.priority,
      },
      output: {
        cardID: item.cardID,
        blockID: item.blockID,
        deckID: item.deckID,
        nextDues: item.nextDues,
        priority: item.priority,
      },
      match: cardID === (r.fsrsCardId || r.id || r.blockId),
    });
    
    // 验证转换结果
    if (!item.cardID) {
      console.error(`[MenuActions] ❌ 转换错误：cardID 为空`, { input: r, output: item });
    }
    if (!item.blockID) {
      console.error(`[MenuActions] ❌ 转换错误：blockID 为空`, { input: r, output: item });
    }
    if (item.cardID !== cardID) {
      console.error(`[MenuActions] ❌ 转换错误：cardID 不匹配`, {
        expected: cardID,
        actual: item.cardID,
      });
    }
    
    return item;
  });
  
  console.log('[MenuActions] ========== cardsToQueueItems 转换完成 ==========');
  console.log('[MenuActions] 输出队列项数量:', result.length);
  
  return result;
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
    const cmd = new RemoveCommand<any>();
    const result = await cmd.execute({ trait, items });
    return result?.removedCount ?? 0;
  }

  // 降级到直接调用 remove()
  if (queue.remove) {
    return await Promise.resolve(queue.remove(items));
  }

  // 🆕 降级到逐个调用 removeCard()（用于神经漫游等队列）
  if (queue.removeCard) {
    let removedCount = 0;
    for (const row of selectedRows) {
      try {
        // 优先使用 blockId，因为神经漫游队列使用 blockId 作为种子
        const id = row.blockId || row.fsrsCardId || row.id;
        await queue.removeCard(id);
        removedCount++;
        console.log(`[MenuActions] Removed card ${id} from queue`);
      } catch (error) {
        console.error('[MenuActions] Failed to remove card:', error);
      }
    }
    return removedCount;
  }

  console.warn('[MenuActions] No remove method found on queue');
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
 * 支持普通卡片（块属性）和修缘卡片（FSRSCard.meta）
 */
export async function batchSetBlockPriority(
  selectedRows: BrowserCard[],
  priority: number
): Promise<void> {
  const p = Math.max(0, Math.min(100, Math.floor(priority)));
  const blockIds = (selectedRows || []).map((r) => r.blockId).filter(Boolean);

  if (blockIds.length === 0) return;

  // 设置块属性（普通卡片）
  await batchSetPriority(blockIds, p);

  // TODO: 对于修缘卡片，需要更新 FSRSCard.meta.priority
  // 这需要访问 StorageManager，当前函数没有这个依赖
  // 建议在调用方（DeckDataSource）中处理修缘卡片的优先级更新

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
    cardId: r.fsrsCardId || r.id || undefined,  // 优先使用 fsrsCardId
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
      // 检查是否使用新的配置对象
      if (context?.config) {
        // 🆕 使用新的 postponeWithConfig 方法
        // 先从存储加载完整的 FSRSCard 对象
        const storage = plugin?.storage;
        if (!storage) {
          console.error('[MenuActions] No storage available for postponeWithConfig');
          result = { updated: [], skipped: [] };
          break;
        }
        
        console.log('[MenuActions] Loading FSRS cards for postpone, rows:', rows.length);
        const fsrsCards: any[] = [];
        for (const row of rows) {
          console.log('[MenuActions] Processing row:', { blockId: row.blockId, cardId: row.cardId });
          if (!row.cardId) {
            console.warn('[MenuActions] Row missing cardId, skipping:', row);
            continue;
          }
          const card = storage.getCard(row.cardId);
          console.log('[MenuActions] Got card from storage:', card ? 'found' : 'not found', row.cardId);
          if (card) {
            fsrsCards.push(card);
          } else {
            console.warn('[MenuActions] Card not found:', row.cardId);
          }
        }
        
        console.log('[MenuActions] Loaded FSRS cards:', fsrsCards.length, '/', rows.length);
        
        if (fsrsCards.length === 0) {
          console.warn('[MenuActions] No FSRS cards found for postpone, falling back to old method');
          // 降级到旧方法
          const days = Math.max(1, Number(context?.config?.minInterval || 7));
          result = await service.postpone(rows, days, meta);
          break;
        }
        
        // 调用 postponeWithConfig
        console.log('[MenuActions] Calling postponeWithConfig with config:', context.config);
        const postponeResult = await (service as any).postponeWithConfig?.(
          fsrsCards,
          context.config,
          meta
        );
        
        console.log('[MenuActions] postponeWithConfig result:', postponeResult);
        console.log('[MenuActions] skippedReasons:', postponeResult?.skippedReasons);
        
        // 转换结果格式以兼容旧接口
        result = {
          updated: postponeResult?.updated ? new Array(postponeResult.updated).fill({}) : [],
          skipped: postponeResult?.skipped ? new Array(postponeResult.skipped).fill({}) : []
        };
      } else {
        // 兼容旧的简单参数方式
        const days = Math.max(1, Number(context?.days || 0));
        result = await service.postpone(rows, days, meta);
      }
      updateUIDue(result?.updated);
      break;
    case 'advance':
      // 检查是否使用新的配置对象
      if (context?.config) {
        // 🆕 使用新的 advanceWithConfig 方法
        // 先从存储加载完整的 FSRSCard 对象
        const storage = plugin?.storage;
        if (!storage) {
          console.error('[MenuActions] No storage available for advanceWithConfig');
          result = { updated: [], skipped: [] };
          break;
        }
        
        const fsrsCards: any[] = [];
        for (const row of rows) {
          if (!row.cardId) {
            console.warn('[MenuActions] Row missing cardId for advance, skipping:', row);
            continue;
          }
          const card = storage.getCard(row.cardId);
          if (card) {
            fsrsCards.push(card);
          } else {
            console.warn('[MenuActions] Card not found for advance:', row.cardId);
          }
        }
        
        if (fsrsCards.length === 0) {
          console.warn('[MenuActions] No FSRS cards found for advance');
          result = { updated: [], skipped: rows };
          break;
        }
        
        // 调用 advanceWithConfig
        const advanceResult = await (service as any).advanceWithConfig?.(
          fsrsCards,
          context.config,
          meta
        );
        
        // 转换结果格式以兼容旧接口
        result = {
          updated: advanceResult?.updated ? new Array(advanceResult.updated).fill({}) : [],
          skipped: advanceResult?.skipped ? new Array(advanceResult.skipped).fill({}) : []
        };
      } else {
        // 兼容旧的简单参数方式
        const maxDays = Math.max(1, Number(context?.maxDays || 0));
        result = await service.advance(rows, maxDays, meta);
      }
      updateUIDue(result?.updated);
      break;
    case 'spread':
      // 检查是否使用新的配置对象
      if (context?.config) {
        // 🆕 使用新的 spreadWithConfig 方法
        // 先从存储加载完整的 FSRSCard 对象
        const storage = plugin?.storage;
        if (!storage) {
          console.error('[MenuActions] No storage available for spreadWithConfig');
          result = { updated: 0, skipped: 0, averageCardsPerDay: 0 };
          break;
        }
        
        console.log('[MenuActions] Loading FSRS cards for spread, rows:', rows.length);
        const fsrsCards: any[] = [];
        for (const row of rows) {
          console.log('[MenuActions] Processing row:', { blockId: row.blockId, cardId: row.cardId });
          if (!row.cardId) {
            console.warn('[MenuActions] Row missing cardId, skipping:', row);
            continue;
          }
          const card = storage.getCard(row.cardId);
          console.log('[MenuActions] Got card from storage:', card ? 'found' : 'not found', row.cardId);
          if (card) {
            fsrsCards.push(card);
          } else {
            console.warn('[MenuActions] Card not found:', row.cardId);
          }
        }
        
        console.log('[MenuActions] Loaded FSRS cards:', fsrsCards.length, '/', rows.length);
        
        if (fsrsCards.length === 0) {
          console.warn('[MenuActions] No FSRS cards found for spread');
          result = { updated: 0, skipped: rows.length, averageCardsPerDay: 0 };
          break;
        }
        
        // 调用 spreadWithConfig
        console.log('[MenuActions] Calling spreadWithConfig with config:', context.config);
        const spreadResult = await (service as any).spreadWithConfig?.(
          fsrsCards,
          context.config,
          meta
        );
        
        console.log('[MenuActions] spreadWithConfig result:', spreadResult);
        
        // 转换结果格式以兼容旧接口
        result = {
          updated: spreadResult?.updated ? (Array.isArray(spreadResult.updated) ? spreadResult.updated : new Array(spreadResult.updated).fill({})) : [],
          skipped: spreadResult?.skipped ? (Array.isArray(spreadResult.skipped) ? spreadResult.skipped : new Array(spreadResult.skipped).fill({})) : [],
          averageCardsPerDay: spreadResult?.averageCardsPerDay
        };
      } else {
        // 兼容旧的简单参数方式
        const spreadDays = Math.max(1, Number(context?.maxDays || context?.days || 0));
        result = await (service as any).spread?.(rows, { maxDays: spreadDays }, meta);
      }
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

  // 神经漫游：使用 addCard（逐个添加）
  if (queueType === 'neural-roam') {
    console.log('[MenuActions] 处理神经漫游队列');
    
    // 新架构：使用 addCard 方法（逐个添加）
    if (queue?.addCard) {
      let added = 0;
      for (const item of items) {
        try {
          await queue.addCard(item.blockID, 'manual');
          added++;
        } catch (err) {
          console.error(`[MenuActions] 添加种子块失败: ${item.blockID}`, err);
        }
      }
      return { added, message: `已将 ${added} 张卡片设置为神经漫游种子块` };
    }
    // 旧架构：fallback
    else if (queue?.addItems) {
      const added = await Promise.resolve(queue.addItems(items));
      return { added, message: `已将卡片设置为神经漫游种子块` };
    }
    
    return { added: 0, message: '神经漫游队列不可用' };
  }

  // 渐进学习和筛选复习使用 addCard（逐个添加）
  if (queueType === 'incremental' || queueType === 'filter-group') {
    console.log('[MenuActions] 处理渐进学习/筛选复习队列');
    console.log('[MenuActions] queue.addCard 存在:', typeof queue?.addCard === 'function');
    
    // 新架构：使用 addCard 方法（逐个添加）
    if (queue?.addCard) {
      console.log('[MenuActions] ✅ 调用 queue.addCard（逐个添加）');
      let added = 0;
      for (const item of items) {
        try {
          // 🔧 修复：使用 cardID 而不是 blockID，以支持模板卡（一个块对应多张卡片）
          await queue.addCard(item.cardID, 'manual');
          added++;
        } catch (err) {
          console.error(`[MenuActions] 添加卡片失败: ${item.cardID}`, err);
        }
      }
      const queueNames = {
        incremental: '渐进学习',
        'filter-group': '筛选复习',
      };
      console.log('[MenuActions] 队列添加完成，共添加:', added);
      return { added, message: `已加入 ${added} 张卡片到${queueNames[queueType]}队列` };
    }
    // 旧架构：fallback
    else if (queue?.addItems) {
      console.log('[MenuActions] ✅ 调用 queue.addItems（批量添加）');
      const added = await Promise.resolve(queue.addItems(items));
      const queueNames = {
        incremental: '渐进学习',
        'filter-group': '筛选复习',
      };
      console.log('[MenuActions] 队列添加完成，共添加:', added);
      return { added, message: `已加入 ${added} 张卡片到${queueNames[queueType]}队列` };
    } else {
      console.error('[MenuActions] ❌ queue.addCard 和 queue.addItems 方法都不存在');
      return { added: 0, message: `${queueType === 'incremental' ? '渐进学习' : '筛选复习'}队列不可用` };
    }
  }

  // 刻意练习使用 addCard（单个添加）或 addItems（批量添加，旧架构）
  if (queueType === 'final-drill') {  // ✅ 改名：'deliberate' → 'final-drill'
    console.log('[MenuActions] 处理刻意练习队列');
    console.log('[MenuActions] queue.addCard 存在:', typeof queue?.addCard === 'function');
    console.log('[MenuActions] queue.addItems 存在:', typeof queue?.addItems === 'function');
    
    // 🆕 过滤 Concept 卡片：刻意练习只接受 Item 和 Descriptor 卡片
    const filteredItems = items.filter((item) => {
      const row = selectedRows.find((r) => (r.fsrsCardId || r.id || r.blockId) === item.cardID);
      const cardType = (row as any)?.cardType;
      
      // 🔧 修复：过滤 Concept 卡片（不是 Topic）
      if (cardType === 'concept') {
        console.log(`[MenuActions] 过滤 Concept 卡片: ${item.blockID}`);
        return false;
      }
      return true;
    });
    
    console.log(`[MenuActions] 过滤后：${filteredItems.length}/${items.length} 张卡片`);
    
    if (filteredItems.length === 0) {
      return { added: 0, message: 'Concept 卡片不能加入刻意练习队列' };
    }
    
    // ✅ 新架构：使用 addCard 方法（单个添加）
    if (queue?.addCard) {
      console.log('[MenuActions] ✅ 使用新架构 queue.addCard（逐个添加）');
      let added = 0;
      for (const item of filteredItems) {
        try {
          // 🔧 修复：使用 cardID 而不是 blockID，以支持模板卡（一个块对应多张卡片）
          await queue.addCard(item.cardID, 'manual');
          added++;
        } catch (err) {
          console.error(`[MenuActions] 添加卡片失败: ${item.cardID}`, err);
        }
      }
      console.log('[MenuActions] 刻意练习队列添加完成，共添加:', added);
      const skipped = items.length - filteredItems.length;
      const message = skipped > 0
        ? `已加入 ${added} 张卡片到刻意练习队列（过滤了 ${skipped} 张 Concept 卡片）`
        : `已加入 ${added} 张卡片到刻意练习队列`;
      return { added, message };
    }
    // ✅ 旧架构：使用 addItems 方法（批量添加）
    else if (queue?.addItems) {
      console.log('[MenuActions] ✅ 使用旧架构 queue.addItems（批量添加）');
      const added = await Promise.resolve(queue.addItems(filteredItems));
      console.log('[MenuActions] 刻意练习队列添加完成，共添加:', added);
      const skipped = items.length - filteredItems.length;
      const message = skipped > 0
        ? `已加入 ${added} 张卡片到刻意练习队列（过滤了 ${skipped} 张 Concept 卡片）`
        : `已加入 ${added} 张卡片到刻意练习队列`;
      return { added, message };
    } else {
      console.error('[MenuActions] ❌ queue.addCard 和 queue.addItems 方法都不存在');
      return { added: 0, message: '刻意练习队列不可用' };
    }
  }

  // 提取练习使用 addItems（批量）
  if (queueType === 'retrieval') {
    console.log('[MenuActions] ========== 处理提取练习队列 ==========');
    console.log('[MenuActions] 原始 selectedRows 完整对象:', selectedRows.map(r => {
      // 打印完整对象以便调试
      const fullObj = { ...r };
      console.log('[MenuActions] 单个 BrowserCard 完整数据:', fullObj);
      return {
        id: r.id,
        fsrsCardId: r.fsrsCardId,
        blockId: r.blockId,
        deckId: r.deckId,
        cardType: (r as any).cardType,
        nextDues: r.nextDues,
        priority: r.priority,
        // 打印所有字段
        allKeys: Object.keys(r),
      };
    }));
    console.log('[MenuActions] 转换后的 items（过滤前）:', items.map(item => ({
      cardID: item.cardID,
      blockID: item.blockID,
      deckID: item.deckID,
      nextDues: item.nextDues,
      priority: item.priority,
    })));
    
    // 🆕 过滤 Concept 卡片：提取练习只接受 Item 和 Descriptor 卡片
    const filteredItems = items.filter((item) => {
      const row = selectedRows.find((r) => (r.fsrsCardId || r.id || r.blockId) === item.cardID);
      const cardType = (row as any)?.cardType;
      
      // 🔧 修复：过滤 Concept 卡片（不是 Topic）
      if (cardType === 'concept') {
        console.log(`[MenuActions] 过滤 Concept 卡片: ${item.blockID}`);
        return false;
      }
      return true;
    });
    
    // 🆕 为手动添加的卡片添加 manuallyAdded 标记
    // 这样 getAll() 时不会被过滤，无论 nextDues 是什么
    const itemsWithManualFlag = filteredItems.map(item => ({
      ...item,
      manuallyAdded: true,  // 🆕 标记为手动添加
    }));
    
    console.log(`[MenuActions] 过滤后：${itemsWithManualFlag.length}/${items.length} 张卡片`);
    console.log('[MenuActions] 最终传递给 queue.addItems 的数据:');
    itemsWithManualFlag.forEach((item, index) => {
      console.log(`[MenuActions]   卡片 ${index + 1}:`, {
        cardID: item.cardID,
        blockID: item.blockID,
        deckID: item.deckID,
        manuallyAdded: item.manuallyAdded,
        priority: item.priority,
      });
    });
    
    if (itemsWithManualFlag.length === 0) {
      console.log('[MenuActions] ❌ 没有有效卡片，返回失败');
      return { added: 0, message: 'Concept 卡片不能加入提取练习队列' };
    }
    
    // 新架构：使用 addCard 方法（逐个添加）
    if (queue?.addCard) {
      console.log('[MenuActions] ✅ 调用 queue.addCard（逐个添加），参数数量:', itemsWithManualFlag.length);
      let added = 0;
      for (const item of itemsWithManualFlag) {
        try {
          // 🔧 修复：使用 cardID 而不是 blockID（支持 Xiuyuan 卡片）
          await queue.addCard(item.cardID, 'manual');
          added++;
        } catch (err) {
          console.error(`[MenuActions] 添加卡片失败: ${item.cardID}`, err);
        }
      }
      console.log('[MenuActions] ✅ queue.addCard 完成，共添加:', added);
      const skipped = items.length - itemsWithManualFlag.length;
      const message = skipped > 0
        ? `已加入 ${added} 张卡片到提取练习队列（过滤了 ${skipped} 张 Concept 卡片）`
        : `已加入 ${added} 张卡片到提取练习队列`;
      return { added, message };
    }
    // 旧架构：fallback
    else if (queue?.addItems) {
      console.log('[MenuActions] ✅ 调用 queue.addItems，参数数量:', itemsWithManualFlag.length);
      const added = await Promise.resolve(queue.addItems(itemsWithManualFlag));
      console.log('[MenuActions] ✅ queue.addItems 返回结果:', added);
      const skipped = items.length - itemsWithManualFlag.length;
      const message = skipped > 0
        ? `已加入 ${added} 张卡片到提取练习队列（过滤了 ${skipped} 张 Concept 卡片）`
        : `已加入 ${added} 张卡片到提取练习队列`;
      console.log('[MenuActions] ========== 处理完成，返回消息 ==========');
      return { added, message };
    } else {
      console.error('[MenuActions] ❌ queue.addItems 方法不存在');
      return { added: 0, message: '提取练习队列不可用' };
    }
  }

  console.log('[MenuActions] ❌ 没有匹配的队列类型或队列方法不可用');
  return { added: 0, message: '加入队列失败' };
}
