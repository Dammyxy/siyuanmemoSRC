import type { SortModel } from '../types';
import { normalizeSortModel } from '../../utils/sortModel';

export function normalizeBrowserQueryScopeDocIds(scopeDocIds?: readonly unknown[] | null): string[] | null {
  if (!Array.isArray(scopeDocIds)) {
    return null;
  }

  const normalized = Array.from(new Set(
    Array.from(scopeDocIds)
      .map((docId) => String(docId || '').trim())
      .filter(Boolean)
  ));

  return normalized.length > 0 ? normalized : null;
}

export function normalizeBrowserQuerySortModel(sortModel?: SortModel[] | null): SortModel[] {
  return normalizeSortModel(sortModel);
}

export function normalizeBrowserQueryIds(ids?: readonly unknown[] | null): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  return Array.from(new Set(
    Array.from(ids)
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ));
}
