import type { BrowserCard } from '../types';
import { CardState, STATE_LABELS, calculateRetrievability, formatDueDate, formatHistoryDate, truncateContent } from '../types';
import { sql } from '@/core/siyuan/api';
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

function toBrowserCardFromRow(row: any): BrowserCard | null {
  const blockId = String(row?.id || row?.block_id || row?.blockId || '');
  if (!blockId) return null;

  const fullContent = String(row?.content || row?.fcontent || row?.markdown || '');
  const content = truncateContent(fullContent);
  const due = new Date();
  const state = CardState.New;
  const elapsedDays = 0;
  const stability = 0;

  return {
    id: '',
    fsrsCardId: '',
    blockId,
    deckId: '',
    content,
    fullContent,
    rootId: String(row?.root_id || row?.rootId || ''),
    state,
    stateLabel: STATE_LABELS[state] || 'New',
    due,
    dueFormatted: formatDueDate(due),  // ✅ 使用 formatDueDate
    stability,
    difficulty: 0,
    retrievability: calculateRetrievability(stability, elapsedDays),
    reps: 0,
    lapses: 0,
    elapsedDays,
    scheduledDays: 0,
    lastReview: null,
    lastReviewFormatted: formatHistoryDate(null),  // ✅ 使用 formatHistoryDate
    interval: 0,
    firstReview: null,
    firstReviewFormatted: formatHistoryDate(null),  // ✅ 使用 formatHistoryDate
    priority: 50,
    suspended: false,
    tags: [],
  };
}

export class QueryDataSource implements ICardDataSource {
  id = 'query';
  label = 'Query';

  private readonly stmt: string;

  constructor(stmt: string) {
    this.stmt = stmt;
  }

  async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    const raw = await sql(this.stmt);
    const rawRows = Array.isArray(raw) ? raw : [];
    const blockIds: string[] = [];
    for (const r of rawRows) {
      const id = String(r?.id || r?.block_id || r?.blockId || '');
      if (id) blockIds.push(id);
    }

    const joined = await loadQueueCards(blockIds);
    const byBlockId = new Map(joined.map((c) => [c.blockId, c]));

    const rows: BrowserCard[] = [];
    for (const r of rawRows) {
      const blockId = String(r?.id || r?.block_id || r?.blockId || '');
      const existing = blockId ? byBlockId.get(blockId) : undefined;
      if (existing) {
        rows.push(existing);
        continue;
      }
      const card = toBrowserCardFromRow(r);
      if (card) rows.push(card);
    }

    const sorted = applySort(rows, params?.sortModel || []);
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
