import type { GridApi } from 'ag-grid-community';
import type { PresetFilter } from '@/application/queries/browser/GetBrowserCardsQuery';
import type { SortModel } from './datasource/types';
import type { BrowserCard, CardTypeFilter } from './types';
import { resolveBrowserCardStableId } from './utils/browserCardIdentity';

type BrowserTranslate = (key: string, fallback: string) => string;

export type BrowserSelectionContextFingerprintInput = {
  activeDocId: string | null;
  activeQueueId: string | null;
  activeScopeDocIds: string[] | null;
  cardType: CardTypeFilter;
  preset: PresetFilter;
  queryFingerprint?: string | null;
  queryText: string;
  sortModel: SortModel[];
};

export type BrowserFilterSummaryInput = {
  activeDocId: string | null;
  activeQueueId: string | null;
  activeScopeDocIds: string[] | null;
  cardType: CardTypeFilter;
  hasActiveScopeDocIds: boolean;
  preset: PresetFilter;
  queryText: string;
  t: BrowserTranslate;
};

export function isBrowserGridApiAlive<TData = unknown>(
  api: GridApi<TData> | null | undefined,
): api is GridApi<TData> {
  if (!api) {
    return false;
  }
  if (typeof api.isDestroyed === 'function' && api.isDestroyed()) {
    return false;
  }
  return true;
}

export function resolveBrowserCardSelectionId(card: BrowserCard | null | undefined): string {
  return resolveBrowserCardStableId(card);
}

export function buildBrowserSelectionContextFingerprint(
  input: BrowserSelectionContextFingerprintInput,
): string {
  if (input.queryFingerprint) {
    return input.queryFingerprint;
  }

  return JSON.stringify({
    queueId: input.activeQueueId || '',
    scopeDocIds: input.activeScopeDocIds || [],
    docId: input.activeDocId || '',
    preset: input.preset,
    queryText: input.queryText,
    cardType: input.cardType,
    sortModel: input.sortModel,
  });
}

export function describeBrowserFilterSummary(input: BrowserFilterSummaryInput): string {
  const parts: string[] = [];
  const scopeLabel = input.activeQueueId || input.t('allCards', 'All');
  parts.push(`${input.t('scope', 'Scope')}: ${scopeLabel}`);

  if (input.hasActiveScopeDocIds) {
    parts.push(
      `${input.t('docTreeScope', 'Doc Tree Scope')}: ${String(input.activeScopeDocIds?.length || 0)}`,
    );
  }
  if (input.activeDocId) {
    parts.push(`${input.t('document', 'Document')}: ${input.activeDocId}`);
  }
  if (input.preset && input.preset !== 'all') {
    parts.push(`${input.t('preset', 'Preset')}: ${input.preset}`);
  }
  if (input.cardType && input.cardType !== 'all') {
    parts.push(`${input.t('cardType', 'Card Type')}: ${input.cardType}`);
  }
  if (input.queryText.trim()) {
    parts.push(`${input.t('search', 'Search')}: ${input.queryText.trim()}`);
  }
  return parts.join(' · ');
}

export function isBrowserNodeInSelectionScope(
  api: GridApi<BrowserCard>,
  rowIndex: number | null | undefined,
  options: {
    defaultPageSize: number;
    paginationEnabled: boolean;
  },
): boolean {
  if (!options.paginationEnabled) {
    return true;
  }
  if (!Number.isFinite(rowIndex)) {
    return false;
  }

  const currentPage = Number(api.paginationGetCurrentPage?.() ?? 0);
  const pageSizeCandidate = Number(api.paginationGetPageSize?.() ?? options.defaultPageSize);
  const pageSize = Number.isFinite(pageSizeCandidate) && pageSizeCandidate > 0
    ? Math.floor(pageSizeCandidate)
    : options.defaultPageSize;
  const startRow = Math.max(0, currentPage) * pageSize;
  const endRow = startRow + pageSize;

  return Number(rowIndex) >= startRow && Number(rowIndex) < endRow;
}

export function collectScopedBrowserSelectionIds(
  api: GridApi<BrowserCard>,
  options: {
    defaultPageSize: number;
    paginationEnabled: boolean;
  },
): { visibleIds: string[]; selectedIds: string[] } {
  const visibleIds: string[] = [];
  const selectedIds: string[] = [];

  api.forEachNode((node) => {
    if (!isBrowserNodeInSelectionScope(api, node.rowIndex, options)) {
      return;
    }
    const row = node.data as BrowserCard | undefined;
    const id = resolveBrowserCardSelectionId(row);
    if (!id) {
      return;
    }
    visibleIds.push(id);
    if (node.isSelected()) {
      selectedIds.push(id);
    }
  });

  return { visibleIds, selectedIds };
}
