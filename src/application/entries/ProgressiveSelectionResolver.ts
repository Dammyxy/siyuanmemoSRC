import type { IProtyle } from 'siyuan';

export interface ProgressiveSelectionResult {
  blockId: string;
  text: string;
}

export interface ProgressiveExcerptSelectionSnapshot extends ProgressiveSelectionResult {
  range: Range;
  commonElement: HTMLElement;
  root: HTMLElement | null;
  protyle: IProtyle | null;
}

type ProgressiveSelectionResolveOptions = {
  root?: HTMLElement | null;
  protyle?: unknown;
  resolveProtyle?: (commonElement: HTMLElement) => unknown;
};

function getElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }
  if (node instanceof HTMLElement) {
    return node;
  }
  return node.parentElement;
}

function getProtyleFromUnknown(value: unknown): IProtyle | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const direct = value as {
    wysiwyg?: { element?: HTMLElement };
  };
  if (direct.wysiwyg?.element instanceof HTMLElement) {
    return direct as IProtyle;
  }

  const nested = (value as {
    protyle?: {
      wysiwyg?: { element?: HTMLElement };
    };
  }).protyle;
  if (nested?.wysiwyg?.element instanceof HTMLElement) {
    return nested as IProtyle;
  }

  const getInstance = (value as { getInstance?: () => unknown }).getInstance;
  if (typeof getInstance === 'function') {
    return getProtyleFromUnknown(getInstance.call(value));
  }

  return null;
}

function getPotentialProtyleHosts(commonElement: HTMLElement): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const hosts: HTMLElement[] = [];
  const candidates = [
    commonElement,
    commonElement.closest<HTMLElement>('.protyle-wysiwyg'),
    commonElement.closest<HTMLElement>('.protyle-content'),
    commonElement.closest<HTMLElement>('.protyle'),
  ];

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    hosts.push(candidate);
  }

  return hosts;
}

function resolveNativeProtyleFromElement(commonElement: HTMLElement): IProtyle | null {
  const hosts = getPotentialProtyleHosts(commonElement);
  for (const host of hosts) {
    const candidates = [
      host,
      (host as { protyle?: unknown }).protyle,
      (host as { __protyle?: unknown }).__protyle,
      (host as { __vnode__?: { ctx?: { protyle?: unknown } } }).__vnode__?.ctx?.protyle,
      (host as { __vnode__?: { component?: { ctx?: { protyle?: unknown } } } }).__vnode__?.component?.ctx?.protyle,
      (host as { __vueParentComponent?: { ctx?: { protyle?: unknown }; protyle?: unknown } }).__vueParentComponent?.ctx?.protyle,
      (host as { __vueParentComponent?: { ctx?: { protyle?: unknown }; protyle?: unknown } }).__vueParentComponent?.protyle,
    ];

    for (const candidate of candidates) {
      const resolved = getProtyleFromUnknown(candidate);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function getClosestBlockId(node: Node | null): string | null {
  const element = getElementFromNode(node);
  const blockElement = element?.closest<HTMLElement>('[data-node-id]') || null;
  const blockId = blockElement?.getAttribute('data-node-id');
  return typeof blockId === 'string' && blockId.trim().length > 0 ? blockId.trim() : null;
}

function getSelectionCommonElement(options?: {
  root?: HTMLElement | null;
}): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  const commonElement = commonAncestor instanceof HTMLElement ? commonAncestor : commonAncestor.parentElement;
  if (!commonElement) {
    return null;
  }

  const root = options?.root;
  if (root && !root.contains(commonElement)) {
    return null;
  }

  return commonElement;
}

export function resolveProgressiveExcerptSelectionSnapshot(
  options?: ProgressiveSelectionResolveOptions,
): ProgressiveExcerptSelectionSnapshot | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const commonElement = getSelectionCommonElement(options);
  if (!commonElement) {
    return null;
  }

  const range = selection.getRangeAt(0);

  const startBlockId = getClosestBlockId(range.startContainer);
  const endBlockId = getClosestBlockId(range.endContainer);
  if (!startBlockId || !endBlockId || startBlockId !== endBlockId) {
    return null;
  }

  const text = selection.toString().trim();
  if (!text) {
    return null;
  }

  return {
    blockId: startBlockId,
    text,
    range: range.cloneRange(),
    commonElement,
    root: options?.root || null,
    protyle: getProtyleFromUnknown(options?.protyle)
      || (typeof options?.resolveProtyle === 'function'
        ? getProtyleFromUnknown(options.resolveProtyle(commonElement))
        : null)
      || resolveNativeProtyleFromElement(commonElement),
  };
}

export function resolveProgressiveSelection(
  options?: ProgressiveSelectionResolveOptions,
): ProgressiveSelectionResult | null {
  const snapshot = resolveProgressiveExcerptSelectionSnapshot(options);
  if (!snapshot) {
    return null;
  }

  return {
    blockId: snapshot.blockId,
    text: snapshot.text,
  };
}

export function isProgressiveSelectionInsideNativeProtyle(options?: {
  root?: HTMLElement | null;
}): boolean {
  const commonElement = getSelectionCommonElement(options);
  return Boolean(commonElement?.closest('.protyle'));
}
