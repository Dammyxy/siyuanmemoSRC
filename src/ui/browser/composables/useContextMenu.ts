import { ref } from 'vue';
import { Menu } from 'siyuan';
import { BrowserCard } from '../types';
import { createVueDialog } from '@/utils/dialog';
import { pushErrMsg, pushMsg } from '@/core/siyuan/api';
import { confirmDialog } from '@/utils/dialog';
import { setBlockAttrs } from '@/core/siyuan/api';
import { ATTR_CARD_TYPE } from '@/core/siyuan/block';
import { invalidateCardCache } from '../browserService';
import { extractBlockIds } from '../utils/helpers';
import { CardDataOptions } from './useCardData';
import { GridInteractionsOptions } from './useGridInteractions';
import ActionParamsDialog from '../ActionParamsDialog.vue';

export interface ContextMenuOptions {
  plugin?: any;
  tabManager?: any;  // ⚠️ 已废弃，使用 tabApplicationService
  tabApplicationService?: any;  // ✅ Phase 9: 使用 TabApplicationService
  i18n?: Record<string, string>;
  loadData: () => Promise<void>;
  refreshQueueCounts: () => Promise<void>;
  storage?: any;  // ✅ 添加 StorageManager 依赖，用于同步卡片数据
}

export interface SortFieldConfig {
  colId: string;
  label: string;
  icon?: string;
}

// 排序字段配置
export const SORT_FIELD_CONFIGS: SortFieldConfig[] = [
  { colId: 'no', label: '序号', icon: 'iconHash' },
  { colId: 'content', label: '内容', icon: 'iconAlignCenter' },
  { colId: 'stateLabel', label: '状态', icon: 'iconRecord' },
  { colId: 'dueFormatted', label: '到期时间', icon: 'iconCalendar' },
  { colId: 'stability', label: '稳定性', icon: 'iconBarChart' },
  { colId: 'difficulty', label: '难度', icon: 'iconFlask' },
  { colId: 'retrievability', label: '可提取性', icon: 'iconPointer' },
  { colId: 'reps', label: '复习次数', icon: 'iconNumbers' },
  { colId: 'lapses', label: '遗忘次数', icon: 'iconRefresh' },
  { colId: 'priority', label: '优先级', icon: 'iconMark' },
];

export function useContextMenu(options: ContextMenuOptions) {
  // 应用排序
  const applySort = (colId: string, sortDirection: 'asc' | 'desc', gridApi: any) => {
    if (!gridApi) {
      console.error('[SiYuanMemo][CardBrowser] Grid API not ready');
      return;
    }

    console.log('[SiYuanMemo][CardBrowser] Applying sort:', { colId, sortDirection });

    try {
      // AG-Grid v35+ 直接使用 gridApi.applyColumnState
      gridApi.applyColumnState({
        state: [
          {
            colId: colId,
            sort: sortDirection,
          },
        ],
        defaultState: { sort: null }, // 清除其他列的排序
      });

      console.log('[SiYuanMemo][CardBrowser] Sort applied successfully');
    } catch (err) {
      console.error('[SiYuanMemo][CardBrowser] Apply sort failed:', err);
    }
  };

  // 随机排序
  const applyRandomSort = (gridApi: any) => {
    if (!gridApi) {
      console.error('[SiYuanMemo][CardBrowser] Grid API not ready for random sort');
      return;
    }

    try {
      // 获取当前显示的所有行数据
      const rowCount = gridApi.getDisplayedRowCount?.() ?? 0;
      if (rowCount === 0) {
        console.warn('[SiYuanMemo][CardBrowser] No rows to shuffle');
        return;
      }

      console.log('[SiYuanMemo][CardBrowser] Shuffling', rowCount, 'rows');

      // 收集所有行数据
      const rows: any[] = [];
      for (let i = 0; i < rowCount; i++) {
        const node = gridApi.getDisplayedRowAtIndex?.(i);
        if (node?.data) {
          rows.push(node.data);
        }
      }

      // Fisher-Yates 洗牌算法
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }

      // 清除所有排序状态
      gridApi.setColumnState?.({
        state: [],
        defaultState: { sort: null },
      });

      // 设置随机排序标志
      // 注意：需要通过某种方式更新 hasRandomSort 状态

      // 使用 AG-Grid v28+ 的 setGridOption API
      // 先清空数据，强制 AG-Grid 重新创建行模型
      gridApi.setGridOption?.('rowData', []);

      // 在下一个 tick 设置新数据
      setTimeout(() => {
        if (gridApi) {
          gridApi.setGridOption?.('rowData', rows);
          console.log('[SiYuanMemo][CardBrowser] Shuffle completed via setGridOption');
        }
      }, 0);
    } catch (err) {
      console.error('[SiYuanMemo][CardBrowser] Random sort failed:', err);
    }
  };

  // 显示右键菜单
  const showContextMenu = (
    event: any, 
    rowData: BrowserCard, 
    selectedRows: BrowserCard[],
    gridApi: any,
    dataSource: any
  ) => {
    event.event?.preventDefault();

    const actions = dataSource?.getSupportedActions?.() || [];
    const menu = new Menu('card-browser-context');
    const selected = selectedRows?.length ? selectedRows : [rowData];

    // ========== 添加排序菜单 ==========
    const sortMenu: any[] = [];

    // 添加每个排序字段的子菜单
    for (const field of SORT_FIELD_CONFIGS) {
      sortMenu.push({
        icon: field.icon || 'iconSort',
        label: field.label,
        submenu: [
          {
            icon: 'iconUp',
            label: '升序',
            click: () => {
              console.log('[SiYuanMemo][CardBrowser] Menu clicked: Sort by', field.colId, 'ASC');
              applySort(field.colId, 'asc', gridApi);
            },
          },
          {
            icon: 'iconDown',
            label: '降序',
            click: () => {
              console.log('[SiYuanMemo][CardBrowser] Menu clicked: Sort by', field.colId, 'DESC');
              applySort(field.colId, 'desc', gridApi);
            },
          },
        ],
      });
    }

    // 添加分隔线
    sortMenu.push({ type: 'separator' });

    // 添加随机排序
    sortMenu.push({
      icon: 'iconRefresh',
      label: '随机排序',
      click: () => {
        console.log('[SiYuanMemo][CardBrowser] Menu clicked: Random sort');
        applyRandomSort(gridApi);
      },
    });

    // 插入排序菜单
    menu.addItem({
      icon: 'iconSort',
      label: '排序',
      submenu: sortMenu,
    });

    // 添加分隔线（排序菜单和现有操作之间）
    menu.addItem({ type: 'separator' });

    // ========== 卡片类型菜单（Topic/Item）==========
    const cardTypeMenu: any[] = [
      {
        icon: 'iconFile',
        label: '标记为 Topic',
        click: () => void markCardsAsTopic(selected),
      },
      {
        icon: 'iconCheck',
        label: '标记为 Item',
        click: () => void markCardsAsItem(selected),
      },
    ];

    menu.addItem({
      icon: 'iconHR',
      label: '卡片类型',
      submenu: cardTypeMenu,
    });

    // 添加分隔线（卡片类型菜单和现有操作之间）
    menu.addItem({ type: 'separator' });

    // ========== 原有的操作菜单 ==========
    for (const action of actions) {
      if (action.submenu && action.submenu.length > 0) {
        // 处理子菜单
        menu.addItem({
          icon: action.icon || 'iconMore',
          label: getActionLabel({ id: action.id, label: action.label }),
          submenu: action.submenu.map((sub: any) => ({
            icon: sub.icon || 'iconMore',
            label: getActionLabel({ id: sub.id, label: sub.label }),
            click: () => void handleAction(sub.id, selected, rowData),
          })),
        });
      } else {
        // 处理普通菜单项
        menu.addItem({
          icon: action.icon || 'iconMore',
          label: getActionLabel({ id: action.id, label: action.label }),
          click: () => void handleAction(action.id, selected, rowData),
        });
      }
    }

    const mouseEvent = event.event as MouseEvent;
    menu.open({ x: mouseEvent.clientX, y: mouseEvent.clientY });
  };

  // 国际化函数
  const t = (key: string, fallback: string): string => {
    return options.i18n?.[key] || fallback;
  };

  // 获取操作标签
  const getActionLabel = (action: { id: string; label: string }): string => {
    const map: Record<string, { key: string; fallback: string }> = {
      'review-subset': { key: 'reviewSubset', fallback: 'Review Subset' },
      open: { key: 'openInTab', fallback: 'Open' },
      postpone: { key: 'postpone', fallback: 'Postpone' },
      advance: { key: 'advance', fallback: 'Advance' },
      spread: { key: 'spread', fallback: 'Spread' },
      reset: { key: 'resetCard', fallback: 'Reset' },
      suspend: { key: 'suspend', fallback: 'Suspend' },
      'remove-from-queue': { key: 'removeFromQueue', fallback: 'Remove from Queue' },
      dismiss: { key: 'dismiss', fallback: 'Dismiss' },
      'insert-at': { key: 'insertAt', fallback: 'Insert at' },
      'set-priority': { key: 'setPriority', fallback: 'Set Priority' },
      'auto-sort': { key: 'autoSortQueue', fallback: 'Auto Sort' },
    };
    const m = map[action.id];
    if (!m) return action.label;
    return t(m.key, action.label || m.fallback);
  };



  // ========== 卡片类型标记功能 ==========

  /**
   * 标记卡片为 Topic
   */
  const markCardsAsTopic = async (cards: BrowserCard[]): Promise<void> => {
    if (!cards?.length) return;

    const blockIds = cards.map(c => c.blockId);
    console.log(`[SiYuanMemo][CardBrowser] Marking ${blockIds.length} cards as Topic:`, blockIds);

    try {
      // 1. 更新块属性
      for (const blockId of blockIds) {
        await setBlockAttrs(blockId, {
          [ATTR_CARD_TYPE]: 'topic',
        });
      }

      // 2. 更新 StorageManager 中的卡片类型
      if (options.storage) {
        for (const card of cards) {
          const cardId = card.fsrsCardId || card.id;
          if (cardId) {
            const fsrsCard = options.storage.getCard(cardId);
            if (fsrsCard) {
              fsrsCard.type = 'topic' as any;
              options.storage.setCard(fsrsCard);
              console.log(`[SiYuanMemo][CardBrowser] Updated card type in storage: ${cardId} -> topic`);
            }
          }
        }
        await options.storage.saveCards();
      }

      await pushMsg(`✅ 已将 ${blockIds.length} 张卡片标记为 Topic`, 3000);

      // 清除缓存并刷新数据
      invalidateCardCache();
      await options.loadData();
    } catch (err: any) {
      console.error('[SiYuanMemo][CardBrowser] Failed to mark cards as Topic:', err);
      await pushErrMsg(`标记失败：${err?.message || '未知错误'}`, 3000);
    }
  };

  /**
   * 标记卡片为 Item
   */
  const markCardsAsItem = async (cards: BrowserCard[]): Promise<void> => {
    if (!cards?.length) return;

    const blockIds = cards.map(c => c.blockId);
    console.log(`[SiYuanMemo][CardBrowser] Marking ${blockIds.length} cards as Item:`, blockIds);

    try {
      // 1. 更新块属性
      for (const blockId of blockIds) {
        await setBlockAttrs(blockId, {
          [ATTR_CARD_TYPE]: 'item',
        });
      }

      // 2. 更新 StorageManager 中的卡片类型
      if (options.storage) {
        for (const card of cards) {
          const cardId = card.fsrsCardId || card.id;
          if (cardId) {
            const fsrsCard = options.storage.getCard(cardId);
            if (fsrsCard) {
              fsrsCard.type = 'item' as any;
              options.storage.setCard(fsrsCard);
              console.log(`[SiYuanMemo][CardBrowser] Updated card type in storage: ${cardId} -> item`);
            }
          }
        }
        await options.storage.saveCards();
      }

      await pushMsg(`✅ 已将 ${blockIds.length} 张卡片标记为 Item`, 3000);

      // 清除缓存并刷新数据
      invalidateCardCache();
      await options.loadData();
    } catch (err: any) {
      console.error('[SiYuanMemo][CardBrowser] Failed to mark cards as Item:', err);
      await pushErrMsg(`标记失败：${err?.message || '未知错误'}`, 3000);
    }
  };

  // 批量菜单
  const showBatchMenu = (event?: MouseEvent, selectedRows: BrowserCard[] = []) => {
    const menu = new Menu('card-browser-batch');

    // const ds = currentDataSource.value;
    // const actions = ds?.getSupportedActions?.() || [];
    const anchorRow = selectedRows[0];

    // 注意：这里需要从外部传入可用的操作
    // for (const action of actions) {
    //   menu.addItem({
    //     icon: (action as any)?.icon || 'iconMore',
    //     label: getActionLabel({ id: action.id, label: action.label }),
    //     click: () => void handleAction(action.id, selectedRows, anchorRow),
    //   });
    // }
    
    const anchor = (event?.currentTarget || event?.target) as HTMLElement | null;
    const rect = anchor?.getBoundingClientRect?.();
    if (rect) {
      menu.open({ x: rect.left, y: rect.bottom, isLeft: true });
      return;
    }
    if (event) {
      menu.open({ x: event.clientX, y: event.clientY, isLeft: true });
      return;
    }
    menu.open({ x: 0, y: 0, isLeft: true });
  };

  // 操作参数构建器
  const ACTION_PARAM_BUILDERS: Record<string, (targetCards: BrowserCard[]) => Promise<any | null>> = {
    postpone: async () => {
      const days = await openNumberDialog({
        title: t('postpone', '推迟'),
        label: t('daysLabel', '天数'),
        description: t('postponeHint', '将到期时间推迟 N 天'),
        defaultValue: 7,
        min: 1,
        max: 365,
        step: 1,
        integer: true,
      });
      if (days == null || days <= 0) return null;
      return { days };
    },
    advance: async () => {
      const maxDays = await openNumberDialog({
        title: t('advance', '提前复习'),
        label: t('maxDaysLabel', '最大天数'),
        description: t('advanceHint', 'NewDue = Today + Random(1..N)'),
        defaultValue: 30,
        min: 1,
        max: 365,
        step: 1,
        integer: true,
      });
      if (maxDays == null || maxDays <= 0) return null;
      return { maxDays };
    },
    spread: async (cards) => {
      const maxDays = await openNumberDialog({
        title: t('spread', '平摊复习'),
        label: t('maxDaysLabel', '最大天数'),
        description: t('spreadHint', '将 {n} 张卡片均匀分布在未来 N 天内')
          .replace('{n}', String(cards.length)),
        defaultValue: 7,
        min: 1,
        max: 365,
        step: 1,
        integer: true,
      });
      if (maxDays == null || maxDays <= 0) return null;
      return { maxDays };
    },
    'set-priority': async (cards) => {
      const row = cards?.[0] as any;
      const p = await openNumberDialog({
        title: t('setPriority', '设置优先级'),
        label: t('priorityLabel', '优先级'),
        description: t('priorityHint', '0-100，越小越优先'),
        defaultValue: typeof row?.priority === 'number' ? row.priority : 50,
        min: 0,
        max: 100,
        step: 1,
        integer: true,
      });
      if (p == null) return null;
      return { priority: p };
    },
    'insert-at': async () => {
      const q = (options.plugin as any)?.finalDrillQueue;
      const len = typeof q?.size === 'function'
        ? Number(q.size()) || 0
        : Array.isArray(q?.getAllItems?.()) ? q.getAllItems().length : 0;
      const pos = await openNumberDialog({
        title: t('insertAt', '插入到位置...'),
        label: t('positionLabel', '位置'),
        description: t('insertAtHint', '输入 1~{max}，1 表示插到队首')
          .replace('{max}', String(len + 1)),
        defaultValue: 1,
        min: 1,
        max: Math.max(1, len + 1),
        step: 1,
        integer: true,
      });
      if (pos == null) return null;
      const index = Math.max(0, Math.floor(Number(pos)) - 1);
      return { index };
    },
  };

  // 打开数字对话框
  const openNumberDialog = (options: {
    title: string;
    label: string;
    description?: string;
    unit?: string;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    integer?: boolean;
  }): Promise<number | null> => {
    return new Promise((resolve) => {
      const dlg = createVueDialog({
        title: options.title,
        component: ActionParamsDialog,
        props: {
          label: options.label,
          description: options.description,
          unit: options.unit,
          defaultValue: options.defaultValue,
          min: options.min,
          max: options.max,
          step: options.step,
          integer: options.integer,
          confirmText: t('confirm', '确认'),
          cancelText: t('cancel', '取消'),
        },
        events: {
          confirm: (value: number) => {
            dlg.destroy();
            resolve(value);
          },
          cancel: () => {
            dlg.destroy();
            resolve(null);
          },
        },
        width: '520px',
        height: '220px',
      });
    });
  };

  // 操作处理函数
  const handleAction = async (actionId: string, targetCards: BrowserCard[], anchorRow?: BrowserCard, dataSource?: any) => {
    if (!targetCards?.length) return;

    if (actionId === 'open') {
      const blockId = String(anchorRow?.blockId || targetCards[0]?.blockId || '');
      if (blockId) {
        // ✅ Phase 9: 优先使用 TabApplicationService（DDD 架构）
        if (options.tabApplicationService) {
          await options.tabApplicationService.openDocumentTab({ docId: blockId });
        } else if (options.tabManager) {
          // ⚠️ 向后兼容：使用旧的 TabManager
          options.tabManager.openDocumentTab(blockId);
        } else if (options.plugin?.app) {
          // ⚠️ 回退到旧方法（向后兼容）
          (options.plugin.app as any).openTab({ 
            app: options.plugin.app, 
            doc: { id: blockId } 
          });
        } else {
          await pushErrMsg(t('envNotInit', '当前环境未初始化，无法打开页签'));
        }
        return;
      }
      await pushErrMsg(t('envNotInit', '当前环境未初始化，无法打开页签'));
      return;
    }

    const ds = dataSource;
    if (!ds) return;

    if (actionId === 'reset') {
      const ok = await confirmDialog({
        title: t('resetCard', 'Reset'),
        content: t('confirmReset', `确定要重置 ${targetCards.length} 张卡片吗？`),
        confirmText: t('confirm', '确认'),
        cancelText: t('cancel', '取消'),
      });
      if (!ok) return;
    }

    const builder = ACTION_PARAM_BUILDERS[actionId];
    const ctx = builder ? await builder(targetCards) : { refresh: () => void options.loadData() };
    if (builder && ctx == null) return;

    try {
      const res = await (ds.performAction(actionId, targetCards as any, ctx) as any);
      const updated = Number(res?.updated?.length || 0);
      const skipped = Number(res?.skipped?.length || 0);
      if (updated <= 0 && skipped > 0) {
        await pushErrMsg(t('batchNoEffect', '本次没有卡片被更新（可能存在未同步的新卡）'));
        return;
      }
      if (skipped > 0) {
        await pushMsg(
          t('batchSummary', '已更新 {updated} 张，跳过 {skipped} 张')
            .replace('{updated}', String(updated))
            .replace('{skipped}', String(skipped))
        );
      }

      if (
        actionId === 'remove-from-queue'
        || actionId === 'remove-from-current-queue'
        || actionId === 'dismiss'
        || actionId === 'insert-at'
        || actionId === 'auto-sort'
        || actionId === 'reset'
        || actionId === 'suspend'
      ) {
        await options.loadData();
      } else {
        // gridApi.value?.refreshCells({ force: true });
      }
      await options.refreshQueueCounts();
      await pushMsg(t('actionSuccess', '操作成功'));
    } catch (err: any) {
      console.error('[SiYuanMemo][CardBrowser] action failed:', { actionId, err });
      await pushErrMsg(err?.message || t('actionFailed', '操作失败'));
    }
  };

  // 返回上下文菜单相关的方法
  return {
    showContextMenu,
    showBatchMenu,
    markCardsAsTopic,
    markCardsAsItem,
    handleAction,
  };
}