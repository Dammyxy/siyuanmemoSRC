export type ReviewRichContentTargetKind =
  | 'block'
  | 'external'
  | 'asset'
  | 'unsafe'
  | 'unknown';

export interface ReviewRichContentTarget {
  kind: ReviewRichContentTargetKind;
  href?: string;
  blockId?: string;
  element?: HTMLElement;
}

export interface ReviewRichContentNavigationHandlers {
  openBlock?: (blockId: string) => void | Promise<void>;
  openExternal?: (href: string) => void | Promise<void>;
  openAsset?: (href: string) => void | Promise<void>;
  onUnsafeTarget?: (target: ReviewRichContentTarget) => void;
}

export interface ReviewRichContentNavigationResult {
  handled: boolean;
  target: ReviewRichContentTarget | null;
}

function normalizeTarget(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function resolveSiyuanBlockIdFromHref(href: string): string {
  const match = /^siyuan:\/\/blocks\/([^/?#]+)/iu.exec(href.trim());
  return match?.[1]?.trim() ?? '';
}

export function isReviewRichContentAssetTarget(href: string): boolean {
  return /^(?:\.{0,2}\/)?assets\//iu.test(href) || /^\/assets\//iu.test(href);
}

export function isReviewRichContentExternalTarget(href: string): boolean {
  return /^https?:\/\//iu.test(href);
}

export function isReviewRichContentUnsafeTarget(href: string): boolean {
  const normalized = normalizeTarget(href).toLowerCase();
  return normalized.length > 0
    && !isReviewRichContentExternalTarget(normalized)
    && !isReviewRichContentAssetTarget(normalized)
    && !resolveSiyuanBlockIdFromHref(normalized)
    && !normalized.startsWith('#')
    && !normalized.startsWith('/');
}

export function resolveReviewRichContentTarget(eventTarget: EventTarget | null): ReviewRichContentTarget | null {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const element = eventTarget.closest(
    '[data-type~="block-ref"][data-id], a[href], [data-type~="a"][data-href], [data-href]',
  );
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const dataType = element.getAttribute('data-type') || '';
  if (dataType.split(/\s+/u).includes('block-ref')) {
    const blockId = normalizeTarget(element.getAttribute('data-id'));
    if (!blockId) {
      return null;
    }
    return {
      kind: 'block',
      blockId,
      element,
    };
  }

  const href = normalizeTarget(element.getAttribute('href') || element.getAttribute('data-href'));
  if (!href) {
    return null;
  }

  const blockId = resolveSiyuanBlockIdFromHref(href);
  if (blockId) {
    return {
      kind: 'block',
      href,
      blockId,
      element,
    };
  }

  if (isReviewRichContentAssetTarget(href)) {
    return {
      kind: 'asset',
      href,
      element,
    };
  }

  if (isReviewRichContentExternalTarget(href)) {
    return {
      kind: 'external',
      href,
      element,
    };
  }

  if (isReviewRichContentUnsafeTarget(href)) {
    return {
      kind: 'unsafe',
      href,
      element,
    };
  }

  return {
    kind: 'unknown',
    href,
    element,
  };
}

function openExternalByDefault(href: string): void {
  const opener = window.open;
  if (typeof opener === 'function') {
    opener.call(window, href, '_blank', 'noopener,noreferrer');
  }
}

export function routeReviewRichContentClick(
  event: MouseEvent,
  handlers: ReviewRichContentNavigationHandlers,
): ReviewRichContentNavigationResult {
  const target = resolveReviewRichContentTarget(event.target);
  if (!target) {
    return {
      handled: false,
      target: null,
    };
  }

  if (target.kind === 'block' && target.blockId) {
    event.preventDefault();
    event.stopPropagation();
    void handlers.openBlock?.(target.blockId);
    return {
      handled: true,
      target,
    };
  }

  if (target.kind === 'external' && target.href) {
    event.preventDefault();
    event.stopPropagation();
    if (handlers.openExternal) {
      void handlers.openExternal(target.href);
    } else {
      openExternalByDefault(target.href);
    }
    return {
      handled: true,
      target,
    };
  }

  if (target.kind === 'asset' && target.href) {
    event.preventDefault();
    event.stopPropagation();
    if (handlers.openAsset) {
      void handlers.openAsset(target.href);
    } else {
      openExternalByDefault(target.href);
    }
    return {
      handled: true,
      target,
    };
  }

  if (target.kind === 'unsafe') {
    event.preventDefault();
    event.stopPropagation();
    handlers.onUnsafeTarget?.(target);
    return {
      handled: true,
      target,
    };
  }

  return {
    handled: false,
    target,
  };
}
