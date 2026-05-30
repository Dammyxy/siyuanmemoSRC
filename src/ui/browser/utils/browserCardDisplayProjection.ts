import type { BrowserCard } from '../types';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface BrowserCardDisplayProjection {
  structureKind: 'list-template' | 'default';
  breadcrumbTrimCount: number;
  legacyProjectionUsed: boolean;
}

export function buildBrowserCardDisplayProjection(
  card: Pick<BrowserCard, 'meta'> | null | undefined,
): BrowserCardDisplayProjection {
  const templateId = readString(card?.meta?.templateID);
  const isListTemplate = templateId === 'builtin-list-item';

  return {
    structureKind: isListTemplate ? 'list-template' : 'default',
    breadcrumbTrimCount: isListTemplate ? 2 : 1,
    legacyProjectionUsed: Boolean(templateId),
  };
}
