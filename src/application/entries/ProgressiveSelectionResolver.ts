export interface ProgressiveSelectionResult {
  blockId: string;
  text: string;
}

function getElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }
  if (node instanceof HTMLElement) {
    return node;
  }
  return node.parentElement;
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

export function resolveProgressiveSelection(options?: {
  root?: HTMLElement | null;
}): ProgressiveSelectionResult | null {
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
  };
}

export function isProgressiveSelectionInsideNativeProtyle(options?: {
  root?: HTMLElement | null;
}): boolean {
  const commonElement = getSelectionCommonElement(options);
  return Boolean(commonElement?.closest('.protyle'));
}
