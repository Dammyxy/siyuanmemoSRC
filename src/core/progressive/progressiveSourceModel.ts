import type { ProgressiveSourceContext } from '@/application/services/ProgressiveSourceContextResolver';

export type ProgressiveContentAuthority = 'siyuan-block' | 'xiuyuan-aggregate';
export type ProgressiveSourceAvailabilityStatus = 'current' | 'stale' | 'missing' | 'detached';

export interface ProgressiveSourceLineage {
  version: 1;
  authority: ProgressiveContentAuthority;
  sourceDocId: string;
  rootDocId: string;
  rootKind: ProgressiveSourceContext['rootKind'];
  sourceBlockId: string;
  sourceBlockIds: string[];
  logicalParentId: string;
  logicalParentType: ProgressiveSourceContext['logicalParentType'];
  parentTopicCardId?: string;
  parentExcerptId?: string;
  sessionId?: string;
  mode?: 'linear' | 'nonlinear';
}

export interface ProgressiveSelectionSnapshotIdentity {
  version: 1;
  kind: 'block-selection';
  sourceBlockId: string;
  sourceBlockIds: string[];
  selectedTextFingerprint: string;
  selectedTextLength: number;
  selectionMode: 'range' | 'full-block' | 'mixed' | 'unknown';
}

export interface ProgressiveContentPayloadIdentity {
  version: 1;
  algorithm: 'fnv1a32';
  hash: string;
  sourceBlockIds: string[];
  textLength: number;
  domLength: number;
}

export type ProgressiveUnifiedSourcePosition =
  | {
      version: 1;
      kind: 'siyuan-block';
      blockId: string;
      blockIds: string[];
      rootDocId: string;
      sourceDocId: string;
    }
  | { version: 1; kind: 'pdf'; documentId: string; page?: number; rect?: unknown }
  | { version: 1; kind: 'web'; url: string; selector?: string; textQuote?: string }
  | { version: 1; kind: 'video'; url: string; timestampMs?: number }
  | { version: 1; kind: 'media'; mediaId: string; timestampMs?: number; rangeMs?: [number, number] };

export interface ProgressiveDisclosureState {
  version: 1;
  state: 'created' | 'pending' | 'active' | 'completed' | 'deferred';
  formalSchedulerMutation: false;
}

export interface ProgressiveDerivedItemIdentity {
  version: 1;
  kind: 'excerpt-topic' | 'piece-topic' | 'derived-item';
  itemId: string;
  sourceBlockId: string;
  sourceBlockIds: string[];
}

export interface ProgressiveSourceAvailability {
  status: ProgressiveSourceAvailabilityStatus;
  expectedPayloadHash: string;
  currentPayloadHash?: string;
  missingBlockIds: string[];
  detachedBlockIds: string[];
  diagnostics: string[];
}

export interface ProgressiveSourceBlockSnapshot {
  id: string;
  root_id?: string;
  content?: string;
  markdown?: string;
}

export function normalizeProgressiveSourceText(value: unknown): string {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stableProgressiveStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableProgressiveStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableProgressiveStringify(record[key])}`).join(',')}}`;
}

export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildProgressiveSourceLineage(input: {
  sourceContext: ProgressiveSourceContext;
  sourceBlockIds: string[];
}): ProgressiveSourceLineage {
  return {
    version: 1,
    authority: 'siyuan-block',
    sourceDocId: input.sourceContext.sourceDocId,
    rootDocId: input.sourceContext.rootDocId,
    rootKind: input.sourceContext.rootKind,
    sourceBlockId: input.sourceContext.sourceBlockId,
    sourceBlockIds: input.sourceBlockIds,
    logicalParentId: input.sourceContext.logicalParentId,
    logicalParentType: input.sourceContext.logicalParentType,
    ...(input.sourceContext.parentTopicCardId ? { parentTopicCardId: input.sourceContext.parentTopicCardId } : {}),
    ...(input.sourceContext.parentExcerptId ? { parentExcerptId: input.sourceContext.parentExcerptId } : {}),
    ...(input.sourceContext.sessionId ? { sessionId: input.sourceContext.sessionId } : {}),
    ...(input.sourceContext.mode ? { mode: input.sourceContext.mode } : {}),
  };
}

export function buildProgressiveSelectionSnapshotIdentity(input: {
  sourceBlockId: string;
  sourceBlockIds: string[];
  selectedText: string;
  selectionMode?: ProgressiveSelectionSnapshotIdentity['selectionMode'];
}): ProgressiveSelectionSnapshotIdentity {
  const normalizedText = normalizeProgressiveSourceText(input.selectedText);
  return {
    version: 1,
    kind: 'block-selection',
    sourceBlockId: input.sourceBlockId,
    sourceBlockIds: input.sourceBlockIds,
    selectedTextFingerprint: fnv1a32(normalizedText),
    selectedTextLength: normalizedText.length,
    selectionMode: input.selectionMode || 'unknown',
  };
}

export function buildProgressiveContentPayloadIdentity(input: {
  sourceBlockIds: string[];
  selectedText: string;
  contentDom?: string;
  sourceBlocks?: ProgressiveSourceBlockSnapshot[];
}): ProgressiveContentPayloadIdentity {
  const sourcePayload = (input.sourceBlocks || []).map((block) => ({
    id: block.id,
    rootId: block.root_id || '',
    text: normalizeProgressiveSourceText(block.markdown || block.content || ''),
  }));
  const selectedText = normalizeProgressiveSourceText(input.selectedText);
  const dom = String(input.contentDom || '').trim();
  return {
    version: 1,
    algorithm: 'fnv1a32',
    hash: fnv1a32(stableProgressiveStringify({
      sourceBlockIds: input.sourceBlockIds,
      selectedText,
      dom,
      sourcePayload,
    })),
    sourceBlockIds: input.sourceBlockIds,
    textLength: selectedText.length,
    domLength: dom.length,
  };
}

export function buildProgressiveUnifiedSourcePosition(input: {
  sourceDocId: string;
  rootDocId: string;
  sourceBlockId: string;
  sourceBlockIds: string[];
}): ProgressiveUnifiedSourcePosition {
  return {
    version: 1,
    kind: 'siyuan-block',
    blockId: input.sourceBlockId,
    blockIds: input.sourceBlockIds,
    rootDocId: input.rootDocId,
    sourceDocId: input.sourceDocId,
  };
}

export function buildProgressiveDisclosureState(
  state: ProgressiveDisclosureState['state'],
): ProgressiveDisclosureState {
  return {
    version: 1,
    state,
    formalSchedulerMutation: false,
  };
}

export function buildProgressiveDerivedItemIdentity(input: {
  kind: ProgressiveDerivedItemIdentity['kind'];
  itemId: string;
  sourceBlockId: string;
  sourceBlockIds: string[];
}): ProgressiveDerivedItemIdentity {
  return {
    version: 1,
    kind: input.kind,
    itemId: input.itemId,
    sourceBlockId: input.sourceBlockId,
    sourceBlockIds: input.sourceBlockIds,
  };
}

export function evaluateProgressiveSourceAvailability(input: {
  lineage: ProgressiveSourceLineage;
  expectedPayload: ProgressiveContentPayloadIdentity;
  currentBlocks: Array<ProgressiveSourceBlockSnapshot | null>;
  selectedText: string;
  contentDom?: string;
}): ProgressiveSourceAvailability {
  const missingBlockIds = input.lineage.sourceBlockIds.filter((_blockId, index) => !input.currentBlocks[index]);
  if (missingBlockIds.length > 0) {
    return {
      status: 'missing',
      expectedPayloadHash: input.expectedPayload.hash,
      missingBlockIds,
      detachedBlockIds: [],
      diagnostics: missingBlockIds.map((blockId) => `missing-source-block:${blockId}`),
    };
  }

  const presentBlocks = input.currentBlocks.filter((block): block is ProgressiveSourceBlockSnapshot => Boolean(block));
  const detachedBlockIds = presentBlocks
    .filter((block) => String(block.root_id || '').trim() !== input.lineage.rootDocId)
    .map((block) => block.id);
  if (detachedBlockIds.length > 0) {
    return {
      status: 'detached',
      expectedPayloadHash: input.expectedPayload.hash,
      missingBlockIds: [],
      detachedBlockIds,
      diagnostics: detachedBlockIds.map((blockId) => `detached-source-block:${blockId}`),
    };
  }

  const currentPayload = buildProgressiveContentPayloadIdentity({
    sourceBlockIds: input.lineage.sourceBlockIds,
    selectedText: input.selectedText,
    contentDom: input.contentDom,
    sourceBlocks: presentBlocks,
  });
  if (currentPayload.hash !== input.expectedPayload.hash) {
    return {
      status: 'stale',
      expectedPayloadHash: input.expectedPayload.hash,
      currentPayloadHash: currentPayload.hash,
      missingBlockIds: [],
      detachedBlockIds: [],
      diagnostics: ['stale-source-payload'],
    };
  }

  return {
    status: 'current',
    expectedPayloadHash: input.expectedPayload.hash,
    currentPayloadHash: currentPayload.hash,
    missingBlockIds: [],
    detachedBlockIds: [],
    diagnostics: [],
  };
}
