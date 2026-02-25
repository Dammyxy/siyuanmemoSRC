import type { BrowserCard } from '../types';
import {
  CardState,
  STATE_LABELS,
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  truncateContent,
} from '../types';
import { loadQueueCardsSimple, runBrowserSql } from '../browserService';
import type { ICardDataSource } from '@/application/interfaces/ICardDataSource';
import type { CardBrowserAction, FetchRowsOptions, FetchRowsResult } from './types';
import { sortBrowserCards } from './DataSourceUtils';

type SqlRowLike = {
  id?: unknown;
  block_id?: unknown;
  blockId?: unknown;
  content?: unknown;
  fcontent?: unknown;
  markdown?: unknown;
  root_id?: unknown;
  rootId?: unknown;
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSqlRows(raw: unknown): SqlRowLike[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isObjectLike) as SqlRowLike[];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function readBlockId(row: SqlRowLike): string {
  return readString(row.id || row.block_id || row.blockId);
}

function toBrowserCardFromRow(row: SqlRowLike): BrowserCard | null {
  const blockId = readBlockId(row);
  if (!blockId) {
    return null;
  }

  const fullContent = readString(row.content || row.fcontent || row.markdown);
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
    rootId: readString(row.root_id || row.rootId),
    state,
    stateLabel: STATE_LABELS[state] || 'New',
    due,
    dueFormatted: formatDueDate(due),
    stability,
    difficulty: 0,
    retrievability: calculateRetrievability(stability, elapsedDays),
    reps: 0,
    lapses: 0,
    elapsedDays,
    scheduledDays: 0,
    lastReview: null,
    lastReviewFormatted: formatHistoryDate(null),
    interval: 0,
    firstReview: null,
    firstReviewFormatted: formatHistoryDate(null),
    priority: 50,
    suspended: false,
    tags: [],
  };
}

/**
 * QueryDataSource - SQL 查询数据源实现
 */
export class QueryDataSource implements ICardDataSource {
  id = 'query';
  label = 'Query';

  private readonly stmt: string;

  constructor(stmt: string) {
    this.stmt = stmt;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    const rawRows = toSqlRows(await runBrowserSql(this.stmt));
    const blockIds = rawRows.map(readBlockId).filter(Boolean);

    const joined = await loadQueueCardsSimple(blockIds);
    const byBlockId = new Map(joined.map((card) => [card.blockId, card]));

    const rows: BrowserCard[] = [];
    for (const rawRow of rawRows) {
      const blockId = readBlockId(rawRow);
      const existing = blockId ? byBlockId.get(blockId) : undefined;
      if (existing) {
        rows.push(existing);
        continue;
      }

      const fallbackCard = toBrowserCardFromRow(rawRow);
      if (fallbackCard) {
        rows.push(fallbackCard);
      }
    }

    const sorted = sortBrowserCards(rows, params?.sortModel || []);
    return { rows: sorted, totalCount: sorted.length };
  }

  getSupportedActions(): CardBrowserAction[] {
    return [{ id: 'open', label: 'Open', icon: 'iconOpen' }];
  }

  async performAction(actionId: string, selectedRows: BrowserCard[], context?: unknown): Promise<void> {
    void selectedRows;
    void context;
    if (actionId === 'open') return;
  }

  getId(): string {
    return this.id;
  }
}
