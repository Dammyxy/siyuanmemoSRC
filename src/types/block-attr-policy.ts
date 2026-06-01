export type BlockAttrCleanupMode = 'safe' | 'full';
export type CleanupMode = BlockAttrCleanupMode;

const LEGACY_AI_DRAFT_BLOCK_ATTR_KEYS = Object.freeze([
  'custom-fsrs-ai-kind',
  'custom-fsrs-ai-session-id',
  'custom-fsrs-ai-candidate-id',
  'custom-fsrs-ai-template-id',
  'custom-fsrs-ai-field-name',
  'custom-fsrs-ai-source-block-ids',
  'custom-fsrs-ai-status',
]);

export const BLOCK_ATTR_BINDING_KEYS = Object.freeze([
  'custom-xiuyuan-id',
]);

export const BLOCK_ATTR_WRITABLE_SOURCE_METADATA_KEYS = Object.freeze([
  'custom-xiuyuan-id',
  'custom-fsrs-reading-kind',
  'custom-fsrs-reading-source-doc-id',
  'custom-fsrs-reading-source-block-id',
  'custom-fsrs-reading-parent-topic-card-id',
  'custom-fsrs-reading-parent-excerpt-id',
  'custom-fsrs-reading-storage-mode',
]);

export const BLOCK_ATTR_FUNCTIONAL_KEYS = Object.freeze([
  'custom-fsrs-image-occlusion',
  'custom-fsrs-image-occlusion-version',
  'custom-fsrs-image-occlusion-card-ids',
  'custom-fsrs-suspended',
  'custom-fsrs-leech-tag',
  'custom-fsrs-leech-suspend',
  'custom-fsrs-reading-kind',
  'custom-fsrs-reading-session-id',
  'custom-fsrs-reading-mode',
  'custom-fsrs-reading-source-doc-id',
  'custom-fsrs-reading-source-block-id',
  'custom-fsrs-reading-piece-index',
  'custom-fsrs-reading-piece-count',
  'custom-fsrs-reading-piece-state',
  'custom-fsrs-reading-workbench-id',
  'custom-fsrs-reading-parent-excerpt-id',
  'custom-fsrs-reading-trace-kind',
  'custom-fsrs-reading-parent-topic-card-id',
  'custom-fsrs-reading-storage-mode',
  'custom-fsrs-reading-creation-rule-id',
  'custom-fsrs-reading-answer-fingerprint',
  'custom-fsrs-progressive-kind',
  'custom-fsrs-progressive-session-id',
  'custom-fsrs-progressive-mode',
  'custom-fsrs-progressive-source-doc-id',
  'custom-fsrs-progressive-source-block-id',
  'custom-fsrs-progressive-piece-index',
  'custom-fsrs-progressive-piece-count',
  'custom-fsrs-progressive-piece-state',
  'custom-fsrs-progressive-workbench-id',
  'custom-fsrs-progressive-parent-excerpt-id',
  'custom-fsrs-progressive-trace-kind',
  ...LEGACY_AI_DRAFT_BLOCK_ATTR_KEYS,
]);

export const BLOCK_ATTR_DEPRECATED_KEYS = Object.freeze([
  'custom-fsrs-card-id',
  'custom-fsrs-card-type',
  'custom-fsrs-priority',
  'custom-fsrs-flashcard',
  'custom-fsrs-neural-focus',
  'custom-fsrs-a-factor',
  'custom-xiuyuan-template',
]);

export const BLOCK_ATTR_LEGACY_KEYS = Object.freeze([
  'custom-card-id',
  'custom-card-type',
  'custom-template-id',
  'custom-list-template',
  'custom-priority',
  'custom-fsrs-xiuyuan-id',
  'custom-fsrs-template-id',
]);

export const ALL_PLUGIN_BLOCK_ATTR_KEYS = Object.freeze(
  Array.from(
    new Set([
      ...BLOCK_ATTR_BINDING_KEYS,
      ...BLOCK_ATTR_FUNCTIONAL_KEYS,
      ...BLOCK_ATTR_DEPRECATED_KEYS,
      ...BLOCK_ATTR_LEGACY_KEYS,
    ]),
  ),
);

const SAFE_ALWAYS_REMOVE_SET = new Set<string>([
  ...BLOCK_ATTR_DEPRECATED_KEYS,
  ...BLOCK_ATTR_LEGACY_KEYS,
]);

const WRITABLE_SOURCE_METADATA_SET = new Set<string>(BLOCK_ATTR_WRITABLE_SOURCE_METADATA_KEYS);
const MAX_BLOCK_ATTR_VALUE_BYTES = 192;

export type BlockAttrWriteRejectReason =
  | 'review-scheduler-or-queue-state'
  | 'ai-payload'
  | 'diagnostics-payload'
  | 'large-or-high-churn-payload'
  | 'legacy-read-only'
  | 'not-source-metadata';

export type BlockAttrWriteClassification =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: BlockAttrWriteRejectReason;
    };

function valueByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isExplicitClear(value: unknown): boolean {
  return value === '';
}

function isReviewSchedulerOrQueueAttr(attrName: string): boolean {
  return /(?:review|rating|attempt|due|reps|lapses|last-review|lastReview|scheduler|queue|state|suspended|leech|card-id|card-type|priority|a-factor|flashcard)/i
    .test(attrName);
}

function isAiAttr(attrName: string): boolean {
  return /(?:ai|prompt|response|semantic|arena)/i.test(attrName);
}

function isDiagnosticsAttr(attrName: string): boolean {
  return /(?:diagnostic|diagnostics|debug|trace|payload)/i.test(attrName);
}

function isLargeOrHighChurnAttr(attrName: string, value: string): boolean {
  if (valueByteLength(value) > MAX_BLOCK_ATTR_VALUE_BYTES) {
    return true;
  }
  return /(?:image-occlusion|source-lineage|selection-snapshot|payload-identity|source-position|disclosure-state|derived-item-identity|session-id|piece-index|piece-count|piece-state|workbench-id|creation-rule-id|answer-fingerprint)/i
    .test(attrName);
}

export function isManagedPluginBlockAttr(attrName: string): boolean {
  return ALL_PLUGIN_BLOCK_ATTR_KEYS.includes(attrName);
}

export function classifyBlockAttrWrite(attrName: string, value: string): BlockAttrWriteClassification {
  if (isExplicitClear(value)) {
    return { allowed: true, reason: null };
  }

  if (WRITABLE_SOURCE_METADATA_SET.has(attrName)) {
    if (isLargeOrHighChurnAttr(attrName, value)) {
      return { allowed: false, reason: 'large-or-high-churn-payload' };
    }
    return { allowed: true, reason: null };
  }

  if (attrName === 'custom-fsrs-xiuyuan-id') {
    return { allowed: false, reason: 'legacy-read-only' };
  }
  if (isAiAttr(attrName)) {
    return { allowed: false, reason: 'ai-payload' };
  }
  if (isDiagnosticsAttr(attrName)) {
    return { allowed: false, reason: 'diagnostics-payload' };
  }
  if (isReviewSchedulerOrQueueAttr(attrName)) {
    return { allowed: false, reason: 'review-scheduler-or-queue-state' };
  }
  if (isLargeOrHighChurnAttr(attrName, value)) {
    return { allowed: false, reason: 'large-or-high-churn-payload' };
  }

  return { allowed: false, reason: 'not-source-metadata' };
}

export function isWritableBlockAttr(attrName: string, value: string): boolean {
  return classifyBlockAttrWrite(attrName, value).allowed;
}

export function filterWritableBlockAttrs(attrs: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [attrName, value] of Object.entries(attrs)) {
    if (isWritableBlockAttr(attrName, value)) {
      filtered[attrName] = value;
    }
  }
  return filtered;
}

export function shouldRemoveAttrForMode(
  mode: BlockAttrCleanupMode,
  attrName: string,
  options?: { staleXiuyuanBinding?: boolean },
): boolean {
  if (!isManagedPluginBlockAttr(attrName)) {
    return false;
  }

  if (mode === 'full') {
    return true;
  }

  if (SAFE_ALWAYS_REMOVE_SET.has(attrName)) {
    return true;
  }

  if (attrName === 'custom-xiuyuan-id') {
    return options?.staleXiuyuanBinding === true;
  }

  return false;
}
