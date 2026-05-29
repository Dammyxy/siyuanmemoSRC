import { CardType, type FSRSCard } from '@/types/card';

export type ProtectedSemanticFieldKind =
  | 'identity'
  | 'source'
  | 'type'
  | 'render'
  | 'template'
  | 'xiuyuan-mapping'
  | 'face'
  | 'custom-meta';

export interface ProtectedSemanticPayloadEntry {
  path: string;
  kind: ProtectedSemanticFieldKind;
  value: unknown;
  custom: boolean;
}

export interface ProtectedSemanticPayloadChange {
  path: string;
  kind: ProtectedSemanticFieldKind;
  before: unknown;
  after: unknown;
  custom: boolean;
}

export interface SemanticOverwriteAnalysis {
  changedFields: ProtectedSemanticPayloadChange[];
  customFields: ProtectedSemanticPayloadEntry[];
  requiresConfirmation: boolean;
}

const BUILTIN_TEMPLATE_IDS = new Set([
  'builtin-quick-card',
  'builtin-bidirectional',
  'builtin-bidirectional-single',
  'builtin-list-item',
  'builtin-concept-simple',
  'builtin-concept-definition',
  'builtin-concept-definition-forward',
  'builtin-concept-definition-reverse',
  'builtin-concept-descriptor',
  'builtin-concept-descriptor-reverse',
  'builtin-multi-cloze',
  'builtin-riff-sync',
]);

const BUILTIN_TYPE_MARKERS = new Set([
  'Q',
  'C',
  'qa',
  'forward',
  'reverse',
  'list-qa',
  'list-concept-multiline',
  'list-descriptor-multiline',
  'concept-descriptor',
  'concept-descriptor-forward',
  'concept-descriptor-reverse',
  'concept-definition-forward',
  'concept-definition-reverse',
  'descriptor-forward',
  'descriptor-reverse',
  'multi-cloze',
]);

const BUILTIN_RENDER_PROFILES = new Set([
  'concept',
  'descriptor',
  'concept-definition',
]);

const BUILTIN_CLOZE_RENDER_MODES = new Set([
  'inline-formula-cloze',
]);

const ORDINARY_META_KEYS = new Set([
  'content',
  'fullContent',
  'markdown',
  'title',
  'name',
  'deckId',
  'deckID',
  'rootId',
  'rootID',
  'root_id',
  'tags',
  'suspended',
  'blockType',
  'sourceExists',
  'sourceCheckedAt',
  'sourceMissingAt',
  'missingBlock',
  'missingBlockReason',
]);

const META_FIELD_DEFS: Record<string, {
  kind: ProtectedSemanticFieldKind;
  custom: (value: unknown) => boolean;
}> = {
  xiuyuanID: { kind: 'identity', custom: () => false },
  faceKey: { kind: 'face', custom: () => false },
  faceIndex: { kind: 'face', custom: () => false },
  ruleId: { kind: 'face', custom: (value) => !isBuiltinTypeMarker(value) },
  cardRuleId: { kind: 'face', custom: (value) => !isBuiltinTypeMarker(value) },
  faces: { kind: 'face', custom: () => true },
  templateID: { kind: 'template', custom: (value) => !isBuiltinTemplateId(value) },
  typeMarker: { kind: 'render', custom: (value) => !isBuiltinTypeMarker(value) },
  cardTypeMarker: { kind: 'type', custom: (value) => !isBuiltinCardTypeMarker(value) },
  renderProfile: { kind: 'render', custom: (value) => !isBuiltinRenderProfile(value) },
  clozeRenderMode: { kind: 'render', custom: (value) => !isBuiltinClozeRenderMode(value) },
  forceQuickRender: { kind: 'render', custom: () => false },
  forceProtyleRender: { kind: 'render', custom: () => false },
  quickDetectReason: { kind: 'render', custom: () => false },
  frontBlockIDs: { kind: 'xiuyuan-mapping', custom: () => true },
  backBlockIDs: { kind: 'xiuyuan-mapping', custom: () => true },
  fieldMapping: { kind: 'xiuyuan-mapping', custom: () => true },
  priority: { kind: 'xiuyuan-mapping', custom: () => true },
  sourceLineage: { kind: 'source', custom: () => true },
  sourceUrl: { kind: 'source', custom: () => false },
  extractedFrom: { kind: 'source', custom: () => false },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBuiltinTemplateId(value: unknown): boolean {
  return typeof value === 'string' && BUILTIN_TEMPLATE_IDS.has(value.trim());
}

function isBuiltinTypeMarker(value: unknown): boolean {
  return typeof value === 'string' && BUILTIN_TYPE_MARKERS.has(value.trim());
}

function isBuiltinCardTypeMarker(value: unknown): boolean {
  return value === 'concept' || value === 'descriptor';
}

function isBuiltinRenderProfile(value: unknown): boolean {
  return typeof value === 'string' && BUILTIN_RENDER_PROFILES.has(value.trim());
}

function isBuiltinClozeRenderMode(value: unknown): boolean {
  return typeof value === 'string' && BUILTIN_CLOZE_RENDER_MODES.has(value.trim());
}

function isBuiltinCardType(value: unknown): boolean {
  return value === CardType.Item
    || value === CardType.Topic
    || value === CardType.Concept
    || value === CardType.Descriptor
    || value === CardType.Incremental
    || value === CardType.Webpage;
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function addEntry(
  entries: ProtectedSemanticPayloadEntry[],
  path: string,
  kind: ProtectedSemanticFieldKind,
  value: unknown,
  custom: boolean,
): void {
  if (value === undefined) {
    return;
  }
  entries.push({ path, kind, value, custom });
}

function isAuthoritativeCompatibilityProjection(card: FSRSCard, key: string, value: unknown): boolean {
  if (key === 'xiuyuanID') {
    return valuesEqual(value, card.xiuyuanID);
  }
  if (key === 'faceKey') {
    return valuesEqual(value, card.faceKey);
  }
  if (key === 'sourceUrl') {
    return valuesEqual(value, card.sourceUrl);
  }
  if (key === 'extractedFrom') {
    return valuesEqual(value, card.extractedFrom);
  }
  return false;
}

export function collectProtectedSemanticPayload(card: FSRSCard): ProtectedSemanticPayloadEntry[] {
  const entries: ProtectedSemanticPayloadEntry[] = [];

  addEntry(entries, 'id', 'identity', card.id, false);
  addEntry(entries, 'xiuyuanID', 'identity', card.xiuyuanID, false);
  addEntry(entries, 'blockId', 'source', card.blockId, false);
  addEntry(entries, 'faceKey', 'face', card.faceKey, false);
  addEntry(entries, 'type', 'type', card.type, !isBuiltinCardType(card.type));
  addEntry(entries, 'cardTypeMarker', 'type', card.cardTypeMarker, !isBuiltinCardTypeMarker(card.cardTypeMarker));
  addEntry(entries, 'sourceUrl', 'source', card.sourceUrl, false);
  addEntry(entries, 'extractedFrom', 'source', card.extractedFrom, false);
  addEntry(entries, 'riffCardId', 'source', card.riffCardId, false);

  const meta = isRecord(card.meta) ? card.meta : {};
  for (const [key, value] of Object.entries(meta)) {
    if (isAuthoritativeCompatibilityProjection(card, key, value)) {
      continue;
    }
    const def = META_FIELD_DEFS[key];
    if (def) {
      addEntry(entries, `meta.${key}`, def.kind, value, def.custom(value));
      continue;
    }
    if (!ORDINARY_META_KEYS.has(key)) {
      addEntry(entries, `meta.${key}`, 'custom-meta', value, true);
    }
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function diffProtectedSemanticPayload(
  before: FSRSCard,
  after: FSRSCard,
): ProtectedSemanticPayloadChange[] {
  const beforeEntries = new Map(collectProtectedSemanticPayload(before).map((entry) => [entry.path, entry]));
  const afterEntries = new Map(collectProtectedSemanticPayload(after).map((entry) => [entry.path, entry]));
  const paths = Array.from(new Set([...beforeEntries.keys(), ...afterEntries.keys()])).sort();
  const changes: ProtectedSemanticPayloadChange[] = [];

  for (const path of paths) {
    const beforeEntry = beforeEntries.get(path);
    const afterEntry = afterEntries.get(path);
    const beforeValue = beforeEntry?.value;
    const afterValue = afterEntry?.value;
    if (valuesEqual(beforeValue, afterValue)) {
      continue;
    }
    changes.push({
      path,
      kind: beforeEntry?.kind ?? afterEntry!.kind,
      before: beforeValue,
      after: afterValue,
      custom: Boolean(beforeEntry?.custom || afterEntry?.custom),
    });
  }

  return changes;
}

export function analyzeProtectedSemanticOverwrite(
  before: FSRSCard,
  after: FSRSCard,
): SemanticOverwriteAnalysis {
  const changedFields = diffProtectedSemanticPayload(before, after);
  const customFields = collectProtectedSemanticPayload(before).filter((entry) => entry.custom);

  return {
    changedFields,
    customFields,
    requiresConfirmation: changedFields.length > 0
      && (changedFields.some((field) => field.custom) || customFields.length > 0),
  };
}
