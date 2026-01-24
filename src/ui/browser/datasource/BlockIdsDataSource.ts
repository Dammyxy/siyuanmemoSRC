import type { BrowserCard } from '../types';
import { loadQueueCards } from '../browserService';
import type { ICardDataSource, CardBrowserAction, SortModel } from './types';

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

export class BlockIdsDataSource implements ICardDataSource {
  id: string;
  label: string;

  private readonly blockIds: string[];

  constructor(options: { id: string; label: string; blockIds: string[] }) {
    this.id = options.id;
    this.label = options.label;
    this.blockIds = options.blockIds;
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const cards = await loadQueueCards(this.blockIds);
    const sorted = applySort(cards, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
  }

  getSupportedActions(): CardBrowserAction[] {
    return [
      { id: 'open', label: 'Open', icon: 'iconOpen' },
    ];
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<void> {
    void selectedRows;
    void context;
    if (actionId === 'open') return;
  }
}

