import type { BrowserCard } from '../types';
import { formatDate } from '../types';
import { loadCards, batchReset, batchSuspend, batchSetPriority } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';
import { RescheduleService } from '@/core/scheduler/rescheduleService';

type DeckDataSourceOptions = {
  preset: string;
  currentDocId?: string;
};

type QueueLike = {
  addItems?: (items: any[]) => Promise<number> | number;
  addItem?: (item: any) => Promise<void> | void;
};

type FsrsPluginLike = {
  storage?: any;
  rescheduleService?: RescheduleService;
  openSubsetReviewDialog?: (blockIds: string[]) => Promise<void> | void;
  extractionQueue?: QueueLike;
  deliberateQueue?: QueueLike;
  filterGroupQueue?: QueueLike;
  // 注意：neuralRoamQueue 不支持 addItem，所以不在这里暴露
};

function applySort(rows: BrowserCard[], sortModel: SortModel[]): BrowserCard[] {
  if (!sortModel?.length) return rows;
  const [{ colId, sort }] = sortModel;
  const dir = sort === 'desc' ? -1 : 1;
  const key = String(colId || '');
  const copy = [...rows];
  copy.sort((a: any, b: any) => {
    const av = (a as any)?.[key];
    const bv = (b as any)?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return -1 * dir;
    if (bv == null) return 1 * dir;
    if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  return copy;
}

function parseSiyuanTime14(timeStr: string | undefined): Date | null {
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
}

export class DeckDataSource implements ICardDataSource {
  id = 'deck';
  label = 'Deck';

  private readonly plugin?: FsrsPluginLike;
  private readonly options: DeckDataSourceOptions;

  constructor(plugin: FsrsPluginLike | undefined, options: DeckDataSourceOptions) {
    this.plugin = plugin;
    this.options = options;
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const rows = await loadCards(this.options.preset, this.options.currentDocId);

    // 【全部闪卡】模式下不设置 queueIndex，NO 列将显示数组索引
    // 只有在【复习队列】模式下，数据源才会设置 queueIndex
    const sorted = applySort(rows, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
  }

  getSupportedActions(): CardBrowserAction[] {
    const actions: CardBrowserAction[] = [
      { id: 'open', label: 'Open', icon: 'iconOpen' },
    ];

    // 添加"加入队列"子菜单（对应顶栏的四种队列）
    const queueActions: CardBrowserAction[] = [];

    if (this.plugin?.extractionQueue) {
      queueActions.push({
        id: 'add-to-extraction-queue',
        label: '提取练习',
        icon: 'iconList',
      });
    }
    if (this.plugin?.deliberateQueue) {
      queueActions.push({
        id: 'add-to-deliberate-queue',
        label: '刻意练习',
        icon: 'iconCards',
      });
    }
    if (this.plugin?.filterGroupQueue) {
      queueActions.push({
        id: 'add-to-filter-group-queue',
        label: '筛选复习',
        icon: 'iconFilter',
      });
    }

    if (queueActions.length > 0) {
      actions.push({
        id: 'add-to-queue',
        label: '加入队列',
        icon: 'iconDownload',
        submenu: queueActions,
      });
    }

    // 其他操作
    actions.push(
      { id: 'set-priority', label: 'Set Priority', icon: 'iconMark' },
      { id: 'postpone', label: 'Postpone', icon: 'iconCalendar' },
      { id: 'advance', label: 'Advance', icon: 'iconCalendar' },
      { id: 'spread', label: 'Spread', icon: 'iconSort' },
      { id: 'reset', label: 'Reset', icon: 'iconRefresh', danger: true },
      { id: 'suspend', label: 'Suspend', icon: 'iconPause' }
    );

    if (this.plugin?.openSubsetReviewDialog) {
      actions.unshift({ id: 'review-subset', label: 'Review Subset', icon: 'iconPlay' });
    }

    return actions;
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
    // 打开操作
    if (actionId === 'open') return;

    // ========== 队列操作 ==========
    if (actionId === 'add-to-extraction-queue') {
      const items = selectedRows.map((r) => ({
        cardID: r.fsrsCardId || r.id || r.blockId,
        blockID: r.blockId,
        deckID: r.deckId,
        priority: typeof r.priority === 'number' ? r.priority : 50,
      }));
      if (this.plugin?.extractionQueue?.addItems) {
        const added = await Promise.resolve(this.plugin.extractionQueue.addItems(items));
        return { added, message: `已加入 ${added} 张卡片到提取练习队列` };
      }
      return;
    }

    if (actionId === 'add-to-deliberate-queue') {
      const items = selectedRows.map((r) => ({
        cardID: r.fsrsCardId || r.id || r.blockId,
        blockID: r.blockId,
        deckID: r.deckId,
        priority: typeof r.priority === 'number' ? r.priority : 50,
      }));
      let added = 0;
      for (const item of items) {
        await Promise.resolve(this.plugin?.deliberateQueue?.addItem?.(item));
        added++;
      }
      return { added, message: `已加入 ${added} 张卡片到刻意练习队列` };
    }

    if (actionId === 'add-to-filter-group-queue') {
      const items = selectedRows.map((r) => ({
        cardID: r.fsrsCardId || r.id || r.blockId,
        blockID: r.blockId,
        deckID: r.deckId,
        priority: typeof r.priority === 'number' ? r.priority : 50,
      }));
      if (this.plugin?.filterGroupQueue?.addItems) {
        const added = await Promise.resolve(this.plugin.filterGroupQueue.addItems(items));
        return { added, message: `已加入 ${added} 张卡片到筛选复习队列` };
      }
      return;
    }

    // 现有操作
    if (actionId === 'review-subset') {
      const blockIds = (selectedRows || []).map((r) => String(r?.blockId || '')).filter(Boolean);
      if (blockIds.length === 0) return;
      await Promise.resolve(this.plugin?.openSubsetReviewDialog?.(blockIds));
      return;
    }
    if (actionId === 'set-priority') {
      const p = Math.max(0, Math.min(100, Math.floor(Number(context?.priority ?? 50))));
      const blockIds = (selectedRows || []).map((r) => r.blockId).filter(Boolean);
      if (blockIds.length === 0) return;
      await batchSetPriority(blockIds, p);
      for (const r of selectedRows || []) {
        (r as any).priority = p;
      }
      return;
    }

    const rows = (selectedRows || []).map((r) => ({
      blockId: r.blockId,
      cardId: r.id || undefined,
      currentDue: r.due instanceof Date ? r.due : undefined,
    }));

    if (actionId === 'reset') {
      const blockIds = (selectedRows || []).map((r) => r.blockId).filter(Boolean);
      await batchReset(blockIds);
      return;
    }

    if (actionId === 'suspend') {
      const blockIds = (selectedRows || []).map((r) => r.blockId).filter(Boolean);
      await batchSuspend(blockIds, true);
      return;
    }

    const service = this.plugin?.rescheduleService
      ?? (this.plugin?.storage ? new RescheduleService(this.plugin.storage) : null);

    if (!service) {
      return;
    }

    const meta = { source: 'browser' };
    if (actionId === 'advance') {
      const maxDays = Math.max(1, Number(context?.maxDays || 0));
      const res = await service.advance(rows, maxDays, meta);
      for (const u of (res as any)?.updated || []) {
        const d = parseSiyuanTime14(String(u?.newDue || ''));
        const r = (selectedRows || []).find((x) => x.blockId === u?.blockId) as any;
        if (r && d) {
          r.due = d;
          r.dueFormatted = formatDate(d);
        }
      }
      return res;
    }
    if (actionId === 'postpone') {
      const days = Math.max(1, Number(context?.days || 0));
      const res = await service.postpone(rows, days, meta);
      for (const u of (res as any)?.updated || []) {
        const d = parseSiyuanTime14(String(u?.newDue || ''));
        const r = (selectedRows || []).find((x) => x.blockId === u?.blockId) as any;
        if (r && d) {
          r.due = d;
          r.dueFormatted = formatDate(d);
        }
      }
      return res;
    }
    if (actionId === 'set-due') {
      const d = context?.date instanceof Date ? context.date : new Date(String(context?.date || ''));
      if (!d || Number.isNaN(d.getTime())) return;
      const res = await service.rescheduleAbsolute(rows, d, meta);
      for (const u of (res as any)?.updated || []) {
        const nd = parseSiyuanTime14(String(u?.newDue || '')) || d;
        const r = (selectedRows || []).find((x) => x.blockId === u?.blockId) as any;
        if (r) {
          r.due = nd;
          r.dueFormatted = formatDate(nd);
        }
      }
      return res;
    }
    if (actionId === 'spread') {
      const maxDays = Math.max(1, Number(context?.maxDays || context?.days || 0));
      const res = await (service as any).spread?.(rows, { maxDays }, meta);
      for (const u of (res as any)?.updated || []) {
        const d = parseSiyuanTime14(String(u?.newDue || ''));
        const r = (selectedRows || []).find((x) => x.blockId === u?.blockId) as any;
        if (r && d) {
          r.due = d;
          r.dueFormatted = formatDate(d);
        }
      }
      return res;
    }
  }
}
