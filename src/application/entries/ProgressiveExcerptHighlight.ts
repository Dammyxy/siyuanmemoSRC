import type { IProtyle } from 'siyuan';
import type {
  ProgressiveExcerptBlockSelectionSnapshot,
  ProgressiveExcerptSelectionSnapshot,
} from '@/application/entries/ProgressiveSelectionResolver';
import { PROGRESSIVE_EXCERPT_COLOR_TOKEN } from '@/application/services/ExcerptRecordService';
import { createLogger } from '@/utils/logger';

export const PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR = PROGRESSIVE_EXCERPT_COLOR_TOKEN;
export const PROGRESSIVE_EXCERPT_MARK_ATTR = 'data-siyuanmemo-excerpt-mark';
export const PROGRESSIVE_EXCERPT_MARK_VALUE = 'source';
export const PROGRESSIVE_EXCERPT_MARK_CLASS = 'siyuanmemo-progressive-excerpt-mark';

const logger = createLogger('ProgressiveExcerptHighlight');

export interface PreparedProgressiveExcerptHighlightMutation {
  blockId: string;
  previousBlockHtml: string;
  nextBlockHtml: string;
  alreadyApplied: boolean;
}

export interface PreparedProgressiveExcerptHighlight {
  blockId: string;
  blockIds: string[];
  previousBlockHtml: string;
  nextBlockHtml: string;
  blockMutations: PreparedProgressiveExcerptHighlightMutation[];
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

function hasPluginExcerptMark(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return element.getAttribute(PROGRESSIVE_EXCERPT_MARK_ATTR) === PROGRESSIVE_EXCERPT_MARK_VALUE
    || element.classList.contains(PROGRESSIVE_EXCERPT_MARK_CLASS);
}

function applyPluginExcerptMarkIdentity(element: HTMLElement): void {
  element.setAttribute(PROGRESSIVE_EXCERPT_MARK_ATTR, PROGRESSIVE_EXCERPT_MARK_VALUE);
  element.classList.add(PROGRESSIVE_EXCERPT_MARK_CLASS);
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
    return hasPluginExcerptMark(startWrapper);
  }

  return hasPluginExcerptMark(startWrapper) && hasPluginExcerptMark(endWrapper);
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
): PreparedProgressiveExcerptHighlightMutation | null {
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
      blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
      previousBlockHtml,
      nextBlockHtml: previousBlockHtml,
      alreadyApplied: true,
    };
  }

  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-type', 'text mark');
  applyPluginExcerptMarkIdentity(wrapper);
  wrapper.style.backgroundColor = PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR;
  wrapper.append(clonedRange.extractContents());
  clonedRange.insertNode(wrapper);

  return {
    blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
    previousBlockHtml,
    nextBlockHtml: clonedBlock.outerHTML,
    alreadyApplied: false,
  };
}

function appendBackgroundColor(style: string | null | undefined): string {
  const normalized = String(style || '').trim().replace(/;+\s*$/u, '');
  if (!normalized) {
    return `background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`;
  }
  if (normalized.includes('background-color') && normalized.includes(PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR)) {
    return `${normalized};`;
  }
  return `${normalized}; background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`;
}

function isSuperBlockElement(blockElement: HTMLElement): boolean {
  return blockElement.getAttribute('data-type') === 'NodeSuperBlock'
    || blockElement.classList.contains('sb');
}

function resolveSuperBlockHighlightTargets(blockElement: HTMLElement): HTMLElement[] {
  return Array.from(blockElement.querySelectorAll<HTMLElement>('[contenteditable="true"]'))
    .filter((element) => element.closest('.protyle-attr') === null);
}

function resolveFullBlockHighlightTarget(blockElement: HTMLElement): HTMLElement {
  return blockElement.querySelector<HTMLElement>('[contenteditable="true"]') || blockElement;
}

function cloneSuperBlockHighlight(blockElement: HTMLElement): PreparedProgressiveExcerptHighlightMutation | null {
  const previousBlockHtml = blockElement.outerHTML;
  const clonedBlock = blockElement.cloneNode(true) as HTMLElement;
  const targets = resolveSuperBlockHighlightTargets(clonedBlock);
  if (targets.length === 0) {
    return null;
  }

  if (targets.every((target) => hasPluginExcerptMark(target))) {
    return {
      blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
      previousBlockHtml,
      nextBlockHtml: previousBlockHtml,
      alreadyApplied: true,
    };
  }

  for (const target of targets) {
    applyPluginExcerptMarkIdentity(target);
    target.setAttribute('style', appendBackgroundColor(target.getAttribute('style')));
  }

  return {
    blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
    previousBlockHtml,
    nextBlockHtml: clonedBlock.outerHTML,
    alreadyApplied: false,
  };
}

function cloneFullBlockHighlight(blockElement: HTMLElement): PreparedProgressiveExcerptHighlightMutation | null {
  if (isSuperBlockElement(blockElement)) {
    return cloneSuperBlockHighlight(blockElement);
  }

  const previousBlockHtml = blockElement.outerHTML;
  const clonedBlock = blockElement.cloneNode(true) as HTMLElement;
  const target = resolveFullBlockHighlightTarget(clonedBlock);
  const currentStyle = target.getAttribute('style') || '';
  if (hasPluginExcerptMark(target)) {
    return {
      blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
      previousBlockHtml,
      nextBlockHtml: previousBlockHtml,
      alreadyApplied: true,
    };
  }

  applyPluginExcerptMarkIdentity(target);
  target.setAttribute('style', appendBackgroundColor(currentStyle));
  return {
    blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
    previousBlockHtml,
    nextBlockHtml: clonedBlock.outerHTML,
    alreadyApplied: false,
  };
}

function isPreparedProgressiveExcerptHighlight(value: unknown): value is PreparedProgressiveExcerptHighlight {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PreparedProgressiveExcerptHighlight>;
  const hasLegacyShape = typeof candidate.blockId === 'string'
    && typeof candidate.previousBlockHtml === 'string'
    && typeof candidate.nextBlockHtml === 'string'
    && typeof candidate.alreadyApplied === 'boolean';
  const hasMutationShape = Array.isArray(candidate.blockMutations);

  return hasLegacyShape || hasMutationShape;
}

function createElementFromHtml(html: string): HTMLElement | null {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild instanceof HTMLElement
    ? template.content.firstElementChild
    : null;
}

function normalizePreparedMutations(
  prepared: PreparedProgressiveExcerptHighlight,
): PreparedProgressiveExcerptHighlightMutation[] {
  if (Array.isArray(prepared.blockMutations) && prepared.blockMutations.length > 0) {
    return prepared.blockMutations;
  }

  return [{
    blockId: prepared.blockId,
    previousBlockHtml: prepared.previousBlockHtml,
    nextBlockHtml: prepared.nextBlockHtml,
    alreadyApplied: prepared.alreadyApplied,
  }];
}

function syncLiveBlockHtml(prepared: PreparedProgressiveExcerptHighlight): void {
  const liveRoot = prepared.root || prepared.protyle?.wysiwyg?.element || null;
  const mutations = normalizePreparedMutations(prepared);

  for (const mutation of mutations) {
    const liveBlock = resolveBlockElement(liveRoot, mutation.blockId);
    if (!liveBlock) {
      continue;
    }

    const nextBlock = createElementFromHtml(mutation.nextBlockHtml);
    if (!nextBlock) {
      continue;
    }

    liveBlock.replaceWith(nextBlock);
  }
}

async function applyPreparedProgressiveExcerptHighlight(
  prepared: PreparedProgressiveExcerptHighlight | null,
  options?: ProgressiveExcerptHighlightApplyOptions,
): Promise<boolean> {
  if (!prepared) {
    return false;
  }

  const mutations = normalizePreparedMutations(prepared)
    .filter((mutation) => !mutation.alreadyApplied && mutation.previousBlockHtml !== mutation.nextBlockHtml);
  if (mutations.length === 0) {
    return true;
  }

  if (typeof options?.persistDomBlock !== 'function') {
    logger.warn('Missing DOM persistence callback for prepared progressive excerpt highlight', {
      blockIds: normalizePreparedMutations(prepared).map((mutation) => mutation.blockId),
    });
    return false;
  }

  const instance = typeof prepared.protyle?.getInstance === 'function'
    ? prepared.protyle.getInstance()
    : null;

  try {
    for (const mutation of mutations) {
      await options.persistDomBlock(mutation.blockId, mutation.nextBlockHtml);
    }
    syncLiveBlockHtml(prepared);
    if (typeof instance?.reload === 'function') {
      instance.reload(false);
    }
    return true;
  } catch (error) {
    logger.warn('Failed to persist prepared progressive excerpt highlight', {
      blockIds: mutations.map((mutation) => mutation.blockId),
      error,
    });
    return false;
  }
}

function buildPreparedHighlight(
  mutations: PreparedProgressiveExcerptHighlightMutation[],
  root: HTMLElement | null,
  protyle: IProtyle | null,
): PreparedProgressiveExcerptHighlight | null {
  if (mutations.length === 0) {
    return null;
  }

  const [first] = mutations;
  return {
    blockId: first.blockId,
    blockIds: mutations.map((mutation) => mutation.blockId),
    previousBlockHtml: first.previousBlockHtml,
    nextBlockHtml: first.nextBlockHtml,
    blockMutations: mutations,
    root,
    protyle,
    alreadyApplied: mutations.every((mutation) => mutation.alreadyApplied),
  };
}

export function prepareProgressiveExcerptHighlight(
  snapshot: ProgressiveExcerptSelectionSnapshot | null,
): PreparedProgressiveExcerptHighlight | null {
  if (!snapshot) {
    return null;
  }

  const liveRoot = resolveLiveRoot(snapshot);
  const sourceSelections = Array.isArray(snapshot.blockSelections) && snapshot.blockSelections.length > 0
    ? snapshot.blockSelections
    : [{
      blockId: snapshot.blockId,
      mode: 'range' as const,
      excerptHtml: snapshot.contentDom,
      range: snapshot.range.cloneRange(),
    }];

  const mutations: PreparedProgressiveExcerptHighlightMutation[] = [];
  for (const selection of sourceSelections) {
    const blockElement = resolveBlockElement(liveRoot, selection.blockId);
    if (!blockElement) {
      return null;
    }

    if (selection.mode === 'full-block') {
      const prepared = cloneFullBlockHighlight(blockElement);
      if (!prepared) {
        return null;
      }
      mutations.push(prepared);
      continue;
    }

    const selectionRange = selection.range?.cloneRange();
    if (!selectionRange) {
      return null;
    }
    if (!isAttachedToRoot(selectionRange.startContainer, liveRoot) || !isAttachedToRoot(selectionRange.endContainer, liveRoot)) {
      return null;
    }
    const prepared = cloneHighlightRange(blockElement, selectionRange);
    if (!prepared) {
      return null;
    }
    mutations.push(prepared);
  }

  return buildPreparedHighlight(mutations, liveRoot, snapshot.protyle);
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
