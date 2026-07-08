import { parseCardSourceGrammar } from './sourceGrammar';
import type { CdfLiveBlockNode } from './types';

const BLOCK_REF_RE = /\(\((\d{14}-[a-z0-9]{7})(?:\s+[^\)]*)?\)\)/i;
const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;

function normalizeText(value: string | null | undefined): string {
  return String(value || '').replace(TRAILING_BLOCK_ATTR_PATTERN, '').trim();
}

function readNodeMarkdown(node: CdfLiveBlockNode): string {
  return normalizeText(node.markdown || node.content || '');
}

function hasBlockRefs(node: CdfLiveBlockNode): boolean {
  return BLOCK_REF_RE.test(readNodeMarkdown(node));
}

function isHeadingNode(node: CdfLiveBlockNode): boolean {
  return node.type === 'h' || /^h\d$/i.test(String(node.subtype || ''));
}

function isGroupNode(node: CdfLiveBlockNode): boolean {
  const operator = parseCardSourceGrammar(readNodeMarkdown(node)).primaryOperator;
  return operator?.role === 'group';
}

function cloneShallow(node: CdfLiveBlockNode): CdfLiveBlockNode {
  const cloned: CdfLiveBlockNode = { ...node };
  delete cloned.children;
  return cloned;
}

function cloneWithChildren(node: CdfLiveBlockNode, children: CdfLiveBlockNode[]): CdfLiveBlockNode {
  const cloned: CdfLiveBlockNode = { ...node };
  if (children.length > 0) {
    cloned.children = children;
  } else {
    delete cloned.children;
  }
  return cloned;
}

function cloneSubtree(node: CdfLiveBlockNode): CdfLiveBlockNode {
  return cloneWithChildren(node, (node.children || []).map(cloneSubtree));
}

function findPath(root: CdfLiveBlockNode, targetId: string): CdfLiveBlockNode[] | null {
  if (root.id === targetId) {
    return [root];
  }

  for (const child of root.children || []) {
    const childPath = findPath(child, targetId);
    if (childPath) {
      return [root, ...childPath];
    }
  }
  return null;
}

function findNearestPreviousBoundary(
  siblings: CdfLiveBlockNode[],
  targetIndex: number,
): CdfLiveBlockNode | null {
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const sibling = siblings[index];
    if (hasBlockRefs(sibling) || isHeadingNode(sibling)) {
      return sibling;
    }
  }
  return null;
}

function uniqueById(nodes: CdfLiveBlockNode[]): CdfLiveBlockNode[] {
  const seen = new Set<string>();
  const unique: CdfLiveBlockNode[] = [];
  for (const node of nodes) {
    if (!node.id || seen.has(node.id)) {
      continue;
    }
    seen.add(node.id);
    unique.push(node);
  }
  return unique;
}

function cloneBoundaryArea(
  siblings: CdfLiveBlockNode[],
  boundaryIndex: number,
): CdfLiveBlockNode[] {
  const scoped: CdfLiveBlockNode[] = [cloneSubtree(siblings[boundaryIndex])];
  for (let index = boundaryIndex + 1; index < siblings.length; index += 1) {
    const sibling = siblings[index];
    if (hasBlockRefs(sibling)) {
      break;
    }
    scoped.push(cloneSubtree(sibling));
  }
  return scoped;
}

function scopePathAtDepth(
  path: CdfLiveBlockNode[],
  depth: number,
  changedBlockId: string,
): CdfLiveBlockNode {
  const current = path[depth];
  if (depth >= path.length - 1) {
    return isGroupNode(current) || hasBlockRefs(current)
      ? cloneSubtree(current)
      : cloneShallow(current);
  }

  const targetChild = path[depth + 1];
  const siblings = current.children || [];
  const targetIndex = siblings.findIndex((child) => child.id === targetChild.id);
  if (targetIndex < 0) {
    return cloneShallow(current);
  }

  if (targetChild.id === changedBlockId && hasBlockRefs(targetChild)) {
    return cloneWithChildren(current, cloneBoundaryArea(siblings, targetIndex));
  }

  const scopedChild = targetChild.id === changedBlockId && isGroupNode(targetChild)
    ? cloneSubtree(targetChild)
    : scopePathAtDepth(path, depth + 1, changedBlockId);

  const children: CdfLiveBlockNode[] = [];
  const previousBoundary = isGroupNode(current) ? null : findNearestPreviousBoundary(siblings, targetIndex);
  if (previousBoundary) {
    children.push(cloneShallow(previousBoundary));
  }
  children.push(scopedChild);
  return cloneWithChildren(current, uniqueById(children));
}

export function scopeCdfLiveBlockEditTree(
  input: CdfLiveBlockNode | CdfLiveBlockNode[],
  changedBlockId: string,
): CdfLiveBlockNode | CdfLiveBlockNode[] | null {
  const normalizedChangedBlockId = String(changedBlockId || '').trim();
  if (!normalizedChangedBlockId) {
    return input;
  }

  const roots = Array.isArray(input) ? input : [input];
  const scopedRoots: CdfLiveBlockNode[] = [];
  for (const root of roots) {
    const path = findPath(root, normalizedChangedBlockId);
    if (!path) {
      continue;
    }
    scopedRoots.push(scopePathAtDepth(path, 0, normalizedChangedBlockId));
  }

  if (scopedRoots.length === 0) {
    return null;
  }
  return Array.isArray(input) ? scopedRoots : scopedRoots[0];
}
