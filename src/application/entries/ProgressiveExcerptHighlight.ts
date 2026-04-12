import type { IProtyle } from 'siyuan';
import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import { PROGRESSIVE_EXCERPT_COLOR_TOKEN } from '@/application/services/ExcerptRecordService';
import { createLogger } from '@/utils/logger';

export const PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR = PROGRESSIVE_EXCERPT_COLOR_TOKEN;

const logger = createLogger('ProgressiveExcerptHighlight');

export interface PreparedProgressiveExcerptHighlight {
  blockId: string;
  previousBlockHtml: string;
  nextBlockHtml: string;
  root: HTMLElement | null;
  protyle: IProtyle | null;
  alreadyApplied: boolean;
}

export interface ProgressiveExcerptHighlightApplyOptions {
  persistDomBlock: (blockId: string, dom: string) => Promise<unknown>;
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

function getTextInlineWrapper(node: Node | null): HTMLElement | null {
  return getElementFromNode(node)?.closest<HTMLElement>('span[data-type~="text"]') || null;
}

function hasHighlightColor(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = element.getAttribute('style') || '';
  return style.includes('background-color') && style.includes(PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR);
}

function resolveLiveRoot(snapshot: ProgressiveExcerptSelectionSnapshot): HTMLElement | null {
  return snapshot.root
    || snapshot.protyle?.wysiwyg?.element
    || null;
}

function isAttachedToRoot(node: Node | null, root: HTMLElement | null): boolean {
  const element = getElementFromNode(node);
  if (!element || !element.isConnected) {
    return false;
  }
  if (!root) {
    return true;
  }
  return root.contains(element);
}

function resolveBlockElement(root: HTMLElement | null, blockId: string): HTMLElement | null {
  if (!root || !blockId) {
    return null;
  }

  for (const candidate of root.querySelectorAll<HTMLElement>('[data-node-id]')) {
    if (candidate.getAttribute('data-node-id') === blockId) {
      return candidate;
    }
  }

  return null;
}

function isRangeInsideHighlightedText(range: Range): boolean {
  const startWrapper = getTextInlineWrapper(range.startContainer);
  const endWrapper = getTextInlineWrapper(range.endContainer);
  if (!startWrapper || !endWrapper) {
    return false;
  }

  if (startWrapper === endWrapper) {
    return hasHighlightColor(startWrapper);
  }

  return hasHighlightColor(startWrapper) && hasHighlightColor(endWrapper);
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

function cloneHighlightRange(
  blockElement: HTMLElement,
  snapshotRange: Range,
): { previousBlockHtml: string; nextBlockHtml: string; alreadyApplied: boolean } | null {
  const startPath = buildNodePath(blockElement, snapshotRange.startContainer);
  const endPath = buildNodePath(blockElement, snapshotRange.endContainer);
  if (!startPath || !endPath) {
    return null;
  }

  const previousBlockHtml = blockElement.outerHTML;
  const clonedBlock = blockElement.cloneNode(true) as HTMLElement;
  const clonedStart = resolveNodePath(clonedBlock, startPath);
  const clonedEnd = resolveNodePath(clonedBlock, endPath);
  if (!clonedStart || !clonedEnd) {
    return null;
  }

  const clonedRange = document.createRange();
  clonedRange.setStart(clonedStart, snapshotRange.startOffset);
  clonedRange.setEnd(clonedEnd, snapshotRange.endOffset);

  if (isRangeInsideHighlightedText(clonedRange)) {
    return {
      previousBlockHtml,
      nextBlockHtml: previousBlockHtml,
      alreadyApplied: true,
    };
  }

  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-type', 'text');
  wrapper.style.backgroundColor = PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR;
  wrapper.append(clonedRange.extractContents());
  clonedRange.insertNode(wrapper);

  return {
    previousBlockHtml,
    nextBlockHtml: clonedBlock.outerHTML,
    alreadyApplied: false,
  };
}

function isPreparedProgressiveExcerptHighlight(value: unknown): value is PreparedProgressiveExcerptHighlight {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return typeof (value as PreparedProgressiveExcerptHighlight).blockId === 'string'
    && typeof (value as PreparedProgressiveExcerptHighlight).previousBlockHtml === 'string'
    && typeof (value as PreparedProgressiveExcerptHighlight).nextBlockHtml === 'string'
    && typeof (value as PreparedProgressiveExcerptHighlight).alreadyApplied === 'boolean';
}

function createElementFromHtml(html: string): HTMLElement | null {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild instanceof HTMLElement
    ? template.content.firstElementChild
    : null;
}

function syncLiveBlockHtml(prepared: PreparedProgressiveExcerptHighlight): void {
  const liveRoot = prepared.root || prepared.protyle?.wysiwyg?.element || null;
  const liveBlock = resolveBlockElement(liveRoot, prepared.blockId);
  if (!liveBlock) {
    return;
  }

  const nextBlock = createElementFromHtml(prepared.nextBlockHtml);
  if (!nextBlock) {
    return;
  }

  liveBlock.replaceWith(nextBlock);
}

async function applyPreparedProgressiveExcerptHighlight(
  prepared: PreparedProgressiveExcerptHighlight | null,
  options?: ProgressiveExcerptHighlightApplyOptions,
): Promise<boolean> {
  if (!prepared) {
    return false;
  }

  if (prepared.alreadyApplied || prepared.previousBlockHtml === prepared.nextBlockHtml) {
    return true;
  }

  if (typeof options?.persistDomBlock !== 'function') {
    logger.warn('Missing DOM persistence callback for prepared progressive excerpt highlight', {
      blockId: prepared.blockId,
    });
    return false;
  }

  const instance = typeof prepared.protyle?.getInstance === 'function'
    ? prepared.protyle.getInstance()
    : null;

  try {
    await options.persistDomBlock(prepared.blockId, prepared.nextBlockHtml);
    syncLiveBlockHtml(prepared);
    if (typeof instance.reload === 'function') {
      instance.reload(false);
    }
    return true;
  } catch (error) {
    logger.warn('Failed to persist prepared progressive excerpt highlight', {
      blockId: prepared.blockId,
      error,
    });
    return false;
  }
}

export function prepareProgressiveExcerptHighlight(
  snapshot: ProgressiveExcerptSelectionSnapshot | null,
): PreparedProgressiveExcerptHighlight | null {
  if (!snapshot) {
    return null;
  }

  const liveRoot = resolveLiveRoot(snapshot);
  const range = snapshot.range.cloneRange();
  if (!isAttachedToRoot(range.startContainer, liveRoot) || !isAttachedToRoot(range.endContainer, liveRoot)) {
    return null;
  }

  const blockElement = resolveBlockElement(liveRoot, snapshot.blockId);
  if (!blockElement) {
    return null;
  }

  const clonedHighlight = cloneHighlightRange(blockElement, range);
  if (!clonedHighlight) {
    return null;
  }

  return {
    blockId: snapshot.blockId,
    previousBlockHtml: clonedHighlight.previousBlockHtml,
    nextBlockHtml: clonedHighlight.nextBlockHtml,
    root: liveRoot,
    protyle: snapshot.protyle,
    alreadyApplied: clonedHighlight.alreadyApplied,
  };
}

export async function applyProgressiveExcerptHighlight(
  input: ProgressiveExcerptSelectionSnapshot | PreparedProgressiveExcerptHighlight | null,
  options?: ProgressiveExcerptHighlightApplyOptions,
): Promise<boolean> {
  if (!input) {
    return false;
  }

  if (isPreparedProgressiveExcerptHighlight(input)) {
    return applyPreparedProgressiveExcerptHighlight(input, options);
  }

  return applyPreparedProgressiveExcerptHighlight(prepareProgressiveExcerptHighlight(input), options);
}
