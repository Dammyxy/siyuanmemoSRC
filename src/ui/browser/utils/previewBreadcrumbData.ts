import type { BreadcrumbItem } from '@/core/card/common/application/types';
import {
  normalizeBreadcrumbName,
  normalizeRawBreadcrumbs,
} from '@/core/card/common/application/breadcrumbNormalization';
import { getBlockBreadcrumb, getDocInfo, sql } from '@/infrastructure/siyuan/api';
import { escapeSQL } from '@/utils/sqlOptimizer';
import { createLogger } from '@/utils/logger';
import type { BrowserCard } from '../types';

const logger = createLogger('PreviewBreadcrumbData');

type DocumentInfoLike = {
  box?: unknown;
  path?: unknown;
};

type DocumentBreadcrumbRow = {
  id?: unknown;
  content?: unknown;
  hpath?: unknown;
  path?: unknown;
  type?: unknown;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isSelectedDocumentCard(
  blockId: string,
  card: Pick<BrowserCard, 'blockId' | 'meta'> | null | undefined,
): boolean {
  if (!card || card.blockId !== blockId) {
    return false;
  }

  return card.meta?.isDocument === true || card.meta?.blockType === 'd';
}

function readDocumentInfo(
  docInfo: DocumentInfoLike | null | undefined,
  card: Pick<BrowserCard, 'meta'> | null | undefined,
): { box: string; path: string } {
  const box = readString(docInfo?.box) || readString(card?.meta?.box);
  const path = readString(docInfo?.path) || readString(card?.meta?.path);
  return { box, path };
}

function resolveDocumentRowName(row: DocumentBreadcrumbRow): string {
  const content = normalizeBreadcrumbName(readString(row.content));
  if (content) {
    return content;
  }

  const lastHPathSegment = readString(row.hpath).split('/').pop() || '';
  const normalizedHPathSegment = normalizeBreadcrumbName(lastHPathSegment);
  if (normalizedHPathSegment) {
    return normalizedHPathSegment;
  }

  return readString(row.id);
}

export function getPreviewBreadcrumbTrimCount(
  card: Pick<BrowserCard, 'meta'> | null | undefined,
): number {
  return card?.meta?.templateID === 'builtin-list-item' ? 2 : 1;
}

export function deriveAncestorDocumentPaths(documentPath: string): string[] {
  const segments = documentPath.split('/').filter(Boolean);
  const documentPaths: string[] = [];
  let currentPath = '';

  for (const segment of segments) {
    currentPath += `/${segment}`;
    if (segment.endsWith('.sy')) {
      documentPaths.push(currentPath);
    }
  }

  return documentPaths.slice(0, -1);
}

async function loadDocumentParentTrail(
  blockId: string,
  card: Pick<BrowserCard, 'meta'> | null | undefined,
): Promise<BreadcrumbItem[]> {
  let docInfo: DocumentInfoLike | null = null;

  try {
    docInfo = await getDocInfo(blockId);
  }
  catch (error) {
    logger.warn('[PreviewBreadcrumbData] Failed to fetch document info, falling back to card metadata', error);
  }

  const { box, path } = readDocumentInfo(docInfo, card);
  if (!box || !path) {
    return [];
  }

  const ancestorPaths = deriveAncestorDocumentPaths(path);
  if (ancestorPaths.length === 0) {
    return [];
  }

  const rows = await sql<DocumentBreadcrumbRow>(`
    SELECT id, content, hpath, path, type
    FROM blocks
    WHERE box = '${escapeSQL(box)}'
      AND type = 'd'
      AND path IN (${ancestorPaths.map(item => `'${escapeSQL(item)}'`).join(',')})
  `);

  const rowByPath = new Map<string, BreadcrumbItem>();
  for (const row of rows) {
    const rowPath = readString(row.path);
    if (!rowPath) {
      continue;
    }

    rowByPath.set(rowPath, {
      id: readString(row.id),
      name: resolveDocumentRowName(row),
      type: readString(row.type) || 'NodeDocument',
    });
  }

  return ancestorPaths
    .map(pathItem => rowByPath.get(pathItem))
    .filter((item): item is BreadcrumbItem => Boolean(item?.id) && Boolean(item?.name));
}

export async function loadPreviewBreadcrumbTrail(
  blockId: string,
  card: Pick<BrowserCard, 'blockId' | 'meta'> | null | undefined,
): Promise<BreadcrumbItem[]> {
  const rawBreadcrumbs = await getBlockBreadcrumb(blockId);
  const normalizedTrail = normalizeRawBreadcrumbs(rawBreadcrumbs, {
    trimTrailingCount: getPreviewBreadcrumbTrimCount(card),
  }).filter(item => item.id !== blockId);

  if (!isSelectedDocumentCard(blockId, card) || normalizedTrail.length > 0) {
    return normalizedTrail;
  }

  try {
    const documentParentTrail = await loadDocumentParentTrail(blockId, card);
    return documentParentTrail.length > 0 ? documentParentTrail : normalizedTrail;
  }
  catch (error) {
    logger.warn('[PreviewBreadcrumbData] Failed to resolve document parent trail', error);
    return normalizedTrail;
  }
}
