import type { BreadcrumbItem } from './types';

type RawBreadcrumbItem = {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  content?: unknown;
  hPath?: unknown;
  type?: unknown;
};

export interface NormalizeRawBreadcrumbOptions {
  trimTrailingCount?: number;
  clipAtLastDocument?: boolean;
  cleanDisplayName?: boolean;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isDocumentType(type: string): boolean {
  return type === 'NodeDocument' || type === 'd';
}

function resolveRawBreadcrumbName(item: RawBreadcrumbItem, cleanDisplayName: boolean): string {
  const candidates = [item.name, item.title, item.content, item.hPath];
  for (const candidate of candidates) {
    const value = readString(candidate).trim();
    if (!value) {
      continue;
    }

    return cleanDisplayName ? normalizeBreadcrumbName(value) : value;
  }

  return '';
}

export function normalizeBreadcrumbName(name: string): string {
  return String(name || '')
    .replace(/^[\u2022\-*0-9]+\.?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trimTrailingBreadcrumbs<T>(items: T[], count: number = 1): T[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const normalizedCount = Math.max(0, count);
  if (normalizedCount === 0) {
    return [...items];
  }

  return items.slice(0, Math.max(0, items.length - normalizedCount));
}

export function dedupeBreadcrumbsById<T extends BreadcrumbItem>(items: T[]): T[] {
  const seenIds = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const id = readString(item.id).trim();
    const name = readString(item.name).trim();
    if (!id || !name || seenIds.has(id)) {
      continue;
    }

    result.push({
      ...item,
      id,
      name,
      type: readString(item.type) || 'NodeParagraph',
    } as T);
    seenIds.add(id);
  }

  return result;
}

export function clipBreadcrumbsAtLastDocument(items: BreadcrumbItem[]): BreadcrumbItem[] {
  let lastDocumentIndex = -1;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (isDocumentType(items[index]?.type || '')) {
      lastDocumentIndex = index;
      break;
    }
  }

  return lastDocumentIndex >= 0 ? items.slice(0, lastDocumentIndex + 1) : [...items];
}

export function normalizeRawBreadcrumbs(
  rawBreadcrumbs: unknown,
  options: NormalizeRawBreadcrumbOptions = {},
): BreadcrumbItem[] {
  if (!Array.isArray(rawBreadcrumbs)) {
    return [];
  }

  const sourceItems = trimTrailingBreadcrumbs(rawBreadcrumbs, options.trimTrailingCount ?? 1);
  const cleanDisplayName = options.cleanDisplayName !== false;
  const normalizedItems: BreadcrumbItem[] = [];

  for (const raw of sourceItems) {
    if (typeof raw !== 'object' || raw === null) {
      continue;
    }

    const item = raw as RawBreadcrumbItem;
    const id = readString(item.id).trim();
    const name = resolveRawBreadcrumbName(item, cleanDisplayName);
    if (!id || !name) {
      continue;
    }

    normalizedItems.push({
      id,
      name,
      type: readString(item.type) || 'NodeParagraph',
    });
  }

  const dedupedItems = dedupeBreadcrumbsById(normalizedItems);
  return options.clipAtLastDocument ? clipBreadcrumbsAtLastDocument(dedupedItems) : dedupedItems;
}
