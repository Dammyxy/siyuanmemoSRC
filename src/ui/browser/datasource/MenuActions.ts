/**
 * Queue Menu Actions - Shared Menu Definitions and Handlers
 *
 * 统一管理所有队列 DataSource 的右键菜单动作
 * 通过复用代码减少重复，同时保持灵活性
 */

import type { CardBrowserAction } from './types';
import type { BrowserCard } from '../../browser/types';
import { batchSetPriority } from '../../browser/browserService';
import type { RescheduleService } from '@/core/scheduler/rescheduleService';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import type { CardReadPort } from '@/core/storage/ports';
import { InsertAtCommand, RemoveCommand, SetPriorityCommand, AutoSortCommand } from '@/core/queue/commands';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MenuActions');

// ========== 动作定义 ==========

/**
 * 基础动作定义
 * @param t - i18n 翻译函数
 */
export function getBaseActions(t?: (key: string, fallback: string) => string) {
  const translate = t || ((key: string, fallback: string) => fallback);
  
  return {
    open: { id: 'open', label: translate('openInTab', 'Open'), icon: 'iconOpen' } as CardBrowserAction,
    removeFromQueue: {
      id: 'remove-from-current-queue',
      label: translate('removeFromQueue', '从当前队列移除'),
      icon: 'iconMin',
      danger: true,
    } as CardBrowserAction,
    deleteCard: {
      id: 'delete-card',
      label: translate('deleteCard', '取消闪卡'),
      icon: 'iconTrashcan',
      danger: true,
    } as CardBrowserAction,
    insertAt: { id: 'insert-at', label: translate('insertAt', '插入到位置'), icon: 'iconAlignLeft' } as CardBrowserAction,
    setPriority: { id: 'set-priority', label: translate('setPriority', '设置优先级'), icon: 'iconMark' } as CardBrowserAction,
    autoSort: { id: 'auto-sort', label: translate('autoSortQueue', '自动排序'), icon: 'iconSort' } as CardBrowserAction,
    postpone: { id: 'postpone', label: translate('postpone', '推迟'), icon: 'iconCalendar' } as CardBrowserAction,
    advance: { id: 'advance', label: translate('advance', '提前'), icon: 'iconCalendar' } as CardBrowserAction,
    spread: { id: 'spread', label: translate('spread', '平摊复习'), icon: 'iconCalendar' } as CardBrowserAction,
    reset: { id: 'reset', label: translate('reset', '重置'), icon: 'iconRefresh', danger: true } as CardBrowserAction,
    suspend: { id: 'suspend', label: translate('suspend', '暂停'), icon: 'iconPause' } as CardBrowserAction,
  };
}

/**
 * 向后兼容：保留旧的 BASE_ACTIONS 常量
 */
export const BASE_ACTIONS = getBaseActions();

/**
 * 构建"加入队列"子菜单
 * @param hasQueues - 可用队列配置
 * @param t - i18n 翻译函数
 */
export function buildAddToQueueAction(
  hasQueues: {
    retrieval?: boolean;
    incremental?: boolean;
    finalDrill?: boolean;
    filterGroup?: boolean;
    neuralRoam?: boolean;
  },
  t?: (key: string, fallback: string) => string
): CardBrowserAction | null {
  const translate = t || ((key: string, fallback: string) => fallback);
  
  logger.debug('[MenuActions] buildAddToQueueAction 被调用，参数:', hasQueues);
  
  const queueActions: CardBrowserAction[] = [];

  if (hasQueues.retrieval) {
    logger.debug('[MenuActions] ✅ 添加提取练习');
    queueActions.push({
      id: 'add-to-retrieval-queue',
      label: translate('addToRetrievalQueue', '提取练习'),
      icon: 'iconList',
    });
  }
  if (hasQueues.incremental) {
    logger.debug('[MenuActions] ✅ 添加渐进学习');
    queueActions.push({
      id: 'add-to-incremental-queue',
      label: translate('addToIncrementalQueue', '渐进学习'),
      icon: 'iconBook',
    });
  }
  if (hasQueues.finalDrill) {
    logger.debug('[MenuActions] ✅ 添加刻意练习');
    queueActions.push({
      id: 'add-to-final-drill-queue',
      label: translate('addToFinalDrillQueue', '刻意练习'),
      icon: 'iconCards',
    });
  } else {
    logger.debug('[MenuActions] ❌ 没有添加刻意练习（hasQueues.finalDrill =', hasQueues.finalDrill, ')');
  }
  if (hasQueues.filterGroup) {
    logger.debug('[MenuActions] ✅ 添加筛选复习');
    queueActions.push({
      id: 'add-to-filter-group-queue',
      label: translate('addToFilterGroupQueue', '筛选复习'),
      icon: 'iconFilter',
    });
  }
  if (hasQueues.neuralRoam) {
    logger.debug('[MenuActions] ✅ 添加神经漫游');
    queueActions.push({
      id: 'add-to-neural-roam-queue',
      label: translate('addToNeuralRoamQueue', '神经漫游'),
      icon: 'iconGraph',
    });
  }

  logger.debug('[MenuActions] queueActions 数组:', queueActions);
  logger.debug('[MenuActions] queueActions.length:', queueActions.length);

  const result = queueActions.length > 0
    ? { 
        id: 'add-to-queue', 
        label: translate('addToQueueMenu', '加入队列'), 
        icon: 'iconDownload', 
        submenu: queueActions 
      }
    : null;
    
  logger.debug('[MenuActions] buildAddToQueueAction 返回值:', result);
  
  return result;
}

/**
 * 构建队列专用动作列表（用于队列 DataSource）
 * @param options - 动作选项
 * @param t - i18n 翻译函数
 */
export function buildQueueActions(
  options: {
    withInsert?: boolean;
    withSort?: boolean;
    withPriority?: boolean;
    withTimeAdjust?: boolean;
    withDelete?: boolean;
  },
  t?: (key: string, fallback: string) => string
): CardBrowserAction[] {
  const BASE = getBaseActions(t);
  
  const actions: CardBrowserAction[] = [
    BASE.open,
    BASE.removeFromQueue,
  ];

  if (options.withDelete) {
    actions.push(BASE.deleteCard);
  }
  // 🆕 隐藏"插入到位置"功能
  // if (options.withInsert) {
  //   actions.push(BASE.insertAt);
  // }
  if (options.withPriority) {
    actions.push(BASE.setPriority);
  }
  // 🆕 移除"自动排序"功能（已有顶部的排序菜单）
  // if (options.withSort) {
  //   actions.push(BASE.autoSort);
  // }
  if (options.withTimeAdjust) {
    actions.push(BASE.postpone);
    actions.push(BASE.advance);
    // spread 已移至工具栏独立按钮，不再出现在右键菜单
  }

  return actions;
}

// ========== 动作处理器 ==========

type QueueActionType = 'retrieval' | 'incremental' | 'final-drill' | 'filter-group' | 'neural-roam';
type RescheduleAction = 'postpone' | 'advance' | 'spread';

type BrowserCardExtraFields = BrowserCard & {
  nextDues?: unknown;
  question?: string;
  answer?: string;
};

type QueueItemPayload = {
  cardID: string;
  blockID: string;
  deckID: string;
  priority: number;
  nextDues?: unknown;
  state?: BrowserCard['state'];
  lapses?: number;
  reps?: number;
  lastReview?: BrowserCard['lastReview'];
  meta?: BrowserCard['meta'];
  cardType?: BrowserCard['cardType'];
  manuallyAdded?: boolean;
};

type QueueAddLike = {
  addCard?: (cardIdOrBlockId: string, source?: 'manual' | 'auto-failed') => Promise<void> | void;
  addItems?: (items: QueueItemPayload[]) => Promise<number> | number;
  removeCard?: (cardIdOrBlockId: string) => Promise<void> | void;
};

type UnifiedStorageLike = CardReadPort & {
  loadData?: (key: string) => Promise<unknown>;
  saveData?: (key: string, value: unknown) => Promise<void>;
};

type RescheduleResultLike = {
  updated?: unknown;
  skipped?: unknown;
  averageCardsPerDay?: number;
};

type RescheduleServiceLike = Pick<
  RescheduleService,
  'postponeWithConfig' | 'advanceWithConfig' | 'spreadWithConfig'
>;

type PluginContextLike = {
  getRescheduleService?: () => RescheduleServiceLike | undefined;
  getUnifiedStorage?: () => UnifiedStorageLike | undefined;
};

/**
 * Queue Trait 访问接口
 */
export type QueueTraitLike = QueueAddLike & {
  getMutableTrait?: () => unknown;
  getRemovableTrait?: () => unknown;
  getPrioritizableTrait?: () => unknown;
  getAutoSortableTrait?: () => unknown;
  remove?: (items: QueueItemPayload[]) => Promise<number> | number;
  insertAt?: (items: QueueItemPayload[], index: number) => Promise<void> | void;
  setPriority?: (cardID: string, priority: number) => Promise<boolean> | boolean;
  sort?: () => Promise<void> | void;
};

/**
 * Plugin 接口（用于队列操作）
 */
export type PluginLike = {
  storage?: CardReadPort;
  rescheduleService?: RescheduleServiceLike;
  context?: PluginContextLike;
  getContext?: () => PluginContextLike | undefined;
};

const queueDisplayName: Record<Exclude<QueueActionType, 'retrieval' | 'neural-roam'>, string> = {
  incremental: '渐进学习',
  'final-drill': '刻意练习',
  'filter-group': '筛选复习',
};

const queueUnavailableMessage: Record<QueueActionType, string> = {
  retrieval: '提取练习队列不可用',
  incremental: '渐进学习队列不可用',
  'final-drill': '刻意练习队列不可用',
  'filter-group': '筛选复习队列不可用',
  'neural-roam': '神经漫游队列不可用',
};

const conceptOnlyMessage: Record<'retrieval' | 'final-drill' | 'neural-roam', string> = {
  retrieval: 'Concept 卡片不能加入提取练习队列',
  'final-drill': 'Concept 卡片不能加入刻意练习队列',
  'neural-roam': '神经漫游队列只接受 Concept 卡片',
};

function resolveCardId(card: BrowserCard): string {
  return card.fsrsCardId || card.id || card.blockId;
}

function normalizeCount(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  return Math.max(0, fallback);
}

function parseSiyuanTime14(timeStr: string | undefined): Date | null {
  if (!timeStr) return null;
  if (/^\d{14}$/.test(timeStr)) {
    const y = Number.parseInt(timeStr.slice(0, 4), 10);
    const m = Number.parseInt(timeStr.slice(4, 6), 10) - 1;
    const d = Number.parseInt(timeStr.slice(6, 8), 10);
    const h = Number.parseInt(timeStr.slice(8, 10), 10);
    const min = Number.parseInt(timeStr.slice(10, 12), 10);
    const s = Number.parseInt(timeStr.slice(12, 14), 10);
    return new Date(Date.UTC(y, m, d, h, min, s));
  }

  const isoParsed = new Date(timeStr);
  if (!Number.isNaN(isoParsed.getTime())) {
    return isoParsed;
  }
  return null;
}

function resolvePluginContext(plugin: PluginLike | undefined): PluginContextLike | undefined {
  if (!plugin) {
    return undefined;
  }
  return plugin.context ?? plugin.getContext?.();
}

function resolveRescheduleService(plugin: PluginLike | undefined): RescheduleServiceLike | undefined {
  if (plugin?.rescheduleService) {
    return plugin.rescheduleService;
  }

  const context = resolvePluginContext(plugin);
  if (!context?.getRescheduleService) {
    return undefined;
  }

  try {
    return context.getRescheduleService();
  } catch (error) {
    logger.warn('Failed to get RescheduleService from context:', error);
    return undefined;
  }
}

function resolveUnifiedStorage(plugin: PluginLike | undefined): UnifiedStorageLike | undefined {
  const context = resolvePluginContext(plugin);
  return context?.getUnifiedStorage?.();
}

/**
 * 将 BrowserCard 转换为队列项
 */
export function cardsToQueueItems(cards: BrowserCard[]): QueueItemPayload[] {
  logger.debug('[MenuActions] ========== cardsToQueueItems 转换开始 ==========');
  logger.debug('[MenuActions] 输入 BrowserCard 数量:', cards.length);
  
  const result = cards.map((rawCard, index) => {
    const card = rawCard as BrowserCardExtraFields;
    const cardID = resolveCardId(card);
    const item = {
      cardID,
      blockID: card.blockId,
      deckID: card.deckId,
      priority: typeof card.priority === 'number' ? card.priority : 50,
      nextDues: card.nextDues,
      state: card.state,
      lapses: card.lapses,
      reps: card.reps,
      lastReview: card.lastReview,
      meta: card.meta,
    };
    
    logger.debug(`[MenuActions] 转换卡片 ${index + 1}/${cards.length}:`, {
      input: {
        id: card.id,
        fsrsCardId: card.fsrsCardId,
        blockId: card.blockId,
        deckId: card.deckId,
        nextDues: card.nextDues,
        priority: card.priority,
      },
      output: {
        cardID: item.cardID,
        blockID: item.blockID,
        deckID: item.deckID,
        nextDues: item.nextDues,
        priority: item.priority,
      },
      match: cardID === resolveCardId(card),
    });
    
    // 验证转换结果
    if (!item.cardID) {
      logger.error(`[MenuActions] ❌ 转换错误：cardID 为空`, { input: card, output: item });
    }
    if (!item.blockID) {
      logger.error(`[MenuActions] ❌ 转换错误：blockID 为空`, { input: card, output: item });
    }
    if (item.cardID !== cardID) {
      logger.error(`[MenuActions] ❌ 转换错误：cardID 不匹配`, {
        expected: cardID,
        actual: item.cardID,
      });
    }
    
    return item;
  });
  
  logger.debug('[MenuActions] ========== cardsToQueueItems 转换完成 ==========');
  logger.debug('[MenuActions] 输出队列项数量:', result.length);
  
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
        logger.debug(`[MenuActions] Removed card ${id} from queue`);
      } catch (error) {
        logger.error('[MenuActions] Failed to remove card:', error);
      }
    }
    return removedCount;
  }

  logger.warn('[MenuActions] No remove method found on queue');
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
  for (const r of selectedRows) {
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
 * 
 * @deprecated 此函数依赖有问题的 batchSetPriority，应该直接使用 UnifiedDataSourceManager
 * @see DeckDataSource.executeAction 中的 set-priority 实现（正确的模式）
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
    r.priority = p;
  }
}

/**
 * 时间调整（推迟/提前/分散）
 */
function collectRescheduleCards(
  storage: UnifiedStorageLike | undefined,
  selectedRows: Array<{ blockId: string; cardId?: string }>,
  action: RescheduleAction
): unknown[] {
  if (!storage) {
    logger.error(`No UnifiedStorageManager available for ${action}WithConfig`);
    return [];
  }

  const cards: unknown[] = [];
  for (const row of selectedRows) {
    if (!row.cardId) {
      logger.warn(`[${action}] Row missing cardId, skipping`, row);
      continue;
    }

    const card = storage.getCard(row.cardId);
    if (!card) {
      logger.warn(`[${action}] Card not found in storage: ${row.cardId}`);
      continue;
    }

    cards.push(card);
  }

  return cards;
}

function buildLegacyConfig(
  action: RescheduleAction,
  configManager: ConfigManager | null,
  context: Record<string, unknown> | undefined
): unknown | null {
  if (!configManager) {
    logger.error(`ConfigManager unavailable for ${action}`);
    return null;
  }

  if (action === 'postpone') {
    const days = Math.max(1, Number(context?.days || 0));
    const config = configManager.getDefaultPostponeConfig();
    config.delayFactor = 1;
    config.minInterval = days;
    config.maxInterval = days;
    return config;
  }

  if (action === 'advance') {
    const maxDays = Math.max(1, Number(context?.maxDays || 0));
    const config = configManager.getDefaultAdvanceConfig();
    config.maxDays = maxDays;
    return config;
  }

  const spreadDays = Math.max(1, Number(context?.maxDays || context?.days || 0));
  const config = configManager.getDefaultSpreadConfig();
  config.collectingPeriod = spreadDays;
  config.reschedulingPeriod = spreadDays;
  config.considerFutureRepetitions = false;
  return config;
}

function updateDueInMemory(selectedRows: BrowserCard[], updated: unknown): void {
  if (!Array.isArray(updated)) {
    return;
  }

  const rowByBlockId = new Map(selectedRows.map((row) => [row.blockId, row]));
  for (const item of updated as Array<{ blockId?: string; newDue?: string }>) {
    const blockId = item?.blockId;
    if (!blockId) {
      continue;
    }

    const due = parseSiyuanTime14(item?.newDue);
    if (!due) {
      continue;
    }

    const row = rowByBlockId.get(blockId);
    if (row) {
      row.due = due;
    }
  }
}

function buildEmptyAdjustResult(action: RescheduleAction, rowCount: number): {
  updated: number;
  skipped: number;
  averageCardsPerDay?: number;
} {
  if (action === 'spread') {
    return { updated: 0, skipped: rowCount, averageCardsPerDay: 0 };
  }
  return { updated: 0, skipped: rowCount };
}

async function executeReschedule(
  service: RescheduleServiceLike,
  action: RescheduleAction,
  cards: unknown[],
  config: unknown,
  meta: { source: string }
): Promise<RescheduleResultLike | undefined> {
  switch (action) {
    case 'postpone':
      return service.postponeWithConfig(cards as never, config as never, meta as never) as unknown as
        | RescheduleResultLike
        | undefined;
    case 'advance':
      return service.advanceWithConfig(cards as never, config as never, meta as never) as unknown as
        | RescheduleResultLike
        | undefined;
    case 'spread':
      return service.spreadWithConfig(cards as never, config as never, meta as never) as unknown as
        | RescheduleResultLike
        | undefined;
    default:
      return undefined;
  }
}

export async function adjustTime(
  plugin: PluginLike | undefined,
  selectedRows: BrowserCard[],
  action: RescheduleAction,
  context?: Record<string, unknown>
): Promise<{ updated: number; skipped: number; averageCardsPerDay?: number } | null> {
  const rows = (selectedRows || []).map((r) => ({
    blockId: r.blockId,
    cardId: resolveCardId(r) || undefined,
  }));

  const service = resolveRescheduleService(plugin);

  if (!service) {
    logger.error('RescheduleService not available');
    return null;
  }

  const storage = resolveUnifiedStorage(plugin);
  const configManager = storage ? new ConfigManager(storage) : null;
  const config = context?.config ?? buildLegacyConfig(action, configManager, context);
  if (!config) {
    return buildEmptyAdjustResult(action, rows.length);
  }

  const cards = collectRescheduleCards(storage, rows, action);
  if (cards.length === 0) {
    return buildEmptyAdjustResult(action, rows.length);
  }

  const rawResult = await executeReschedule(service, action, cards, config, { source: 'browser' });
  if (!rawResult) {
    return buildEmptyAdjustResult(action, rows.length);
  }

  updateDueInMemory(selectedRows, rawResult.updated);

  const updated = normalizeCount(rawResult.updated);
  if (action === 'postpone') {
    return {
      updated,
      skipped: normalizeCount(rawResult.skipped),
    };
  }

  const skipped = Math.max(0, rows.length - updated);
  if (action === 'spread') {
    const averageCardsPerDay =
      typeof rawResult.averageCardsPerDay === 'number' && Number.isFinite(rawResult.averageCardsPerDay)
        ? rawResult.averageCardsPerDay
        : 0;
    return { updated, skipped, averageCardsPerDay };
  }

  return { updated, skipped };
}

/**
 * 加入队列（用于 DeckDataSource）
 */
async function addItemsWithFallback(
  queue: QueueAddLike | undefined,
  items: QueueItemPayload[],
  getAddTargetId: (item: QueueItemPayload) => string
): Promise<{ added: number; failed: number; unavailable: boolean; firstError?: string }> {
  if (!queue) {
    return { added: 0, failed: items.length, unavailable: true };
  }

  if (typeof queue.addCard === 'function') {
    let added = 0;
    let failed = 0;
    let firstError: string | undefined;

    for (const item of items) {
      const targetId = getAddTargetId(item);
      try {
        await Promise.resolve(queue.addCard(targetId, 'manual'));
        added++;
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        firstError = firstError ?? message;
        logger.error(`[MenuActions] Failed to add card ${targetId}`, error);
      }
    }

    return { added, failed, unavailable: false, firstError };
  }

  if (typeof queue.addItems === 'function') {
    const rawAdded = await Promise.resolve(queue.addItems(items));
    const added = normalizeCount(rawAdded, items.length);
    const failed = Math.max(0, items.length - added);
    return { added, failed, unavailable: false };
  }

  return { added: 0, failed: items.length, unavailable: true };
}

function prepareQueueItems(
  selectedRows: BrowserCard[],
  queueType: QueueActionType
): QueueItemPayload[] {
  return selectedRows.map((rawCard) => {
    const card = rawCard as BrowserCardExtraFields;
    const item: QueueItemPayload = {
      cardID: resolveCardId(card),
      blockID: card.blockId,
      deckID: card.deckId,
      priority: typeof card.priority === 'number' ? card.priority : 50,
      nextDues: card.nextDues,
      state: card.state,
      lapses: card.lapses,
      reps: card.reps,
      lastReview: card.lastReview,
      meta: card.meta,
    };

    if (queueType === 'incremental') {
      item.cardType = card.cardType;
      item.meta = {
        ...(card.meta as Record<string, unknown> | undefined),
        'custom-fsrs-type': card.cardType,
        rootId: card.rootId,
        question: card.question,
        answer: card.answer,
      };
    }

    return item;
  });
}

function filterQueueItems(
  queueType: QueueActionType,
  items: QueueItemPayload[],
  selectedRows: BrowserCard[]
): { items: QueueItemPayload[]; skippedConceptCount: number } {
  const cardTypeByCardId = new Map<string, BrowserCard['cardType']>();
  for (const row of selectedRows) {
    cardTypeByCardId.set(resolveCardId(row), row.cardType);
  }

  let filteredItems = items;
  if (queueType === 'neural-roam') {
    filteredItems = items.filter((item) => cardTypeByCardId.get(item.cardID) === 'concept');
  } else if (queueType === 'retrieval' || queueType === 'final-drill') {
    filteredItems = items.filter((item) => cardTypeByCardId.get(item.cardID) !== 'concept');
  }

  if (queueType === 'retrieval') {
    filteredItems = filteredItems.map((item) => ({ ...item, manuallyAdded: true }));
  }

  return {
    items: filteredItems,
    skippedConceptCount: Math.max(0, items.length - filteredItems.length),
  };
}

export async function addToQueue(
  queue: QueueAddLike | undefined,
  selectedRows: BrowserCard[],
  queueType: QueueActionType
): Promise<{ added: number; message: string }> {
  logger.debug('[MenuActions] addToQueue called', {
    queueType,
    selectedCount: selectedRows?.length ?? 0,
  });

  const items = prepareQueueItems(selectedRows, queueType);
  const filtered = filterQueueItems(queueType, items, selectedRows);

  if (filtered.items.length === 0) {
    if (queueType === 'retrieval' || queueType === 'final-drill' || queueType === 'neural-roam') {
      return { added: 0, message: conceptOnlyMessage[queueType] };
    }
    return { added: 0, message: '没有有效的卡片可添加' };
  }

  const addResult = await addItemsWithFallback(
    queue,
    filtered.items,
    queueType === 'neural-roam' ? (item) => item.blockID : (item) => item.cardID
  );

  if (addResult.unavailable) {
    logger.warn(`[MenuActions] queue unavailable for ${queueType}`);
    return { added: 0, message: queueUnavailableMessage[queueType] };
  }

  if (queueType === 'neural-roam') {
    if (addResult.added <= 0) {
      if (addResult.firstError) {
        return { added: 0, message: `添加失败：${addResult.firstError}` };
      }
      return { added: 0, message: '没有有效的卡片可添加' };
    }

    let message = `已将 ${addResult.added} 张卡片设置为神经漫游种子块`;
    if (filtered.skippedConceptCount > 0) {
      message += `（过滤了 ${filtered.skippedConceptCount} 张非 Concept 卡片）`;
    }
    if (addResult.failed > 0) {
      message += `，${addResult.failed} 张添加失败`;
    }
    return { added: addResult.added, message };
  }

  if (queueType === 'retrieval' || queueType === 'final-drill') {
    const queueName = queueType === 'retrieval' ? '提取练习' : queueDisplayName['final-drill'];
    let message = `已加入 ${addResult.added} 张卡片到${queueName}队列`;
    if (filtered.skippedConceptCount > 0) {
      message += `（过滤了 ${filtered.skippedConceptCount} 张 Concept 卡片）`;
    }
    return { added: addResult.added, message };
  }

  const queueName = queueDisplayName[queueType];
  return {
    added: addResult.added,
    message: `已加入 ${addResult.added} 张卡片到${queueName}队列`,
  };
}
