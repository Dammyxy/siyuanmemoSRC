import type { IProtyle } from 'siyuan';

export interface ProgressiveExcerptBlockSelectionSnapshot {
  blockId: string;
  mode: 'range' | 'full-block';
  excerptHtml: string;
  beforeHtml?: string;
  afterHtml?: string;
  range?: Range;
}

export interface ProgressiveSelectionResult {
  blockId: string;
  sourceBlockId: string;
  sourceBlockIds: string[];
  text: string;
  contentDom: string;
}

export interface ProgressiveExcerptSelectionSnapshot extends ProgressiveSelectionResult {
  range: Range;
  blockSelections: ProgressiveExcerptBlockSelectionSnapshot[];
  commonElement: HTMLElement;
  root: HTMLElement | null;
  protyle: IProtyle | null;
}

type ProgressiveSelectionResolveOptions = {
  root?: HTMLElement | null;
  protyle?: unknown;
  resolveProtyle?: (commonElement: HTMLElement) => unknown;
};

type ProgressiveBlockSnapshotResolveOptions = {
  root?: HTMLElement | null;
  protyle?: unknown;
};

const SIYUAN_SELECTED_BLOCK_SELECTOR = '.protyle-wysiwyg--select';

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

function normalizeNodeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getClosestBlockElement(node: Node | null): HTMLElement | null {
  const element = getElementFromNode(node);
  return element?.closest<HTMLElement>('[data-node-id]') || null;
}

function getClosestBlockId(node: Node | null): string | null {
  return normalizeNodeId(getClosestBlockElement(node)?.getAttribute('data-node-id'));
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

function resolveSelectionRoot(
  startBlock: HTMLElement,
  endBlock: HTMLElement,
  commonElement: HTMLElement,
  root?: HTMLElement | null,
): HTMLElement | null {
  if (root instanceof HTMLElement) {
    return root;
  }

  return startBlock.closest<HTMLElement>('.protyle-wysiwyg')
    || endBlock.closest<HTMLElement>('.protyle-wysiwyg')
    || commonElement.closest<HTMLElement>('.protyle-wysiwyg')
    || commonElement.closest<HTMLElement>('.protyle')
    || null;
}

function sortElementsByDocumentOrder(elements: HTMLElement[]): HTMLElement[] {
  return [...elements].sort((left, right) => {
    if (left === right) {
      return 0;
    }
    const position = left.compareDocumentPosition(right);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  });
}

function normalizeUniqueBlockElements(elements: HTMLElement[]): HTMLElement[] {
  const seen = new Set<string>();
  const normalized = sortElementsByDocumentOrder(elements)
    .map((element) => element.closest<HTMLElement>('[data-node-id]') || element)
    .filter((element): element is HTMLElement => element instanceof HTMLElement);

  const result: HTMLElement[] = [];
  for (const element of normalized) {
    const blockId = normalizeNodeId(element.getAttribute('data-node-id'));
    if (!blockId || seen.has(blockId)) {
      continue;
    }
    seen.add(blockId);
    result.push(element);
  }
  return result;
}

function collectSelectedBlockElementsFromRoot(root: HTMLElement): HTMLElement[] {
  const selected = Array.from(root.querySelectorAll<HTMLElement>(SIYUAN_SELECTED_BLOCK_SELECTOR));
  if (root.matches(SIYUAN_SELECTED_BLOCK_SELECTOR)) {
    selected.unshift(root);
  }
  return selected;
}

function getSelectedBlockSearchRoots(options?: ProgressiveBlockSnapshotResolveOptions): HTMLElement[] {
  const roots: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const addRoot = (candidate: HTMLElement | null | undefined) => {
    if (!(candidate instanceof HTMLElement) || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    roots.push(candidate);
  };

  addRoot(options?.root || null);
  addRoot(getProtyleFromUnknown(options?.protyle)?.wysiwyg?.element || null);

  if (roots.length === 0 && document.body instanceof HTMLElement) {
    addRoot(document.body);
  }

  return roots;
}

function getOrderedBlocksBetween(
  startBlock: HTMLElement,
  endBlock: HTMLElement,
  root: HTMLElement | null,
): HTMLElement[] {
  if (startBlock === endBlock) {
    return [startBlock];
  }

  const scope = root || startBlock.closest<HTMLElement>('.protyle-wysiwyg') || document.body;
  const candidates = normalizeUniqueBlockElements(Array.from(scope.querySelectorAll<HTMLElement>('[data-node-id]')));
  const startIndex = candidates.findIndex((candidate) => candidate === startBlock);
  const endIndex = candidates.findIndex((candidate) => candidate === endBlock);

  if (startIndex === -1 || endIndex === -1) {
    return normalizeUniqueBlockElements([startBlock, endBlock]);
  }

  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return candidates.slice(from, to + 1);
}

function resolveBlockContentRoot(blockElement: HTMLElement): HTMLElement {
  return blockElement.querySelector<HTMLElement>('[contenteditable="true"]') || blockElement;
}

function buildNodePath(root: Node, target: Node | null): number[] | null {
  if (!target) {
    return null;
  }

  const path: number[] = [];
  let current: Node | null = target;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) {
      return null;
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    if (index < 0) {
      return null;
    }
    path.unshift(index);
    current = parent;
  }

  return current === root ? path : null;
}

function resolveNodePath(root: Node, path: number[]): Node | null {
  let current: Node | null = root;
  for (const index of path) {
    current = current?.childNodes.item(index) || null;
    if (!current) {
      return null;
    }
  }
  return current;
}

function sanitizeExcerptBlock(block: HTMLElement): HTMLElement {
  const cloned = block.cloneNode(true) as HTMLElement;
  const walker = [cloned, ...Array.from(cloned.querySelectorAll<HTMLElement>('*'))];

  for (const element of walker) {
    element.classList.remove('protyle-wysiwyg--select');
    element.removeAttribute('data-node-id');
    element.removeAttribute('data-node-index');
    element.removeAttribute('id');

    for (const attributeName of Array.from(element.getAttributeNames())) {
      if (attributeName.startsWith('custom-fsrs-')) {
        element.removeAttribute(attributeName);
      }
    }
  }

  cloned.querySelectorAll('.protyle-action').forEach((element) => element.remove());
  cloned.querySelectorAll<HTMLElement>('.protyle-attr').forEach((element) => {
    element.setAttribute('contenteditable', 'false');
    element.innerHTML = '\u200b';
  });

  return cloned;
}

function extractBlockText(blockElement: HTMLElement): string {
  return String(blockElement.innerText || blockElement.textContent || '')
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createExcerptHtmlFromBlock(blockElement: HTMLElement): string | null {
  const sanitized = sanitizeExcerptBlock(blockElement);
  return extractBlockText(sanitized).length > 0 ? sanitized.outerHTML : null;
}

function createExcerptHtmlFromRangeSlice(
  blockElement: HTMLElement,
  range: Range,
  slice: 'before' | 'selected' | 'after',
): string | null {
  const startPath = buildNodePath(blockElement, range.startContainer);
  const endPath = buildNodePath(blockElement, range.endContainer);
  if (!startPath || !endPath) {
    return null;
  }

  const clonedBlock = blockElement.cloneNode(true) as HTMLElement;
  const clonedStart = resolveNodePath(clonedBlock, startPath);
  const clonedEnd = resolveNodePath(clonedBlock, endPath);
  if (!clonedStart || !clonedEnd) {
    return null;
  }

  const editableRoot = resolveBlockContentRoot(clonedBlock);
  const clonedRange = document.createRange();
  if (slice === 'before') {
    clonedRange.selectNodeContents(editableRoot);
    clonedRange.setEnd(clonedStart, range.startOffset);
  } else if (slice === 'after') {
    clonedRange.selectNodeContents(editableRoot);
    clonedRange.setStart(clonedEnd, range.endOffset);
  } else {
    clonedRange.setStart(clonedStart, range.startOffset);
    clonedRange.setEnd(clonedEnd, range.endOffset);
  }

  const fragment = clonedRange.cloneContents();
  editableRoot.replaceChildren(fragment);

  const sanitized = sanitizeExcerptBlock(clonedBlock);
  return extractBlockText(sanitized).length > 0 ? sanitized.outerHTML : null;
}

function createExcerptHtmlFromRange(blockElement: HTMLElement, range: Range): string | null {
  return createExcerptHtmlFromRangeSlice(blockElement, range, 'selected');
}

function createExcerptSlicesFromRange(blockElement: HTMLElement, range: Range): {
  excerptHtml: string | null;
  beforeHtml: string | null;
  afterHtml: string | null;
} {
  return {
    excerptHtml: createExcerptHtmlFromRangeSlice(blockElement, range, 'selected'),
    beforeHtml: createExcerptHtmlFromRangeSlice(blockElement, range, 'before'),
    afterHtml: createExcerptHtmlFromRangeSlice(blockElement, range, 'after'),
  };
}

function createBoundedRangeForBlock(blockElement: HTMLElement, selectionRange: Range): Range | null {
  const contentRoot = resolveBlockContentRoot(blockElement);
  const range = document.createRange();
  range.selectNodeContents(contentRoot);

  if (blockElement.contains(selectionRange.startContainer)) {
    range.setStart(selectionRange.startContainer, selectionRange.startOffset);
  }
  if (blockElement.contains(selectionRange.endContainer)) {
    range.setEnd(selectionRange.endContainer, selectionRange.endOffset);
  }

  if (range.collapsed || !String(range.toString() || '').trim()) {
    return null;
  }

  return range;
}

function buildSelectionSnapshotFromBlocks(input: {
  blockElements: HTMLElement[];
  text: string;
  commonElement: HTMLElement;
  root: HTMLElement | null;
  protyle: IProtyle | null;
  range: Range;
  blockSelections: ProgressiveExcerptBlockSelectionSnapshot[];
}): ProgressiveExcerptSelectionSnapshot | null {
  const normalizedBlocks = normalizeUniqueBlockElements(input.blockElements);
  const sourceBlockIds = normalizedBlocks
    .map((blockElement) => normalizeNodeId(blockElement.getAttribute('data-node-id')))
    .filter((blockId): blockId is string => Boolean(blockId));
  const sourceBlockId = sourceBlockIds[0] || '';
  const contentDom = input.blockSelections
    .map((selection) => selection.excerptHtml)
    .filter((html) => html.trim().length > 0)
    .join('');

  if (!sourceBlockId || sourceBlockIds.length === 0 || !input.text.trim() || !contentDom.trim()) {
    return null;
  }

  return {
    blockId: sourceBlockId,
    sourceBlockId,
    sourceBlockIds,
    text: input.text,
    contentDom,
    range: input.range.cloneRange(),
    blockSelections: input.blockSelections,
    commonElement: input.commonElement,
    root: input.root,
    protyle: input.protyle,
  };
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
  const startBlock = getClosestBlockElement(range.startContainer);
  const endBlock = getClosestBlockElement(range.endContainer);
  const startBlockId = getClosestBlockId(range.startContainer);
  const endBlockId = getClosestBlockId(range.endContainer);
  if (!startBlock || !endBlock || !startBlockId || !endBlockId) {
    return null;
  }

  const text = selection.toString().trim();
  if (!text) {
    return null;
  }

  const root = resolveSelectionRoot(startBlock, endBlock, commonElement, options?.root);
  const orderedBlocks = getOrderedBlocksBetween(startBlock, endBlock, root);
  if (orderedBlocks.length === 0) {
    return null;
  }

  const blockSelections: ProgressiveExcerptBlockSelectionSnapshot[] = [];
  for (let index = 0; index < orderedBlocks.length; index += 1) {
    const blockElement = orderedBlocks[index];
    const blockId = normalizeNodeId(blockElement.getAttribute('data-node-id'));
    if (!blockId) {
      continue;
    }

    if (orderedBlocks.length === 1) {
      const boundedRange = createBoundedRangeForBlock(blockElement, range);
      if (!boundedRange) {
        return null;
      }
      const { excerptHtml, beforeHtml, afterHtml } = createExcerptSlicesFromRange(blockElement, boundedRange);
      if (!excerptHtml) {
        return null;
      }
      blockSelections.push({
        blockId,
        mode: 'range',
        excerptHtml,
        ...(beforeHtml ? { beforeHtml } : {}),
        ...(afterHtml ? { afterHtml } : {}),
        range: boundedRange.cloneRange(),
      });
      continue;
    }

    const isFirst = index === 0;
    const isLast = index === orderedBlocks.length - 1;
    if (isFirst || isLast) {
      const boundedRange = createBoundedRangeForBlock(blockElement, range);
      if (!boundedRange) {
        continue;
      }
      const { excerptHtml, beforeHtml, afterHtml } = createExcerptSlicesFromRange(blockElement, boundedRange);
      if (!excerptHtml) {
        continue;
      }
      blockSelections.push({
        blockId,
        mode: 'range',
        excerptHtml,
        ...(isFirst && beforeHtml ? { beforeHtml } : {}),
        ...(isLast && afterHtml ? { afterHtml } : {}),
        range: boundedRange.cloneRange(),
      });
      continue;
    }

    const excerptHtml = createExcerptHtmlFromBlock(blockElement);
    if (!excerptHtml) {
      continue;
    }
    blockSelections.push({
      blockId,
      mode: 'full-block',
      excerptHtml,
    });
  }

  return buildSelectionSnapshotFromBlocks({
    blockElements: orderedBlocks,
    text,
    commonElement,
    root,
    protyle: getProtyleFromUnknown(options?.protyle)
      || (typeof options?.resolveProtyle === 'function'
        ? getProtyleFromUnknown(options.resolveProtyle(commonElement))
        : null)
      || resolveNativeProtyleFromElement(commonElement),
    range,
    blockSelections,
  });
}

export function resolveProgressiveExcerptSnapshotFromBlocks(
  blockElements: HTMLElement[],
  options?: ProgressiveBlockSnapshotResolveOptions,
): ProgressiveExcerptSelectionSnapshot | null {
  const normalizedBlocks = normalizeUniqueBlockElements(blockElements);
  if (normalizedBlocks.length === 0) {
    return null;
  }

  const blockSelections: ProgressiveExcerptBlockSelectionSnapshot[] = [];
  for (const blockElement of normalizedBlocks) {
    const blockId = normalizeNodeId(blockElement.getAttribute('data-node-id'));
    const excerptHtml = createExcerptHtmlFromBlock(blockElement);
    if (!blockId || !excerptHtml) {
      continue;
    }
    blockSelections.push({
      blockId,
      mode: 'full-block',
      excerptHtml,
    });
  }

  if (blockSelections.length === 0) {
    return null;
  }

  const text = normalizedBlocks
    .map((blockElement) => extractBlockText(blockElement))
    .filter((value) => value.length > 0)
    .join('\n')
    .trim();
  if (!text) {
    return null;
  }

  const firstBlock = normalizedBlocks[0];
  const root = options?.root
    || firstBlock.closest<HTMLElement>('.protyle-wysiwyg')
    || firstBlock.closest<HTMLElement>('.protyle')
    || null;
  const range = document.createRange();
  range.selectNodeContents(firstBlock);

  return buildSelectionSnapshotFromBlocks({
    blockElements: normalizedBlocks,
    text,
    commonElement: root || firstBlock,
    root,
    protyle: getProtyleFromUnknown(options?.protyle)
      || resolveNativeProtyleFromElement(firstBlock),
    range,
    blockSelections,
  });
}

export function resolveProgressiveExcerptSnapshotFromSelectedBlocks(
  options?: ProgressiveBlockSnapshotResolveOptions,
): ProgressiveExcerptSelectionSnapshot | null {
  const selectedBlocks = getSelectedBlockSearchRoots(options)
    .flatMap((root) => collectSelectedBlockElementsFromRoot(root));

  return resolveProgressiveExcerptSnapshotFromBlocks(selectedBlocks, options);
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
    sourceBlockId: snapshot.sourceBlockId,
    sourceBlockIds: [...snapshot.sourceBlockIds],
    text: snapshot.text,
    contentDom: snapshot.contentDom,
  };
}

export function isProgressiveSelectionInsideNativeProtyle(options?: {
  root?: HTMLElement | null;
}): boolean {
  const commonElement = getSelectionCommonElement(options);
  return Boolean(commonElement?.closest('.protyle'));
}
