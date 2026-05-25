export type ProcessingWorkKind = 'document' | 'excerpt' | 'progressive-item' | 'topic-derived';

export type ProcessingPrioritySourceKind = 'manual' | 'ancestor' | 'context-override' | 'default';

export interface ProcessingPrioritySourceRef {
  kind: ProcessingPrioritySourceKind;
  id: string;
  priority: number;
}

export interface ProcessingPrioritySourceIdentity {
  version: 1;
  source: ProcessingPrioritySourceKind;
  sourceId: string;
  priority: number;
  fingerprint: string;
}

export interface ProcessingWorkItem {
  id: string;
  kind: ProcessingWorkKind;
  sourceId: string;
  processingDueAt: number | null;
  manualPriority?: number | null;
  sourceLineage?: string[];
  contextKey?: string | null;
  payload?: Record<string, unknown>;
}

export interface ProcessingPriorityPolicy {
  defaultPriority: number;
  ancestorPriorities?: Record<string, number | null | undefined>;
  contextOverrides?: Partial<Record<ProcessingWorkKind | string, number | null | undefined>>;
}

export interface EffectiveProcessingPriority {
  value: number;
  source: ProcessingPrioritySourceRef;
  identity: ProcessingPrioritySourceIdentity;
}

export interface ProcessingQueueEntry {
  item: ProcessingWorkItem;
  priority: EffectiveProcessingPriority;
  dueState: 'due' | 'future' | 'unscheduled';
  sortKey: string;
}

export interface ProcessingQueueReadInput {
  items: ProcessingWorkItem[];
  now: number;
  policy: ProcessingPriorityPolicy;
  includeFuture?: boolean;
}

export interface ProcessingQueueReadResult {
  entries: ProcessingQueueEntry[];
  counters: {
    total: number;
    due: number;
    future: number;
    unscheduled: number;
  };
}

export interface PrioritySourceChange {
  sourceId: string;
  before?: ProcessingPrioritySourceIdentity | null;
  after?: ProcessingPrioritySourceIdentity | null;
}

export interface ProcessingPriorityInvalidationPlan {
  reason: 'priority-source-changed';
  sourceId: string;
  affectedProcessingItemIds: string[];
  affectedReviewCardIds: string[];
  affectedBlockIds: string[];
  projectionFamilies: Array<'processing' | 'review'>;
  refreshRequired: boolean;
}

export function resolveEffectiveProcessingPriority(
  item: ProcessingWorkItem,
  policy: ProcessingPriorityPolicy,
): EffectiveProcessingPriority {
  const manual = finitePriorityOrNull(item.manualPriority);
  if (manual !== null) {
    return buildEffectivePriority({
      kind: 'manual',
      id: item.id,
      priority: manual,
    });
  }

  const ancestorPriorities = policy.ancestorPriorities ?? {};
  for (const ancestorId of item.sourceLineage ?? []) {
    const priority = finitePriorityOrNull(ancestorPriorities[ancestorId]);
    if (priority !== null) {
      return buildEffectivePriority({
        kind: 'ancestor',
        id: ancestorId,
        priority,
      });
    }
  }

  const contextKey = item.contextKey || item.kind;
  const context = finitePriorityOrNull(policy.contextOverrides?.[contextKey]);
  if (context !== null) {
    return buildEffectivePriority({
      kind: 'context-override',
      id: contextKey,
      priority: context,
    });
  }

  const fallback = finitePriorityOrNull(policy.defaultPriority) ?? 50;
  return buildEffectivePriority({
    kind: 'default',
    id: 'policy-default',
    priority: fallback,
  });
}

export function readProcessingQueue(input: ProcessingQueueReadInput): ProcessingQueueReadResult {
  const includeFuture = input.includeFuture === true;
  const entries = input.items
    .map((item): ProcessingQueueEntry => {
      const priority = resolveEffectiveProcessingPriority(item, input.policy);
      const dueState = resolveProcessingDueState(item.processingDueAt, input.now);
      return {
        item: { ...item, payload: item.payload ? { ...item.payload } : undefined },
        priority,
        dueState,
        sortKey: buildProcessingSortKey(item, priority, dueState),
      };
    })
    .filter((entry) => includeFuture || entry.dueState === 'due')
    .sort(compareProcessingEntries);

  return {
    entries,
    counters: {
      total: entries.length,
      due: entries.filter((entry) => entry.dueState === 'due').length,
      future: entries.filter((entry) => entry.dueState === 'future').length,
      unscheduled: entries.filter((entry) => entry.dueState === 'unscheduled').length,
    },
  };
}

export function buildProcessingPrioritySourceIdentity(source: ProcessingPrioritySourceRef): ProcessingPrioritySourceIdentity {
  const normalized = {
    version: 1 as const,
    source: source.kind,
    sourceId: normalizeIdentityPart(source.id) || source.kind,
    priority: normalizePriority(source.priority),
  };
  return {
    ...normalized,
    fingerprint: fnv1a32(stableStringify(normalized)),
  };
}

export function planProcessingPriorityInvalidation(input: {
  change: PrioritySourceChange;
  items: ProcessingWorkItem[];
  reviewRefs?: Array<{ cardId: string; blockId?: string | null; sourceLineage?: string[] }>;
}): ProcessingPriorityInvalidationPlan {
  const sourceId = normalizeIdentityPart(input.change.sourceId);
  const affectedProcessingItemIds = uniqueStrings(input.items
    .filter((item) => item.sourceLineage?.includes(sourceId) || item.sourceId === sourceId)
    .map((item) => item.id));
  const affectedReviewRefs = (input.reviewRefs ?? [])
    .filter((ref) => ref.sourceLineage?.includes(sourceId));

  return {
    reason: 'priority-source-changed',
    sourceId,
    affectedProcessingItemIds,
    affectedReviewCardIds: uniqueStrings(affectedReviewRefs.map((ref) => ref.cardId)),
    affectedBlockIds: uniqueStrings(affectedReviewRefs.map((ref) => ref.blockId)),
    projectionFamilies: [
      ...(affectedProcessingItemIds.length > 0 ? ['processing' as const] : []),
      ...(affectedReviewRefs.length > 0 ? ['review' as const] : []),
    ],
    refreshRequired: affectedProcessingItemIds.length > 0 || affectedReviewRefs.length > 0,
  };
}

function buildEffectivePriority(source: ProcessingPrioritySourceRef): EffectiveProcessingPriority {
  const normalizedSource = {
    ...source,
    id: normalizeIdentityPart(source.id) || source.kind,
    priority: normalizePriority(source.priority),
  };
  return {
    value: normalizedSource.priority,
    source: normalizedSource,
    identity: buildProcessingPrioritySourceIdentity(normalizedSource),
  };
}

function resolveProcessingDueState(dueAt: number | null, now: number): ProcessingQueueEntry['dueState'] {
  if (!Number.isFinite(Number(dueAt))) {
    return 'unscheduled';
  }
  return Number(dueAt) <= now ? 'due' : 'future';
}

function compareProcessingEntries(left: ProcessingQueueEntry, right: ProcessingQueueEntry): number {
  const dueDelta = dueSortValue(left) - dueSortValue(right);
  if (dueDelta !== 0) {
    return dueDelta;
  }

  const priorityDelta = left.priority.value - right.priority.value;
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.item.id.localeCompare(right.item.id);
}

function dueSortValue(entry: ProcessingQueueEntry): number {
  if (entry.dueState === 'unscheduled') {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(entry.item.processingDueAt);
}

function buildProcessingSortKey(
  item: ProcessingWorkItem,
  priority: EffectiveProcessingPriority,
  dueState: ProcessingQueueEntry['dueState'],
): string {
  const duePart = dueState === 'unscheduled'
    ? '9999999999999999'
    : String(Math.max(0, Math.floor(Number(item.processingDueAt)))).padStart(16, '0');
  return `${duePart}:${String(priority.value).padStart(3, '0')}:${priority.identity.fingerprint}:${item.id}`;
}

function finitePriorityOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? normalizePriority(numeric) : null;
}

function normalizePriority(value: number): number {
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function normalizeIdentityPart(value: unknown): string {
  return String(value ?? '').trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const valueType = typeof value;
  if (valueType === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (valueType === 'boolean' || valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.entries(record)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }
  return 'null';
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
