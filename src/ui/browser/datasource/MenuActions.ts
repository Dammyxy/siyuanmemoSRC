/**
 * Queue Menu Actions - Shared Menu Definitions and Handlers
 *
 * 统一管理所有队列 DataSource 的右键菜单动作
 * 通过复用代码减少重复，同时保持灵活性
 */

import type { BrowserActionTarget, CardBrowserAction } from './types';
import type { BrowserCard } from '../../browser/types';
import type { RescheduleService } from '@/core/scheduler/rescheduleService';
import { ConfigManager } from '@/core/scheduler/ConfigManager';
import type { RescheduleStoragePort } from '@/core/scheduler/ports';
import type { CardReadPort } from '@/core/storage/ports';
import {
  QueueType,
  type QueueAddSource,
  type QueueBulkMutationResult,
} from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';
import { resolveBrowserCardActionId } from '../utils/browserCardIdentity';
import {
  PRIORITY_DECREASE_ACTION_ID,
  PRIORITY_INCREASE_ACTION_ID,
} from '../browserActionFeedback';

const logger = createLogger('MenuActions');

// ========== 动作定义 ==========

/**
 * 基础动作定义
 * @param t - i18n 翻译函数
 */
export function getBaseActions(t?: (key: string, fallback: string) => string) {
  const translate = t || ((_key: string, fallback: string) => fallback);
  
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
    priorityPlus10: { id: PRIORITY_INCREASE_ACTION_ID, label: translate('priorityPlus10', '优先级 +10'), icon: 'iconUp' } as CardBrowserAction,
    priorityMinus10: { id: PRIORITY_DECREASE_ACTION_ID, label: translate('priorityMinus10', '优先级 -10'), icon: 'iconDown' } as CardBrowserAction,
    autoSort: { id: 'auto-sort', label: translate('autoSortQueue', '自动排序'), icon: 'iconSort' } as CardBrowserAction,
    postpone: { id: 'postpone', label: translate('postpone', '推迟'), icon: 'iconCalendar' } as CardBrowserAction,
    advance: { id: 'advance', label: translate('advance', '提前'), icon: 'iconCalendar' } as CardBrowserAction,
    spread: { id: 'spread', label: translate('spread', '平摊复习'), icon: 'iconCalendar' } as CardBrowserAction,
    reset: { id: 'reset', label: translate('reset', '重置'), icon: 'iconRefresh', danger: true } as CardBrowserAction,
    suspend: { id: 'suspend', label: translate('suspend', 'Suspend'), icon: 'iconPause' } as CardBrowserAction,
    unsuspend: { id: 'unsuspend', label: translate('restore', 'Restore'), icon: 'iconPlay' } as CardBrowserAction,
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
  const translate = t || ((_key: string, fallback: string) => fallback);
  
  logger.debug('[MenuActions] buildAddToQueueAction 被调用，参数:', hasQueues);
  
  const queueActions: CardBrowserAction[] = [];

  if (hasQueues.retrieval) {
    logger.debug('[MenuActions] ✅ 添加提取练习');
    queueActions.push({
      id: 'add-to-retrieval-queue',
      label: translate('addToRetrievalQueue', '提取练习'),
      icon: 'iconList',
    });
    queueActions.push({
      id: 'add-to-retrieval-queue-all',
      label: translate('addToRetrievalQueueAll', '提取练习（含今日已复习）'),
      icon: 'iconAdd',
    });
  }
  if (hasQueues.incremental) {
    logger.debug('[MenuActions] ✅ 添加渐进学习');
    queueActions.push({
      id: 'add-to-incremental-queue',
      label: translate('addToIncrementalQueue', '渐进学习'),
      icon: 'iconBook',
    });
    queueActions.push({
      id: 'add-to-incremental-queue-all',
      label: translate('addToIncrementalQueueAll', '渐进学习（含今日已复习）'),
      icon: 'iconAdd',
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
      label: translate('addToNeuralRoamQueue', '神经漫游当前航线'),
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
    withSuspend?: boolean;
    preset?: string;
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
    actions.push(BASE.priorityPlus10);
    actions.push(BASE.priorityMinus10);
  }
  if (options.withSuspend) {
    actions.push(options.preset === 'suspended' ? BASE.unsuspend : BASE.suspend);
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

export type QueueActionType = 'retrieval' | 'incremental' | 'final-drill' | 'filter-group' | 'neural-roam';
type RescheduleAction = 'postpone' | 'advance' | 'spread';

export type QueueAddRoute = {
  queueType: QueueType;
  actionType: QueueActionType;
  source?: QueueAddSource;
};

export const QUEUE_ADD_ROUTES: Record<string, QueueAddRoute> = {
  'add-to-retrieval-queue': {
    queueType: QueueType.RetrievalPractice,
    actionType: 'retrieval',
  },
  'add-to-retrieval-queue-all': {
    queueType: QueueType.RetrievalPractice,
    actionType: 'retrieval',
    source: 'manual-add-all',
  },
  'add-to-incremental-queue': {
    queueType: QueueType.IncrementalLearning,
    actionType: 'incremental',
  },
  'add-to-incremental-queue-all': {
    queueType: QueueType.IncrementalLearning,
    actionType: 'incremental',
    source: 'manual-add-all',
  },
  'add-to-deliberate-queue': {
    queueType: QueueType.FinalDrill,
    actionType: 'final-drill',
  },
  'add-to-final-drill-queue': {
    queueType: QueueType.FinalDrill,
    actionType: 'final-drill',
  },
  'add-to-filter-group-queue': {
    queueType: QueueType.FilterGroup,
    actionType: 'filter-group',
  },
  'add-to-neural-roam-queue': {
    queueType: QueueType.NeuralRoam,
    actionType: 'neural-roam',
  },
};

type QueueCandidate = {
  cardId: string;
  blockId: string;
  cardType?: BrowserActionTarget['cardType'];
};

type QueueAddInput = string | {
  id: string;
  blockId: string;
  type?: string;
  cardType?: BrowserActionTarget['cardType'];
  cardTypeMarker?: string;
  meta?: {
    cardTypeMarker?: string;
  };
};

type QueueAddLike = {
  addCard?: (card: QueueAddInput, source?: QueueAddSource) => Promise<void> | void;
  addCards?: (cards: QueueAddInput[], source?: QueueAddSource) => Promise<QueueBulkMutationResult> | QueueBulkMutationResult;
  addConceptBlocksToCurrentRoute?: (
    blockIds: string[],
    options?: { source?: QueueAddSource; enabled?: boolean },
  ) => Promise<{ added: number; message: string }> | { added: number; message: string };
};

type UnifiedStorageLike = CardReadPort & {
  loadData?: (key: string) => Promise<unknown>;
  saveData?: (key: string, value: unknown) => Promise<void>;
};

type RescheduleResultLike = {
  updated?: unknown;
  skipped?: unknown;
  skippedReasons?: Record<string, number>;
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
  'neural-roam': '神经漫游当前航线不可用',
};

const conceptOnlyMessage: Record<'retrieval' | 'final-drill' | 'neural-roam', string> = {
  retrieval: 'Concept 卡片不能加入提取练习队列',
  'final-drill': 'Concept 卡片不能加入刻意练习队列',
  'neural-roam': '神经漫游当前航线只接受 Concept 卡片',
};

function resolveCardId(card: BrowserActionTarget): string {
  return resolveBrowserCardActionId(card as BrowserCard);
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

function supportsRescheduleConfigStorage(
  storage: UnifiedStorageLike | undefined
): storage is UnifiedStorageLike & RescheduleStoragePort {
  return Boolean(storage && typeof (storage as unknown as RescheduleStoragePort).getCardsByBlockId === 'function');
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
  selectedRows: BrowserActionTarget[],
  action: RescheduleAction,
  context?: Record<string, unknown>
): Promise<{
  updated: number;
  skipped: number;
  skippedReasons?: Record<string, number>;
  averageCardsPerDay?: number;
} | null> {
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
  const configManager = supportsRescheduleConfigStorage(storage) ? new ConfigManager(storage) : null;
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

  const updated = normalizeCount(rawResult.updated);
  if (action === 'postpone') {
    return {
      updated,
      skipped: normalizeCount(rawResult.skipped),
      skippedReasons: rawResult.skippedReasons,
    };
  }

  const skipped = Math.max(0, rows.length - updated);
  if (action === 'spread') {
    const averageCardsPerDay =
      typeof rawResult.averageCardsPerDay === 'number' && Number.isFinite(rawResult.averageCardsPerDay)
        ? rawResult.averageCardsPerDay
        : 0;
    return {
      updated,
      skipped: normalizeCount(rawResult.skipped, skipped),
      skippedReasons: rawResult.skippedReasons,
      averageCardsPerDay,
    };
  }

  return { updated, skipped };
}

/**
 * 加入队列（用于 DeckDataSource）
 */
async function addCardsDeterministically(
  queue: QueueAddLike | undefined,
  items: QueueCandidate[],
  resolveAddInput: (item: QueueCandidate) => QueueAddInput,
  source: QueueAddSource
) : Promise<{ added: number; failed: number; firstError?: string; conceptTypeConflict: number }> {
  if (!queue || (typeof queue.addCard !== 'function' && typeof queue.addCards !== 'function')) {
    throw new Error('Queue unavailable');
  }

  let added = 0;
  let failed = 0;
  let firstError: string | undefined;
  let conceptTypeConflict = 0;

  if (typeof queue.addCards === 'function') {
    const addInputs: QueueAddInput[] = [];

    for (const item of items) {
      const addInput = resolveAddInput(item);
      const targetId = typeof addInput === 'string' ? addInput : addInput.blockId;
      if (!targetId) {
        failed++;
        continue;
      }
      addInputs.push(addInput);
    }

    if (addInputs.length === 0) {
      return { added: 0, failed, firstError, conceptTypeConflict };
    }

    try {
      const result = await Promise.resolve(queue.addCards(addInputs, source));
      added = result.changedCount;
      const failedItems = Array.isArray(result.failedItems) ? result.failedItems : [];
      for (const item of failedItems) {
        const message = item.message || '';
        if (message.includes('is not a concept card')) {
          conceptTypeConflict++;
        } else if (message) {
          firstError = firstError ?? message;
        }
      }
      const failedIds = Array.isArray(result.failedIds) ? result.failedIds : [];
      failed += Math.max(failedIds.length, failedItems.length);
      return { added, failed, firstError, conceptTypeConflict };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      firstError = message;
      failed += addInputs.length;
      logger.error(`[MenuActions] Failed to bulk add ${addInputs.length} cards`, error);
      return { added: 0, failed, firstError, conceptTypeConflict };
    }
  }

  for (const item of items) {
    const addInput = resolveAddInput(item);
    const targetId = typeof addInput === 'string' ? addInput : addInput.blockId;
    if (!targetId) {
      failed++;
      continue;
    }
    try {
      await Promise.resolve(queue.addCard(addInput, source));
      added++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      const conceptMismatch = message.includes('is not a concept card');
      if (conceptMismatch) {
        conceptTypeConflict++;
        logger.warn(`[MenuActions] Skip non-concept card ${targetId} for neural roam queue`);
      } else {
        firstError = firstError ?? message;
        logger.error(`[MenuActions] Failed to add card ${targetId}`, error);
      }
    }
  }

  return { added, failed, firstError, conceptTypeConflict };
}

function prepareQueueItems(selectedRows: BrowserActionTarget[]): QueueCandidate[] {
  return selectedRows.map((row) => ({
    cardId: resolveCardId(row),
    blockId: row.blockId,
    cardType: row.cardType,
  }));
}

function filterQueueItems(
  queueType: QueueActionType,
  items: QueueCandidate[]
): { items: QueueCandidate[]; skippedConceptCount: number } {
  let filteredItems = items;
  if (queueType === 'neural-roam') {
    filteredItems = items.filter((item) => item.cardType === 'concept');
  } else if (queueType === 'retrieval' || queueType === 'final-drill') {
    filteredItems = items.filter((item) => item.cardType !== 'concept');
  }

  return {
    items: filteredItems,
    skippedConceptCount: Math.max(0, items.length - filteredItems.length),
  };
}

export async function addToQueue(
  queue: QueueAddLike | undefined,
  selectedRows: BrowserActionTarget[],
  queueType: QueueActionType,
  source: QueueAddSource = 'manual'
): Promise<{ added: number; message: string }> {
  logger.debug('[MenuActions] addToQueue called', {
    queueType,
    selectedCount: selectedRows?.length ?? 0,
  });

  if (queueType === 'neural-roam' && typeof queue?.addConceptBlocksToCurrentRoute !== 'function') {
    return { added: 0, message: queueUnavailableMessage[queueType] };
  }

  const items = prepareQueueItems(selectedRows);
  const filtered = filterQueueItems(queueType, items);

  if (filtered.items.length === 0) {
    if (queueType === 'retrieval' || queueType === 'final-drill' || queueType === 'neural-roam') {
      return { added: 0, message: conceptOnlyMessage[queueType] };
    }
    return { added: 0, message: '没有有效的卡片可添加' };
  }

  let addResult: { added: number; failed: number; firstError?: string; conceptTypeConflict: number };
  try {
    if (queueType === 'neural-roam') {
      const routeResult = await queue.addConceptBlocksToCurrentRoute(
        filtered.items.map((item) => item.blockId),
        { source, enabled: true },
      );
      return {
        added: routeResult.added,
        message: routeResult.message,
      };
    }
    addResult = await addCardsDeterministically(
      queue,
      filtered.items,
      queueType === 'neural-roam'
        ? (item) => ({
            id: item.blockId,
            blockId: item.blockId,
            type: 'concept',
            cardType: item.cardType,
            cardTypeMarker: 'concept',
            meta: { cardTypeMarker: 'concept' },
          })
        : (item) => item.cardId,
      source
    );
  } catch (error) {
    logger.warn(`[MenuActions] queue unavailable for ${queueType}`);
    return { added: 0, message: queueUnavailableMessage[queueType] };
  }

  if (addResult.added <= 0) {
    if (queueType === 'neural-roam' && addResult.conceptTypeConflict > 0 && !addResult.firstError) {
      return {
        added: 0,
        message: `没有可加入的 Concept 卡片（${addResult.conceptTypeConflict} 张类型冲突已跳过）`,
      };
    }
    if (addResult.firstError) {
      return { added: 0, message: `添加失败：${addResult.firstError}` };
    }
    return { added: 0, message: '没有有效的卡片可添加' };
  }

  if (queueType === 'neural-roam') {
    let message = `已将 ${addResult.added} 张卡片加入神经漫游当前航线`;
    if (filtered.skippedConceptCount > 0) {
      message += `（过滤了 ${filtered.skippedConceptCount} 张非 Concept 卡片）`;
    }
    if (addResult.failed > 0) {
      message += `，${addResult.failed} 张添加失败`;
    }
    if (addResult.conceptTypeConflict > 0) {
      message += `，${addResult.conceptTypeConflict} 张类型冲突已跳过`;
    }
    return { added: addResult.added, message };
  }

  if (queueType === 'retrieval' || queueType === 'final-drill') {
    const queueName = queueType === 'retrieval' ? '提取练习' : queueDisplayName['final-drill'];
    let message = `已加入 ${addResult.added} 张卡片到${queueName}队列`;
    if (filtered.skippedConceptCount > 0) {
      message += `（过滤了 ${filtered.skippedConceptCount} 张 Concept 卡片）`;
    }
    if (addResult.failed > 0) {
      message += `，${addResult.failed} 张添加失败`;
    }
    return { added: addResult.added, message };
  }

  const queueName = queueDisplayName[queueType];
  let message = `已加入 ${addResult.added} 张卡片到${queueName}队列`;
  if (addResult.failed > 0) {
    message += `，${addResult.failed} 张添加失败`;
  }
  return {
    added: addResult.added,
    message,
  };
}
