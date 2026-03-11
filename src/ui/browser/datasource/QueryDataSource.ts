import type { BrowserCard } from '../types';
import {
  CardState,
  STATE_LABELS,
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  truncateContent,
} from '../types';
import {
  loadBrowserCardProjectionsByBlockIds,
  loadBrowserCardsByBlockIds,
  runBrowserSql,
  type BrowserCardProjection,
} from '../browserService';
import type {
  ICardDataSource,
  IBrowserQueryableDataSource,
  CardBrowserAction,
  BrowserActionTarget,
  FetchRowsOptions,
  FetchRowsResult,
  SortModel,
} from './types';
import { sortBrowserRows } from './DataSourceUtils';
import { BrowserQuerySession } from './session/BrowserQuerySession';
import { resolveBrowserCardStableId } from '../utils/browserCardIdentity';

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
export class QueryDataSource implements ICardDataSource, IBrowserQueryableDataSource {
  id = 'query';
  label = 'Query';

  private readonly stmt: string;
  private readonly querySession = new BrowserQuerySession('QueryDataSource');
  private lastSortModel: SortModel[] = [];
  private dataGeneration = 0;
  private liteRowBlockIdById = new Map<string, string>();

  constructor(stmt: string) {
    this.stmt = stmt;
  }

  async fetchRows(params: FetchRowsOptions): Promise<FetchRowsResult> {
    const sortModel = (params?.sortModel || []) as SortModel[];
    this.lastSortModel = [...sortModel];
    return this.querySession.fetchRows({
      ...this.buildSessionOptions(sortModel),
      startRow: params?.startRow,
      endRow: params?.endRow,
    });
  }

  getQueryFingerprint(): string {
    return this.buildQueryFingerprint(this.lastSortModel);
  }

  async getAllMatchedIds(): Promise<string[]> {
    return this.querySession.getAllMatchedIds(this.buildSessionOptions(this.lastSortModel));
  }

  async getRowsByIds(ids: string[]): Promise<BrowserCard[]> {
    return this.querySession.getRowsByIds(ids, this.buildSessionOptions(this.lastSortModel));
  }

  async getActionTargetsByIds(ids: string[]): Promise<BrowserActionTarget[]> {
    return this.querySession.getActionTargetsByIds(ids, this.buildSessionOptions(this.lastSortModel));
  }

  public invalidateQuerySession(): void {
    this.dataGeneration += 1;
    this.liteRowBlockIdById.clear();
    this.querySession.invalidate();
  }

  getSupportedActions(): CardBrowserAction[] {
    return [{ id: 'open', label: 'Open', icon: 'iconOpen' }];
  }

  async performAction(actionId: string, selectedRows: BrowserActionTarget[], context?: unknown): Promise<void> {
    void selectedRows;
    void context;
    if (actionId === 'open') return;
  }

  getId(): string {
    return this.id;
  }

  private buildQueryFingerprint(sortModel: SortModel[]): string {
    return JSON.stringify({
      dataSource: 'query',
      stmt: this.stmt,
      sortModel,
      generation: this.dataGeneration,
    });
  }

  private async buildOrderedRows(sortModel: SortModel[]): Promise<BrowserCardProjection[]> {
    const rawRows = toSqlRows(await runBrowserSql(this.stmt));
    const blockIds = rawRows.map(readBlockId).filter(Boolean);

    const joined = await loadBrowserCardProjectionsByBlockIds(blockIds, { applyQueryFilter: false });
    const byBlockId = new Map(joined.map((card) => [card.blockId, card]));

    const rows: BrowserCardProjection[] = [];
    for (const rawRow of rawRows) {
      const blockId = readBlockId(rawRow);
      const existing = blockId ? byBlockId.get(blockId) : undefined;
      if (existing) {
        rows.push(existing);
        continue;
      }

      const fallbackCard = toBrowserCardFromRow(rawRow);
      if (fallbackCard) {
        const { note: _note, meta: _meta, ...projection } = fallbackCard;
        rows.push(projection);
      }
    }

    return sortBrowserRows(rows, sortModel);
  }

  private buildSessionOptions(sortModel: SortModel[]) {
    return {
      queryFingerprint: this.buildQueryFingerprint(sortModel),
      buildLiteRows: async () => {
        const rows = await this.buildOrderedRows(sortModel);
        this.liteRowBlockIdById.clear();
        return rows.map((row) => {
          const id = resolveBrowserCardStableId(row as BrowserCard);
          this.liteRowBlockIdById.set(id, row.blockId);
          return {
            id,
            blockId: row.blockId,
            fsrsCardId: row.fsrsCardId ? String(row.fsrsCardId) : undefined,
            actionTarget: {
              id: String(row.id || ''),
              blockId: row.blockId,
              fsrsCardId: row.fsrsCardId ? String(row.fsrsCardId) : undefined,
              cardType: row.cardType,
              priority: typeof row.priority === 'number' ? row.priority : undefined,
            },
          };
        });
      },
      hydrateRows: async (ids: string[]) => {
        const blockIds = ids
          .map((id) => this.liteRowBlockIdById.get(id))
          .filter((blockId): blockId is string => Boolean(blockId));
        const rows = await loadBrowserCardsByBlockIds(blockIds, { applyQueryFilter: false });
        const rowByBlockId = new Map(rows.map((row) => [row.blockId, row]));
        return ids
          .map((id) => {
            const blockId = this.liteRowBlockIdById.get(id);
            return blockId ? rowByBlockId.get(blockId) : undefined;
          })
          .filter((row): row is BrowserCard => Boolean(row));
      },
    };
  }
}
