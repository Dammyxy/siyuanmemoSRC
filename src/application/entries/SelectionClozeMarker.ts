import type { IProtyle } from 'siyuan';
import type {
  ProgressiveExcerptBlockSelectionSnapshot,
  ProgressiveExcerptSelectionSnapshot,
} from '@/application/entries/ProgressiveSelectionResolver';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SelectionClozeMarker');

export interface PreparedSelectionClozeMutation {
  blockId: string;
  previousBlockHtml: string;
  nextBlockHtml: string;
  alreadyApplied: boolean;
}

export interface PreparedSelectionClozeMark {
  blockId: string;
  blockIds: string[];
  previousBlockHtml: string;
  nextBlockHtml: string;
  blockMutations: PreparedSelectionClozeMutation[];
  root: HTMLElement | null;
  protyle: IProtyle | null;
  alreadyApplied: boolean;
}

export interface SelectionClozeMarkApplyOptions {
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

function resolveLiveRoot(snapshot: ProgressiveExcerptSelectionSnapshot): HTMLElement | null {
  return snapshot.root
    || snapshot.protyle?.wysiwyg?.element
    || null;
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

function isInsideMark(node: Node | null): boolean {
  const element = getElementFromNode(node);
  return Boolean(element?.closest<HTMLElement>('[data-type="mark"]'));
}

function createMarkWrapper(fragment: DocumentFragment): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-type', 'mark');
  wrapper.append(fragment);
  return wrapper;
}

function cloneRangeMarkMutation(
  blockElement: HTMLElement,
  snapshotRange: Range,
): PreparedSelectionClozeMutation | null {
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

  if (clonedRange.collapsed || (isInsideMark(clonedRange.startContainer) && isInsideMark(clonedRange.endContainer))) {
    return {
      blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
      previousBlockHtml,
      nextBlockHtml: previousBlockHtml,
      alreadyApplied: true,
    };
  }

  const extracted = clonedRange.extractContents();
  clonedRange.insertNode(createMarkWrapper(extracted));

  return {
    blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
    previousBlockHtml,
    nextBlockHtml: clonedBlock.outerHTML,
    alreadyApplied: false,
  };
}

function cloneFullBlockMarkMutation(blockElement: HTMLElement): PreparedSelectionClozeMutation | null {
  const previousBlockHtml = blockElement.outerHTML;
  const clonedBlock = blockElement.cloneNode(true) as HTMLElement;
  const target = clonedBlock.querySelector<HTMLElement>('[contenteditable="true"]') || clonedBlock;
  const currentMarkup = target.innerHTML.trim();

  if (
    target.childElementCount === 1
    && target.firstElementChild?.getAttribute('data-type') === 'mark'
    && currentMarkup.length > 0
  ) {
    return {
      blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
      previousBlockHtml,
      nextBlockHtml: previousBlockHtml,
      alreadyApplied: true,
    };
  }

  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-type', 'mark');
  while (target.firstChild) {
    wrapper.append(target.firstChild);
  }
  target.append(wrapper);

  return {
    blockId: String(blockElement.getAttribute('data-node-id') || '').trim(),
    previousBlockHtml,
    nextBlockHtml: clonedBlock.outerHTML,
    alreadyApplied: false,
  };
}

function createElementFromHtml(html: string): HTMLElement | null {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild instanceof HTMLElement
    ? template.content.firstElementChild
    : null;
}

function syncLiveBlockHtml(prepared: PreparedSelectionClozeMark): void {
  const liveRoot = prepared.root || prepared.protyle?.wysiwyg?.element || null;
  for (const mutation of prepared.blockMutations) {
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

function buildPreparedMark(
  mutations: PreparedSelectionClozeMutation[],
  root: HTMLElement | null,
  protyle: IProtyle | null,
): PreparedSelectionClozeMark | null {
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

export function prepareSelectionClozeMark(
  snapshot: ProgressiveExcerptSelectionSnapshot | null,
): PreparedSelectionClozeMark | null {
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

  const mutations: PreparedSelectionClozeMutation[] = [];
  for (const selection of sourceSelections) {
    const blockElement = resolveBlockElement(liveRoot, selection.blockId);
    if (!blockElement) {
      return null;
    }

    const prepared = selection.mode === 'full-block'
      ? cloneFullBlockMarkMutation(blockElement)
      : selection.range
        ? cloneRangeMarkMutation(blockElement, selection.range)
        : null;
    if (!prepared) {
      return null;
    }
    mutations.push(prepared);
  }

  return buildPreparedMark(mutations, liveRoot, snapshot.protyle);
}

export async function applyPreparedSelectionClozeMark(
  prepared: PreparedSelectionClozeMark | null,
  options?: SelectionClozeMarkApplyOptions,
): Promise<boolean> {
  if (!prepared) {
    return false;
  }

  const mutations = prepared.blockMutations
    .filter((mutation) => !mutation.alreadyApplied && mutation.previousBlockHtml !== mutation.nextBlockHtml);
  if (mutations.length === 0) {
    return true;
  }

  if (typeof options?.persistDomBlock !== 'function') {
    logger.warn('Missing DOM persistence callback for prepared selection cloze mark', {
      blockIds: prepared.blockIds,
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
    logger.warn('Failed to persist prepared selection cloze mark', {
      blockIds: mutations.map((mutation) => mutation.blockId),
      error,
    });
    return false;
  }
}
