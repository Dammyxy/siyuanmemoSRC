import type { BrowserCard } from '@/types/browser';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import type { SortModel } from '@/application/interfaces/ICardDataSource';
import {
  getSortContractRawValue,
  getSortContractValueType,
  matchesParsedQuery,
  normalizeSortContractColId,
  parseQuery,
  type SortValueType,
} from '@/types/browser';
import { applyBrowserCdfDiagnosticVisibility } from './CdfBrowserDiagnostics';

type CardTypeFilterValue =
  | 'all'
  | 'topic-only'
  | 'item-only'
  | 'concept-only'
  | 'descriptor-only'
  | 'missing-block-only';

export type QuerySecondaryField = 'headline' | 'fullContent';

type BrowserCardWithHeadline = BrowserCard & { headline?: string };
type QueueFilterRowLike = {
  id?: string;
  blockId?: string;
  rootId?: string;
  cardType?: string;
  state?: number;
  due?: unknown;
  suspended?: boolean;
  content?: string;
  fullContent?: string;
  deckId?: string;
  tags?: string[];
  priority?: number;
  interval?: number;
  reps?: number;
  lapses?: number;
  difficulty?: number;
  retrievability?: number;
  stability?: number;
  blockType?: string | null;
  meta?: unknown;
  headline?: string;
};

type BrowserSortRowLike = {
  id?: unknown;
  blockId?: unknown;
} & Record<string, unknown>;

type QueueSnapshotSortRowLike = BrowserSortRowLike & {
  queueIndex?: unknown;
};

export type QueueFilterOptions = {
  docId?: string;
  scopeDocIds?: string[] | null;
  preset?: string;
  queryText?: string;
  cardType?: string;
};

function normalizeSortModel(sortModel?: SortModel[] | null): SortModel[] {
  if (!Array.isArray(sortModel)) {
    return [];
  }

  const normalized: SortModel[] = [];
  for (const item of sortModel) {
    if (!item || (item.sort !== 'asc' && item.sort !== 'desc')) {
      continue;
    }
    const colId = normalizeSortContractColId(item.colId);
    if (!colId) {
      continue;
    }
    normalized.push({ colId, sort: item.sort });
  }
  return normalized;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeComparableSortValue(
  rawValue: unknown,
  valueType: SortValueType | null,
): string | number | boolean | null {
  if (valueType === 'number') {
    return toFiniteNumber(rawValue);
  }

  if (valueType === 'date') {
    return toTimestamp(rawValue);
  }

  if (valueType === 'boolean') {
    if (typeof rawValue === 'boolean') return rawValue;
    if (rawValue === 'true' || rawValue === 1) return true;
    if (rawValue === 'false' || rawValue === 0) return false;
    return null;
  }

  if (valueType === 'string') {
    if (rawValue == null) return null;
    const normalized = String(rawValue).trim();
    return normalized || null;
  }

  if (rawValue == null) return null;
  if (rawValue instanceof Date) return toTimestamp(rawValue);
  if (typeof rawValue === 'number') return Number.isFinite(rawValue) ? rawValue : null;
  if (typeof rawValue === 'boolean') return rawValue;

  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim();
    if (!normalized) return null;
    const numeric = toFiniteNumber(normalized);
    if (numeric != null) return numeric;
    const timestamp = toTimestamp(normalized);
    if (timestamp != null) return timestamp;
    return normalized;
  }

  return String(rawValue);
}

function toComparableSortValue(
  row: BrowserSortRowLike,
  sortKey: string,
): string | number | boolean | null {
  const rawValue = getSortContractRawValue(row as BrowserCard, sortKey);
  const valueType = getSortContractValueType(sortKey);
  return normalizeComparableSortValue(rawValue, valueType);
}

function compareSortValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === 'number' && typeof right === 'number') {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }

  const compared = String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (compared < 0) return -1;
  if (compared > 0) return 1;
  return 0;
}

export function sortBrowserRows<TRow extends BrowserSortRowLike>(
  rows: TRow[],
  sortModel: SortModel[],
): TRow[] {
  const normalizedSortModel = normalizeSortModel(sortModel);
  if (!normalizedSortModel.length) {
    return rows;
  }

  const copy = [...rows];
  copy.sort((a, b) => {
    for (const { colId, sort } of normalizedSortModel) {
      const dir = sort === 'desc' ? -1 : 1;
      const key = String(colId || '').trim();
      const av = toComparableSortValue(a, key);
      const bv = toComparableSortValue(b, key);

      if (av == null || bv == null) {
        if (av == null && bv == null) continue;
        return av == null ? 1 : -1;
      }

      const compared = compareSortValues(av, bv);
      if (compared !== 0) {
        return compared * dir;
      }
    }

    const blockCompare = String(a.blockId || '').localeCompare(String(b.blockId || ''));
    if (blockCompare !== 0) {
      return blockCompare;
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return copy;
}

export function sortQueueSnapshotRows(
  rows: QueueSnapshotRow[],
  sortModel: SortModel[],
): QueueSnapshotRow[] {
  if (!sortModel?.length) {
    return rows;
  }

  const normalizedSortModel = normalizeSortModel(sortModel);
  if (!normalizedSortModel.length) {
    return rows;
  }

  const copy = [...rows] as unknown as QueueSnapshotSortRowLike[];
  copy.sort((a, b) => {
    for (const { colId, sort } of normalizedSortModel) {
      const dir = sort === 'desc' ? -1 : 1;
      const av = toComparableSortValue(a, colId);
      const bv = toComparableSortValue(b, colId);
      if (av == null || bv == null) {
        if (av == null && bv == null) {
          continue;
        }
        return av == null ? 1 : -1;
      }
      const compared = compareSortValues(av, bv);
      if (compared !== 0) {
        return compared * dir;
      }
    }

    const queueIndexCompare = (Number(a.queueIndex) || 0) - (Number(b.queueIndex) || 0);
    if (queueIndexCompare !== 0) {
      return queueIndexCompare;
    }
    const blockCompare = String(a.blockId || '').localeCompare(String(b.blockId || ''));
    if (blockCompare !== 0) {
      return blockCompare;
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  return copy as unknown as QueueSnapshotRow[];
}

function hasMissingBlockType(card: QueueFilterRowLike): boolean {
  const metaBlockType = (
    card.meta && typeof card.meta === 'object'
      ? (card.meta as { blockType?: unknown }).blockType
      : undefined
  );
  return card.blockType === 'missing' || metaBlockType === 'missing';
}

export function isMissingBlockCard(card: QueueFilterRowLike): boolean {
  return hasMissingBlockType(card);
}

function toDueTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeScopeDocIds(scopeDocIds?: string[] | null): string[] {
  return Array.from(new Set(
    (scopeDocIds || [])
      .map((docId) => String(docId || '').trim())
      .filter(Boolean),
  ));
}

export function applyDocFilter<TRow extends QueueFilterRowLike>(
  cards: TRow[],
  docId?: string,
  scopeDocIds?: string[] | null,
): TRow[] {
  const normalizedDocId = String(docId || '').trim();
  const normalizedScopeDocIds = normalizeScopeDocIds(scopeDocIds);
  const scopeDocIdSet = normalizedScopeDocIds.length > 0 ? new Set(normalizedScopeDocIds) : null;

  if (normalizedDocId === '__lost__') {
    let missingCards = cards.filter((card) => isMissingBlockCard(card));
    if (scopeDocIdSet) {
      missingCards = missingCards.filter((card) => scopeDocIdSet.has(String(card.rootId || '').trim()));
    }
    return missingCards;
  }

  let result = cards.filter((card) => !isMissingBlockCard(card));
  if (scopeDocIdSet) {
    result = result.filter((card) => scopeDocIdSet.has(String(card.rootId || '').trim()));
  }

  if (!normalizedDocId) {
    return result;
  }

  return result.filter((card) => String(card.rootId || '').trim() === normalizedDocId);
}

export function applyLegacyPresetFilter<TRow extends QueueFilterRowLike>(cards: TRow[], preset?: string): TRow[] {
  if (!preset || preset === 'all') {
    return cards;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  return cards.filter((card) => {
    const dueTimestamp = toDueTimestamp(card.due);
    switch (preset) {
      case 'due':
        return dueTimestamp != null && dueTimestamp <= today;
      case 'overdue':
        return dueTimestamp != null && dueTimestamp < today;
      case 'new':
        return card.state === 0;
      case 'leech':
        return (card.lapses || 0) > 0;
      case 'suspended':
        return card.suspended === true;
      default:
        return true;
    }
  });
}

export function applyCardTypeFilter<TRow extends QueueFilterRowLike>(cards: TRow[], cardType?: string): TRow[] {
  if (!cardType || cardType === 'all') {
    return cards;
  }

  const normalized = cardType as CardTypeFilterValue;
  return cards.filter((card) => {
    switch (normalized) {
      case 'topic-only':
        return card.cardType === 'topic';
      case 'item-only':
        return card.cardType === 'item' || !card.cardType;
      case 'concept-only':
        return card.cardType === 'concept';
      case 'descriptor-only':
        return card.cardType === 'descriptor';
      case 'missing-block-only':
        return isMissingBlockCard(card);
      default:
        return true;
    }
  });
}

function normalizeSimpleQuery(queryText?: string): string | null {
  if (!queryText) {
    return null;
  }

  const query = queryText.toLowerCase().trim();
  if (!query) {
    return null;
  }

  if (
    query.startsWith('tag:')
    || query.startsWith('deck:')
    || query.startsWith('state:')
    || query.startsWith('doc:')
  ) {
    return null;
  }

  return query;
}

export function applySimpleQueryFilter<TRow extends QueueFilterRowLike>(
  cards: TRow[],
  queryText?: string,
  options?: { secondaryField?: QuerySecondaryField },
): TRow[] {
  const normalizedQuery = String(queryText || '').trim();
  if (!normalizedQuery) {
    return cards;
  }

  const parsed = parseQuery(normalizedQuery);
  const filtered = cards.filter((card) => matchesParsedQuery(card as BrowserCard, parsed));
  if (filtered.length > 0 || !options?.secondaryField) {
    return filtered;
  }

  const query = normalizeSimpleQuery(queryText);
  if (!query) {
    return filtered;
  }
  return cards.filter((card) => {
    const content = card.content?.toLowerCase() || '';
    if (content.includes(query)) {
      return true;
    }
    if (options.secondaryField === 'fullContent') {
      return card.fullContent?.toLowerCase().includes(query) || false;
    }
    return (card as BrowserCardWithHeadline).headline?.toLowerCase().includes(query) || false;
  });
}

export function applyQueueFilters<TRow extends QueueFilterRowLike>(
  cards: TRow[],
  options: QueueFilterOptions,
  querySecondaryField: QuerySecondaryField = 'headline',
): TRow[] {
  let result = cards;
  result = applyBrowserCdfDiagnosticVisibility(result, options.preset);
  result = applyDocFilter(result, options.docId, options.scopeDocIds);
  result = applyLegacyPresetFilter(result, options.preset);
  result = applySimpleQueryFilter(result, options.queryText, { secondaryField: querySecondaryField });
  result = applyCardTypeFilter(result, options.cardType);
  return result;
}

export function applyQueueFiltersToSnapshotRows(
  rows: QueueSnapshotRow[],
  options: QueueFilterOptions,
  querySecondaryField: QuerySecondaryField = 'headline',
): QueueSnapshotRow[] {
  return applyQueueFilters(rows, options, querySecondaryField);
}
