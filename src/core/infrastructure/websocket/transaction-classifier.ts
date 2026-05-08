import type { DoOperation, Transaction } from './transaction-types';

export type TransactionActionClass =
  | 'insert'
  | 'update'
  | 'delete'
  | 'move'
  | 'attrs'
  | 'riff'
  | 'other';

export type AutoCardCandidateEvidence = 'marker' | 'maybe-scan';

export interface ClassifiedAutoCardCandidateOperation {
  action: 'insert' | 'update';
  blockId: string;
  evidence: AutoCardCandidateEvidence;
  opId: string;
}

export interface TransactionClassification {
  transactionCount: number;
  operationCount: number;
  changedBlockIds: string[];
  actionClasses: TransactionActionClass[];
  autoCard: {
    hasMarkerEvidence: boolean;
    candidateOperations: ClassifiedAutoCardCandidateOperation[];
    cancelBlockIds: string[];
    prefilteredNoOpCount: number;
  };
  nativeRiff: {
    hasSignal: boolean;
    upsertBlockIds: string[];
    removeBlockIds: string[];
  };
  documentTree: {
    hasHint: boolean;
    touchedBlockIds: string[];
  };
  hasSiYuanMemoSignal: boolean;
}

const QUICK_CARD_MARKERS = [
  '>>>',
  '>>',
  '》》》',
  '》》',
  '<<',
  '《《',
  '<>',
  '《》',
  '::',
  '：：',
  ';;',
  '；；',
  ';<',
  '；<',
  '；《',
  ';<>',
  '；<>',
  '；《》',
  '{{',
  '}}',
  '==',
  '\\cloze',
  'data-type="mark"',
];

const QUICK_CARD_CONTENT_KEYS = new Set([
  'content',
  'markdown',
  'kramdown',
  'text',
  'html',
  'data',
]);

const RELEVANT_NATIVE_RIFF_UPSERT_ACTIONS = new Set(['insert', 'update', 'delete', 'setAttrs', 'updateAttrs']);
const NATIVE_RIFF_MARKERS = [
  'custom-riff-decks',
  'custom-fsrs-flashcard',
  'flashcard',
  'riffCardID',
  'riffCardId',
  'riffCard',
  'custom-card-type',
];

interface QuickCardPayloadInspection {
  inspected: boolean;
  hasMarker: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function addUnique(target: string[], seen: Set<string>, value: unknown): void {
  const normalized = normalizeId(value);
  if (!normalized || seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  target.push(normalized);
}

function collectArrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeId(entry))
    .filter((entry) => entry.length > 0);
}

function extractOperationBlockIds(operation: DoOperation): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const data = isRecord(operation.data) ? operation.data : {};
  for (const value of [
    operation.id,
    operation.parentID,
    operation.previousID,
    operation.nextID,
    ...collectArrayStrings(operation.blockIDs),
    ...collectArrayStrings(operation.ids),
    ...collectArrayStrings(data.blockIDs),
    ...collectArrayStrings(data.ids),
  ]) {
    addUnique(result, seen, value);
  }
  return result;
}

function primaryOperationBlockId(operation: DoOperation): string {
  return normalizeId(operation.id)
    || collectArrayStrings(operation.blockIDs)[0]
    || collectArrayStrings(operation.ids)[0]
    || '';
}

function classifyAction(actionInput: unknown): TransactionActionClass {
  const action = normalizeId(actionInput);
  if (action === 'insert') return 'insert';
  if (action === 'update') return 'update';
  if (action === 'delete') return 'delete';
  if (action === 'move' || action === 'moveDoc') return 'move';
  if (action === 'setAttrs' || action === 'updateAttrs') return 'attrs';
  if (action === 'addFlashcards' || action === 'removeFlashcards') return 'riff';
  return 'other';
}

function normalizeQuickCardMarkerScanText(value: string): string {
  return value
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&')
    .replace(/&#62;/g, '>')
    .replace(/&#60;/g, '<');
}

function inspectQuickCardPayload(value: unknown, key = ''): QuickCardPayloadInspection {
  if (typeof value === 'string') {
    const inspected = key === '' || QUICK_CARD_CONTENT_KEYS.has(key.toLowerCase());
    const scanText = inspected ? normalizeQuickCardMarkerScanText(value) : '';
    return {
      inspected,
      hasMarker: inspected && QUICK_CARD_MARKERS.some((marker) => scanText.includes(marker)),
    };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (summary, entry) => {
        const next = inspectQuickCardPayload(entry, key);
        return {
          inspected: summary.inspected || next.inspected,
          hasMarker: summary.hasMarker || next.hasMarker,
        };
      },
      { inspected: false, hasMarker: false },
    );
  }
  if (!isRecord(value)) {
    return { inspected: false, hasMarker: false };
  }
  return Object.entries(value).reduce(
    (summary, [childKey, childValue]) => {
      const next = inspectQuickCardPayload(childValue, childKey);
      return {
        inspected: summary.inspected || next.inspected,
        hasMarker: summary.hasMarker || next.hasMarker,
      };
    },
    { inspected: false, hasMarker: false },
  );
}

function inspectOperationQuickCardPayload(operation: DoOperation): QuickCardPayloadInspection {
  const data = operation.data;
  const directPayload = inspectQuickCardPayload(data, 'data');
  const newPayload = inspectQuickCardPayload(isRecord(data) ? data.new : undefined);
  const oldPayload = inspectQuickCardPayload(isRecord(data) ? data.old : undefined);
  return {
    inspected: directPayload.inspected || newPayload.inspected || oldPayload.inspected,
    hasMarker: directPayload.hasMarker || newPayload.hasMarker || oldPayload.hasMarker,
  };
}

function containsNativeRiffMarker(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }
    return NATIVE_RIFF_MARKERS.some((marker) => normalized.includes(marker));
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsNativeRiffMarker(entry));
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nested]) => (
    NATIVE_RIFF_MARKERS.includes(key)
    || containsNativeRiffMarker(nested)
  ));
}

function looksLikeNativeRiffAttrRemoval(operation: DoOperation): boolean {
  if (operation.action !== 'setAttrs' && operation.action !== 'updateAttrs') {
    return false;
  }
  const data = isRecord(operation.data) ? operation.data : undefined;
  return containsNativeRiffMarker(data?.old) && !containsNativeRiffMarker(data?.new);
}

function looksLikeNativeRiffUpsert(operation: DoOperation): boolean {
  if (operation.action === 'addFlashcards') {
    return extractOperationBlockIds(operation).length > 0;
  }
  if (looksLikeNativeRiffAttrRemoval(operation)) {
    return false;
  }
  if (!RELEVANT_NATIVE_RIFF_UPSERT_ACTIONS.has(operation.action)) {
    return false;
  }
  const data = isRecord(operation.data) ? operation.data : undefined;
  return containsNativeRiffMarker(data?.new)
    || containsNativeRiffMarker(data?.old);
}

function extractNativeRiffRemoveBlockIds(operation: DoOperation): string[] {
  if (operation.action === 'removeFlashcards') {
    return extractOperationBlockIds(operation);
  }
  if (looksLikeNativeRiffAttrRemoval(operation)) {
    const blockId = primaryOperationBlockId(operation);
    return blockId ? [blockId] : [];
  }
  return [];
}

function isDocumentTypePayload(value: unknown): boolean {
  return isRecord(value) && normalizeId(value.type) === 'd';
}

function addAutoCardCandidate(
  target: ClassifiedAutoCardCandidateOperation[],
  seen: Set<string>,
  operation: DoOperation,
  evidence: AutoCardCandidateEvidence,
): void {
  const blockId = primaryOperationBlockId(operation);
  if (!blockId) {
    return;
  }
  const key = `${operation.action}:${blockId}:${evidence}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  target.push({
    action: operation.action as 'insert' | 'update',
    blockId,
    evidence,
    opId: normalizeId(operation.id) || blockId,
  });
}

export function classifyTransactionBatch(transactions: Transaction[]): TransactionClassification {
  const changedBlockIds: string[] = [];
  const changedSeen = new Set<string>();
  const actionClasses: TransactionActionClass[] = [];
  const actionSeen = new Set<TransactionActionClass>();
  const autoCardCandidateOperations: ClassifiedAutoCardCandidateOperation[] = [];
  const autoCardCandidateSeen = new Set<string>();
  const autoCardCancelBlockIds: string[] = [];
  const autoCardCancelSeen = new Set<string>();
  const nativeRiffUpsertBlockIds: string[] = [];
  const nativeRiffUpsertSeen = new Set<string>();
  const nativeRiffRemoveBlockIds: string[] = [];
  const nativeRiffRemoveSeen = new Set<string>();
  const documentTreeTouchedBlockIds: string[] = [];
  const documentTreeTouchedSeen = new Set<string>();
  let operationCount = 0;
  let hasAutoCardMarkerEvidence = false;
  let prefilteredNoOpCount = 0;
  let documentTreeHasHint = false;

  for (const transaction of Array.isArray(transactions) ? transactions : []) {
    const operations = Array.isArray(transaction.doOperations) ? transaction.doOperations : [];
    for (const operation of operations) {
      operationCount += 1;
      const actionClass = classifyAction(operation.action);
      if (!actionSeen.has(actionClass)) {
        actionSeen.add(actionClass);
        actionClasses.push(actionClass);
      }

      const operationBlockIds = extractOperationBlockIds(operation);
      for (const blockId of operationBlockIds) {
        addUnique(changedBlockIds, changedSeen, blockId);
      }

      if (operation.action === 'insert' || operation.action === 'update') {
        const quickCardPayload = inspectOperationQuickCardPayload(operation);
        if (quickCardPayload.hasMarker) {
          hasAutoCardMarkerEvidence = true;
          addAutoCardCandidate(autoCardCandidateOperations, autoCardCandidateSeen, operation, 'marker');
        } else if (quickCardPayload.inspected) {
          prefilteredNoOpCount += 1;
        } else {
          addAutoCardCandidate(autoCardCandidateOperations, autoCardCandidateSeen, operation, 'maybe-scan');
        }
      } else if (operation.action === 'delete') {
        addUnique(autoCardCancelBlockIds, autoCardCancelSeen, primaryOperationBlockId(operation));
      }

      if (looksLikeNativeRiffUpsert(operation)) {
        for (const blockId of operationBlockIds) {
          addUnique(nativeRiffUpsertBlockIds, nativeRiffUpsertSeen, blockId);
        }
      }
      for (const blockId of extractNativeRiffRemoveBlockIds(operation)) {
        addUnique(nativeRiffRemoveBlockIds, nativeRiffRemoveSeen, blockId);
      }

      const operationData = isRecord(operation.data) ? operation.data : undefined;
      if (isDocumentTypePayload(operationData?.new) || isDocumentTypePayload(operationData?.old)) {
        documentTreeHasHint = true;
      }
      if (documentTreeHasHint || actionClass === 'move') {
        for (const blockId of operationBlockIds) {
          addUnique(documentTreeTouchedBlockIds, documentTreeTouchedSeen, blockId);
        }
      }
    }
  }

  const nativeRiffHasSignal = nativeRiffUpsertBlockIds.length > 0 || nativeRiffRemoveBlockIds.length > 0;
  const hasSiYuanMemoSignal = autoCardCandidateOperations.length > 0
    || autoCardCancelBlockIds.length > 0
    || nativeRiffHasSignal
    || documentTreeHasHint;

  return {
    transactionCount: Array.isArray(transactions) ? transactions.length : 0,
    operationCount,
    changedBlockIds,
    actionClasses,
    autoCard: {
      hasMarkerEvidence: hasAutoCardMarkerEvidence,
      candidateOperations: autoCardCandidateOperations,
      cancelBlockIds: autoCardCancelBlockIds,
      prefilteredNoOpCount,
    },
    nativeRiff: {
      hasSignal: nativeRiffHasSignal,
      upsertBlockIds: nativeRiffUpsertBlockIds,
      removeBlockIds: nativeRiffRemoveBlockIds,
    },
    documentTree: {
      hasHint: documentTreeHasHint,
      touchedBlockIds: documentTreeTouchedBlockIds,
    },
    hasSiYuanMemoSignal,
  };
}

export function shouldDispatchKernelTransactionIngest(classification: TransactionClassification): boolean {
  return classification.autoCard.candidateOperations.length > 0
    || classification.nativeRiff.hasSignal
    || classification.documentTree.hasHint;
}

export function shouldDispatchAutoCard(classification: TransactionClassification): boolean {
  return classification.autoCard.candidateOperations.length > 0
    || classification.autoCard.cancelBlockIds.length > 0;
}

export function shouldDispatchNativeRiffSync(classification: TransactionClassification): boolean {
  return classification.nativeRiff.hasSignal;
}

export function shouldDispatchDocTreeReviewScope(classification: TransactionClassification): boolean {
  return classification.documentTree.hasHint;
}
