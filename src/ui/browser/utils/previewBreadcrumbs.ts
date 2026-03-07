import type { BreadcrumbItem } from '@/core/card/common/application/types';
import type { BrowserCard } from '../types';

export function isDocumentPreviewType(type: string | null | undefined): boolean {
  return type === 'NodeDocument' || type === 'd';
}

export function resolvePreviewTargetType(params: {
  card: BrowserCard | null;
  activePreviewBlockId: string;
  breadcrumbs: BreadcrumbItem[];
}): string {
  const { activePreviewBlockId, breadcrumbs, card } = params;
  if (!activePreviewBlockId) {
    return '';
  }

  if (card?.blockId === activePreviewBlockId) {
    if (card.meta?.isDocument) {
      return 'NodeDocument';
    }

    const selectedBreadcrumb = breadcrumbs.find(item => item.id === activePreviewBlockId);
    if (selectedBreadcrumb && isDocumentPreviewType(selectedBreadcrumb.type)) {
      return 'NodeDocument';
    }

    const blockType = typeof card.meta?.blockType === 'string'
      ? card.meta.blockType
      : '';
    return blockType === 'd' ? 'NodeDocument' : blockType;
  }

  return breadcrumbs.find(item => item.id === activePreviewBlockId)?.type || '';
}

export function resolvePreviewDocumentTitle(params: {
  card: BrowserCard | null;
  activePreviewBlockId: string;
  activePreviewType: string;
  breadcrumbs: BreadcrumbItem[];
}): string {
  const {
    activePreviewBlockId,
    activePreviewType,
    breadcrumbs,
    card,
  } = params;

  if (!activePreviewBlockId || !isDocumentPreviewType(activePreviewType)) {
    return '';
  }

  if (card?.blockId === activePreviewBlockId) {
    const fullContent = typeof card.fullContent === 'string'
      ? card.fullContent.trim()
      : '';
    if (fullContent) {
      return fullContent;
    }

    const metaContent = typeof card.meta?.content === 'string'
      ? card.meta.content.trim()
      : '';
    if (metaContent) {
      return metaContent;
    }

    const content = typeof card.content === 'string'
      ? card.content.trim()
      : '';
    if (content) {
      return content;
    }
  }

  return breadcrumbs.find(item => item.id === activePreviewBlockId)?.name || '';
}
