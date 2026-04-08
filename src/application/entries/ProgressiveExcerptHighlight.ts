import { Toolbar, type IProtyle } from 'siyuan';
import type { ProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';

export const PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR = 'rgba(255, 214, 102, 0.45)';

function getElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }
  if (node instanceof HTMLElement) {
    return node;
  }
  return node.parentElement;
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

function resolveToolbar(protyle: IProtyle): Toolbar {
  if (protyle.toolbar instanceof Toolbar) {
    return protyle.toolbar;
  }

  const toolbar = new Toolbar(protyle);
  protyle.toolbar = toolbar;
  return toolbar;
}

export function applyProgressiveExcerptHighlight(
  snapshot: ProgressiveExcerptSelectionSnapshot | null,
): boolean {
  if (!snapshot?.protyle) {
    return false;
  }

  const range = snapshot.range.cloneRange();
  if (!isAttachedToRoot(range.startContainer, snapshot.root) || !isAttachedToRoot(range.endContainer, snapshot.root)) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(range);

  const toolbar = resolveToolbar(snapshot.protyle);
  toolbar.setInlineMark(snapshot.protyle, 'text', 'range', {
    type: 'backgroundColor',
    color: PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR,
  });

  return true;
}
