import type { BreadcrumbItem } from '@/core/card/common/application/types';
import {
  normalizeBreadcrumbName,
  normalizeRawBreadcrumbs,
} from '@/core/card/common/application/breadcrumbNormalization';
import { getBlockBreadcrumb, getDocInfo, listNotebooks, sql } from '@/infrastructure/siyuan/api';
import { isIgnorableMissingBlockError } from '@/application/usecases/card/shared/SiyuanBlockErrorClassifier';
import { escapeSQL } from '@/utils/sqlOptimizer';
import { createLogger } from '@/utils/logger';
import type { BrowserCard } from '../types';

const logger = createLogger('PreviewBreadcrumbData');
const PREVIEW_BREADCRUMB_CACHE_LIMIT = 100;
const breadcrumbCache = new Map<string, BreadcrumbItem[]>();
const notebookNameCache = new Map<string, string>();
let notebookCacheHydrationPromise: Promise<void> | null = null;

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

type NotebookLike = {
  id?: unknown;
  name?: unknown;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function logPreviewInfoFallback(message: string, error: unknown): void {
  if (isIgnorableMissingBlockError(error)) {
    logger.debug(message, error);
    return;
  }
  logger.warn(message, error);
}

function isDocumentType(type: string): boolean {
  return type === 'NodeDocument' || type === 'd';
}

function isNotebookType(type: string): boolean {
  return type === 'Notebook';
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

function cacheBreadcrumbTrail(cacheKey: string, trail: BreadcrumbItem[]): BreadcrumbItem[] {
  breadcrumbCache.set(cacheKey, trail.map((item) => ({ ...item })));
  if (breadcrumbCache.size > PREVIEW_BREADCRUMB_CACHE_LIMIT) {
    const oldestKey = breadcrumbCache.keys().next().value;
    if (oldestKey) {
      breadcrumbCache.delete(oldestKey);
    }
  }
  return trail;
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
    logPreviewInfoFallback(
      '[PreviewBreadcrumbData] Failed to fetch document info, falling back to card metadata',
      error,
    );
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

async function hydrateNotebookNameCache(): Promise<void> {
  if (notebookCacheHydrationPromise) {
    return notebookCacheHydrationPromise;
  }

  notebookCacheHydrationPromise = (async () => {
    const notebooks = await listNotebooks();
    for (const notebook of notebooks as NotebookLike[]) {
      const notebookId = readString(notebook.id);
      const notebookName = readString(notebook.name);
      if (!notebookId || !notebookName) {
        continue;
      }
      notebookNameCache.set(notebookId, notebookName);
    }
  })();

  try {
    await notebookCacheHydrationPromise;
  }
  finally {
    notebookCacheHydrationPromise = null;
  }
}

async function resolveNotebookName(box: string): Promise<string> {
  const notebookId = readString(box);
  if (!notebookId) {
    return '';
  }

  const cached = notebookNameCache.get(notebookId);
  if (cached) {
    return cached;
  }

  try {
    await hydrateNotebookNameCache();
  }
  catch (error) {
    logger.warn('[PreviewBreadcrumbData] Failed to hydrate notebook cache', error);
    return '';
  }

  return notebookNameCache.get(notebookId) || '';
}

function resolvePreviewDocumentId(
  blockId: string,
  allBreadcrumbs: BreadcrumbItem[],
  selfDocumentBreadcrumb: BreadcrumbItem | null,
  card: Pick<BrowserCard, 'blockId' | 'meta'> | null | undefined,
): string {
  if (selfDocumentBreadcrumb?.id) {
    return selfDocumentBreadcrumb.id;
  }

  const documentBreadcrumb = allBreadcrumbs.find(item => isDocumentType(readString(item.type)));
  if (documentBreadcrumb?.id) {
    return documentBreadcrumb.id;
  }

  return isSelectedDocumentCard(blockId, card) ? blockId : '';
}

async function loadPreviewDocumentInfo(
  documentId: string,
  card: Pick<BrowserCard, 'meta'> | null | undefined,
): Promise<{ box: string; path: string }> {
  let docInfo: DocumentInfoLike | null = null;

  try {
    docInfo = await getDocInfo(documentId);
  }
  catch (error) {
    logPreviewInfoFallback(
      '[PreviewBreadcrumbData] Failed to fetch preview document info, falling back to card metadata',
      error,
    );
  }

  return readDocumentInfo(docInfo, card);
}

async function prependNotebookBreadcrumb(
  trail: BreadcrumbItem[],
  documentId: string,
  card: Pick<BrowserCard, 'meta'> | null | undefined,
): Promise<BreadcrumbItem[]> {
  if (!documentId || trail.some(item => isNotebookType(readString(item.type)))) {
    return trail;
  }

  const { box } = await loadPreviewDocumentInfo(documentId, card);
  if (!box) {
    return trail;
  }

  const notebookName = await resolveNotebookName(box);
  if (!notebookName) {
    return trail;
  }

  return [
    {
      id: `notebook:${box}`,
      name: notebookName,
      type: 'Notebook',
    },
    ...trail,
  ];
}

function resolveSelectedDocumentSelfBreadcrumb(
  blockId: string,
  card: Pick<BrowserCard, 'blockId' | 'meta' | 'content' | 'fullContent'> | null | undefined,
  allBreadcrumbs: BreadcrumbItem[],
): BreadcrumbItem | null {
  const selfBreadcrumb = allBreadcrumbs.find(item => item.id === blockId);
  if (selfBreadcrumb && isDocumentType(readString(selfBreadcrumb.type))) {
    return selfBreadcrumb;
  }

  if (!isSelectedDocumentCard(blockId, card)) {
    return null;
  }

  const name = normalizeBreadcrumbName(
    readString(card?.fullContent)
      || readString(card?.meta?.content)
      || readString(card?.content),
  );
  if (!name) {
    return null;
  }

  return {
    id: blockId,
    name,
    type: 'NodeDocument',
  };
}

export async function loadPreviewBreadcrumbTrail(
  blockId: string,
  card: Pick<BrowserCard, 'blockId' | 'meta' | 'content' | 'fullContent'> | null | undefined,
): Promise<BreadcrumbItem[]> {
  const trimTrailingCount = getPreviewBreadcrumbTrimCount(card);
  const cacheKey = [blockId, String(trimTrailingCount)].join(':');
  const cached = breadcrumbCache.get(cacheKey);
  if (cached) {
    breadcrumbCache.delete(cacheKey);
    breadcrumbCache.set(cacheKey, cached);
    return cached.map((item) => ({ ...item }));
  }

  const rawBreadcrumbs = await getBlockBreadcrumb(blockId);
  const allBreadcrumbs = normalizeRawBreadcrumbs(rawBreadcrumbs, {
    trimTrailingCount: 0,
  });
  const selfDocumentBreadcrumb = resolveSelectedDocumentSelfBreadcrumb(blockId, card, allBreadcrumbs);
  const documentId = resolvePreviewDocumentId(blockId, allBreadcrumbs, selfDocumentBreadcrumb, card);
  const normalizedTrail = normalizeRawBreadcrumbs(rawBreadcrumbs, {
    trimTrailingCount,
  }).filter(item => item.id !== blockId);

  if (!selfDocumentBreadcrumb || normalizedTrail.length > 0) {
    const trail = await prependNotebookBreadcrumb(normalizedTrail, documentId, card);
    return cacheBreadcrumbTrail(cacheKey, trail);
  }

  try {
    const documentParentTrail = await loadDocumentParentTrail(blockId, card);
    const documentTrail = documentParentTrail.length > 0 ? documentParentTrail : [selfDocumentBreadcrumb];
    const trail = await prependNotebookBreadcrumb(documentTrail, documentId, card);
    return cacheBreadcrumbTrail(cacheKey, trail);
  }
  catch (error) {
    logPreviewInfoFallback('[PreviewBreadcrumbData] Failed to resolve document parent trail', error);
    const trail = await prependNotebookBreadcrumb([selfDocumentBreadcrumb], documentId, card);
    return cacheBreadcrumbTrail(cacheKey, trail);
  }
}
