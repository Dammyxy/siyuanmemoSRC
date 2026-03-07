import type { BrowserCard } from '../types';
import { formatDueDate, formatHistoryDate } from '../types';

export type SortValueType = 'number' | 'date' | 'string' | 'boolean';

export interface SortDisplayContract {
  colId: string;
  aliases?: string[];
  valueType: SortValueType;
  getRawValue: (row: BrowserCard) => unknown;
  formatDisplayValue?: (row: BrowserCard) => string;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
}

function formatNumberValue(value: unknown): string {
  const parsed = toFiniteNumber(value);
  return parsed == null ? '-' : String(parsed);
}

const SORT_DISPLAY_CONTRACTS: ReadonlyArray<SortDisplayContract> = Object.freeze([
  {
    colId: 'priority',
    valueType: 'number',
    getRawValue: (row) => row.priority,
    formatDisplayValue: (row) => formatNumberValue(row.priority),
  },
  {
    colId: 'interval',
    valueType: 'number',
    getRawValue: (row) => row.interval,
    formatDisplayValue: (row) => formatNumberValue(row.interval),
  },
  {
    colId: 'reps',
    valueType: 'number',
    getRawValue: (row) => row.reps,
    formatDisplayValue: (row) => formatNumberValue(row.reps),
  },
  {
    colId: 'lapses',
    valueType: 'number',
    getRawValue: (row) => row.lapses,
    formatDisplayValue: (row) => formatNumberValue(row.lapses),
  },
  {
    colId: 'retrievability',
    valueType: 'number',
    getRawValue: (row) => row.retrievability,
    formatDisplayValue: (row) => formatNumberValue(row.retrievability),
  },
  {
    colId: 'difficulty',
    valueType: 'number',
    getRawValue: (row) => row.difficulty,
    formatDisplayValue: (row) => formatNumberValue(row.difficulty),
  },
  {
    colId: 'stability',
    valueType: 'number',
    getRawValue: (row) => row.stability,
    formatDisplayValue: (row) => formatNumberValue(row.stability),
  },
  {
    colId: 'due',
    aliases: ['dueFormatted'],
    valueType: 'date',
    getRawValue: (row) => row.due,
    formatDisplayValue: (row) => formatDueDate(toDateValue(row.due)),
  },
  {
    colId: 'lastReview',
    aliases: ['lastReviewFormatted'],
    valueType: 'date',
    getRawValue: (row) => row.lastReview,
    formatDisplayValue: (row) => formatHistoryDate(toDateValue(row.lastReview)),
  },
  {
    colId: 'firstReview',
    aliases: ['firstReviewFormatted'],
    valueType: 'date',
    getRawValue: (row) => row.firstReview,
    formatDisplayValue: (row) => formatHistoryDate(toDateValue(row.firstReview)),
  },
]);

const CONTRACT_BY_COL_ID = new Map<string, SortDisplayContract>();
for (const contract of SORT_DISPLAY_CONTRACTS) {
  CONTRACT_BY_COL_ID.set(contract.colId, contract);
  for (const alias of contract.aliases || []) {
    CONTRACT_BY_COL_ID.set(alias, contract);
  }
}

export function getSortDisplayContract(colId: unknown): SortDisplayContract | null {
  if (typeof colId !== 'string') {
    return null;
  }

  const normalized = colId.trim();
  if (!normalized) {
    return null;
  }

  return CONTRACT_BY_COL_ID.get(normalized) || null;
}

export function normalizeSortContractColId(colId: unknown): string | null {
  const contract = getSortDisplayContract(colId);
  if (contract) {
    return contract.colId;
  }

  if (typeof colId !== 'string') {
    return null;
  }

  const normalized = colId.trim();
  return normalized || null;
}

export function getSortContractRawValue(row: BrowserCard, colId: unknown): unknown {
  const contract = getSortDisplayContract(colId);
  if (contract) {
    return contract.getRawValue(row);
  }

  const normalizedColId = normalizeSortContractColId(colId);
  if (!normalizedColId) {
    return undefined;
  }

  return (row as unknown as Record<string, unknown>)?.[normalizedColId];
}

export function getSortContractValueType(colId: unknown): SortValueType | null {
  return getSortDisplayContract(colId)?.valueType || null;
}

export function formatSortContractDisplayValue(row: BrowserCard, colId: unknown): string | null {
  const contract = getSortDisplayContract(colId);
  if (!contract || typeof contract.formatDisplayValue !== 'function') {
    return null;
  }

  return contract.formatDisplayValue(row);
}
