import type { FSRSCard } from '@/types/card';
import type { CdfRelationKind } from '@/core/card/cdf-live-relation';
import { readCdfLiveRelationMetadata } from '@/core/card/cdf-live-relation';

export type ReviewStructuredCardFamily =
  | 'item'
  | 'definition'
  | 'descriptor'
  | 'source';

export type ReviewStructuredFieldRole =
  | 'question'
  | 'answer'
  | 'definition'
  | 'cue'
  | 'source';

export type ReviewStructuredFieldOriginKind =
  | 'field-mapping'
  | 'block-id'
  | 'grammar'
  | 'source-fallback';

export type ReviewStructuredDirectionKind = 'forward' | 'reverse' | 'both' | 'unknown';

export interface ReviewStructuredFieldOriginInput {
  role: ReviewStructuredFieldRole;
  value: string;
  blockId?: string | null;
  originKind: ReviewStructuredFieldOriginKind;
}

export interface ReviewStructuredFieldInput extends ReviewStructuredFieldOriginInput {
  id?: string;
  label?: string;
  required?: boolean;
}

export interface ReviewStructuredSourceFallbackInput {
  value: string;
  blockId?: string | null;
  reason?: string;
}

export interface ReviewStructuredExplicitFieldSource {
  id: string;
  blockId: string;
  title?: string;
  value: string;
  role?: string;
  rendererKind?: string;
}

export interface ReviewStructuredExplicitFieldModelInput {
  card: FSRSCard | null | undefined;
  sources: ReviewStructuredExplicitFieldSource[];
  family?: ReviewStructuredCardFamily;
  fallbackReason?: string;
}

export interface ReviewStructuredFieldOrigin {
  kind: ReviewStructuredFieldOriginKind;
  blockId: string | null;
  hash: string;
}

export interface ReviewStructuredField {
  id: string;
  role: ReviewStructuredFieldRole;
  label: string;
  value: string;
  originalValue: string;
  required: boolean;
  multiline: true;
  readonly: false;
  origin: ReviewStructuredFieldOrigin;
}

export interface ReviewStructuredRelationChip {
  kind: 'concept';
  blockId: string;
  label: string;
  readonly: true;
}

export interface ReviewStructuredDirection {
  kind: ReviewStructuredDirectionKind;
  relationKind: CdfRelationKind | null;
  readonly: true;
}

export interface ReviewStructuredFieldModelInput {
  card: FSRSCard | null | undefined;
  family: ReviewStructuredCardFamily;
  fields?: ReviewStructuredFieldInput[];
  sourceFallback?: ReviewStructuredSourceFallbackInput;
  directionKind?: ReviewStructuredDirectionKind;
}

export interface ReviewStructuredFieldModel {
  mode: 'structured' | 'source-fallback';
  family: ReviewStructuredCardFamily;
  fields: ReviewStructuredField[];
  relationChips: ReviewStructuredRelationChip[];
  direction: ReviewStructuredDirection;
  fallbackReason: string | null;
}

const FIELD_LABELS: Record<ReviewStructuredFieldRole, string> = {
  question: 'Question',
  answer: 'Answer',
  definition: 'Definition',
  cue: 'Cue',
  source: 'Source',
};

const DEFAULT_REQUIRED_BY_ROLE: Record<ReviewStructuredFieldRole, boolean> = {
  question: true,
  answer: true,
  definition: true,
  cue: true,
  source: true,
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeString).filter(Boolean);
}

function readFieldMapping(card: FSRSCard | null | undefined): Record<string, string> {
  const mapping = readRecord(card?.meta?.fieldMapping);
  if (!mapping) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    const normalized = normalizeString(value);
    if (normalized) {
      result[key] = normalized;
    }
  }
  return result;
}

function readMetaBlockId(card: FSRSCard | null | undefined, key: string): string {
  return normalizeString(card?.meta?.[key]);
}

function readFirstMetaBlockId(card: FSRSCard | null | undefined, key: string): string {
  return readStringArray(card?.meta?.[key])[0] || '';
}

function toHashBase36(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function createReviewStructuredFieldOriginHash(input: ReviewStructuredFieldOriginInput): string {
  const payload = [
    input.originKind,
    input.blockId || '',
    input.role,
    input.value,
  ].join('\u001f');
  return `rsh_${toHashBase36(payload)}`;
}

function createField(input: ReviewStructuredFieldInput): ReviewStructuredField {
  const value = String(input.value ?? '');
  const role = input.role;
  const originKind = input.originKind;
  const blockId = normalizeString(input.blockId) || null;
  return {
    id: input.id || role,
    role,
    label: input.label || FIELD_LABELS[role],
    value,
    originalValue: value,
    required: input.required ?? DEFAULT_REQUIRED_BY_ROLE[role],
    multiline: true,
    readonly: false,
    origin: {
      kind: originKind,
      blockId,
      hash: createReviewStructuredFieldOriginHash({
        role,
        value,
        blockId,
        originKind,
      }),
    },
  };
}

function relationKindToDirectionKind(relationKind: CdfRelationKind | undefined): ReviewStructuredDirectionKind {
  if (!relationKind) {
    return 'unknown';
  }
  if (relationKind.endsWith('-forward')) {
    return 'forward';
  }
  if (relationKind.endsWith('-reverse')) {
    return 'reverse';
  }
  return 'unknown';
}

function readLegacyDirection(card: FSRSCard | null | undefined): ReviewStructuredDirectionKind {
  const ruleId = normalizeString(card?.faceKey?.ruleId);
  const typeMarker = normalizeString(card?.meta?.typeMarker);
  const templateID = normalizeString(card?.meta?.templateID);
  const token = `${ruleId} ${typeMarker} ${templateID}`.toLowerCase();
  if (token.includes('both')) {
    return 'both';
  }
  if (token.includes('reverse')) {
    return 'reverse';
  }
  if (token.includes('forward')) {
    return 'forward';
  }
  return 'unknown';
}

export function resolveReviewStructuredCardFamily(
  card: FSRSCard | null | undefined,
): Exclude<ReviewStructuredCardFamily, 'source'> {
  const liveRelationKind = readCdfLiveRelationMetadata(card).relationKind;
  if (liveRelationKind?.startsWith('definition-')) {
    return 'definition';
  }
  if (liveRelationKind?.startsWith('descriptor-')) {
    return 'descriptor';
  }

  const cardType = normalizeString(card?.type).toLowerCase();
  const cardTypeMarker = normalizeString(card?.cardTypeMarker).toLowerCase();
  const metaCardTypeMarker = normalizeString(card?.meta?.cardTypeMarker).toLowerCase();
  const typeMarker = normalizeString(card?.meta?.typeMarker).toLowerCase();
  const templateID = normalizeString(card?.meta?.templateID).toLowerCase();
  const token = `${cardType} ${cardTypeMarker} ${metaCardTypeMarker} ${typeMarker} ${templateID}`;

  if (token.includes('definition')) {
    return 'definition';
  }
  if (token.includes('descriptor')) {
    return 'descriptor';
  }

  const fieldMapping = readFieldMapping(card);
  if (fieldMapping.descriptor) {
    return 'descriptor';
  }
  if (fieldMapping.definition) {
    return 'definition';
  }

  return 'item';
}

function createDirection(
  card: FSRSCard | null | undefined,
  explicitDirection: ReviewStructuredDirectionKind | undefined,
): ReviewStructuredDirection {
  const meta = readCdfLiveRelationMetadata(card);
  const liveDirection = relationKindToDirectionKind(meta.relationKind);
  return {
    kind: explicitDirection
      ?? (liveDirection !== 'unknown' ? liveDirection : readLegacyDirection(card)),
    relationKind: meta.relationKind ?? null,
    readonly: true,
  };
}

function readConceptDisplay(metaSnapshot: Record<string, unknown> | null): string {
  return normalizeString(metaSnapshot?.displayText)
    || normalizeString(metaSnapshot?.title)
    || normalizeString(metaSnapshot?.name);
}

function createRelationChips(card: FSRSCard | null | undefined): ReviewStructuredRelationChip[] {
  const liveMeta = readCdfLiveRelationMetadata(card);
  const snapshot = readRecord(liveMeta.conceptSnapshot);
  const snapshotId = normalizeString(snapshot?.conceptBlockId);
  const conceptBlockId = liveMeta.conceptBlockId || snapshotId;
  if (!conceptBlockId) {
    return [];
  }

  return [{
    kind: 'concept',
    blockId: conceptBlockId,
    label: readConceptDisplay(snapshot) || conceptBlockId,
    readonly: true,
  }];
}

function createSourceFallbackField(input: ReviewStructuredFieldModelInput): ReviewStructuredField {
  const fallback = input.sourceFallback;
  return createField({
    role: 'source',
    value: fallback?.value ?? '',
    blockId: fallback?.blockId || input.card?.blockId || null,
    originKind: 'source-fallback',
  });
}

export function buildReviewStructuredFieldModel(
  input: ReviewStructuredFieldModelInput,
): ReviewStructuredFieldModel {
  const hasSourceFallback = input.family === 'source' || !!input.sourceFallback;
  const fields = hasSourceFallback
    ? [createSourceFallbackField(input)]
    : (input.fields || []).map(createField);

  return {
    mode: hasSourceFallback ? 'source-fallback' : 'structured',
    family: hasSourceFallback ? 'source' : input.family,
    fields,
    relationChips: createRelationChips(input.card),
    direction: createDirection(input.card, input.directionKind),
    fallbackReason: hasSourceFallback ? input.sourceFallback?.reason ?? 'unsafe-field-identity' : null,
  };
}

function normalizeExplicitSources(
  sources: ReviewStructuredExplicitFieldSource[],
): ReviewStructuredExplicitFieldSource[] {
  const normalized: ReviewStructuredExplicitFieldSource[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const blockId = normalizeString(source.blockId);
    if (!blockId || seen.has(blockId)) {
      continue;
    }
    seen.add(blockId);
    normalized.push({
      ...source,
      blockId,
      value: String(source.value ?? ''),
      role: normalizeString(source.role),
      rendererKind: normalizeString(source.rendererKind),
    });
  }
  return normalized;
}

function findExplicitSourceByBlockId(
  sources: ReviewStructuredExplicitFieldSource[],
  blockId: string,
): ReviewStructuredExplicitFieldSource | null {
  const normalized = normalizeString(blockId);
  if (!normalized) {
    return null;
  }
  return sources.find(source => source.blockId === normalized) || null;
}

function findExplicitSourceByRole(
  sources: ReviewStructuredExplicitFieldSource[],
  role: string,
): ReviewStructuredExplicitFieldSource | null {
  return sources.find(source => source.role === role) || null;
}

function createExplicitField(
  role: ReviewStructuredFieldRole,
  source: ReviewStructuredExplicitFieldSource,
  originKind: ReviewStructuredFieldOriginKind,
  label?: string,
): ReviewStructuredFieldInput {
  return {
    id: role === 'source' ? `${source.role || source.rendererKind || 'source'}-source` : role,
    role,
    label,
    value: source.value,
    blockId: source.blockId,
    originKind,
  };
}

function createExplicitSourceFallback(
  input: ReviewStructuredExplicitFieldModelInput,
  sources: ReviewStructuredExplicitFieldSource[],
  reason: string,
): ReviewStructuredFieldModel {
  const primarySource = sources[0];
  const liveMeta = readCdfLiveRelationMetadata(input.card);
  return buildReviewStructuredFieldModel({
    card: input.card,
    family: 'source',
    sourceFallback: {
      value: primarySource?.value ?? '',
      blockId: primarySource?.blockId || liveMeta.sourceBlockId || input.card?.blockId || null,
      reason,
    },
  });
}

function buildItemFieldsFromExplicitSources(
  card: FSRSCard | null | undefined,
  sources: ReviewStructuredExplicitFieldSource[],
): ReviewStructuredFieldInput[] {
  const fieldMapping = readFieldMapping(card);
  const mappedQuestionBlockId = fieldMapping.question || fieldMapping.front || fieldMapping.prompt || '';
  const mappedAnswerBlockId = fieldMapping.answer || fieldMapping.back || fieldMapping.response || '';
  if (mappedQuestionBlockId && mappedAnswerBlockId && mappedQuestionBlockId !== mappedAnswerBlockId) {
    const question = findExplicitSourceByBlockId(sources, mappedQuestionBlockId);
    const answer = findExplicitSourceByBlockId(sources, mappedAnswerBlockId);
    if (question && answer) {
      return [
        createExplicitField('question', question, 'field-mapping'),
        createExplicitField('answer', answer, 'field-mapping'),
      ];
    }
  }

  const metaQuestionBlockId = readMetaBlockId(card, 'questionBlockId') || readFirstMetaBlockId(card, 'frontBlockIDs');
  const metaAnswerBlockId = readMetaBlockId(card, 'answerBlockId') || readFirstMetaBlockId(card, 'backBlockIDs');
  if (metaQuestionBlockId && metaAnswerBlockId && metaQuestionBlockId !== metaAnswerBlockId) {
    const question = findExplicitSourceByBlockId(sources, metaQuestionBlockId);
    const answer = findExplicitSourceByBlockId(sources, metaAnswerBlockId);
    if (question && answer) {
      return [
        createExplicitField('question', question, 'block-id'),
        createExplicitField('answer', answer, 'block-id'),
      ];
    }
  }

  return [];
}

function buildDefinitionFieldsFromExplicitSources(
  card: FSRSCard | null | undefined,
  sources: ReviewStructuredExplicitFieldSource[],
): ReviewStructuredFieldInput[] {
  const fieldMapping = readFieldMapping(card);
  const liveMeta = readCdfLiveRelationMetadata(card);
  const mappedDefinitionBlockId = fieldMapping.definition || '';
  const mappedDefinition = findExplicitSourceByBlockId(sources, mappedDefinitionBlockId)
    || (mappedDefinitionBlockId ? null : findExplicitSourceByRole(sources, 'definition'));
  if (mappedDefinition) {
    return [createExplicitField('definition', mappedDefinition, 'field-mapping')];
  }

  const sourceBlockId = liveMeta.relationKind?.startsWith('definition-')
    ? liveMeta.sourceBlockId || readFirstMetaBlockId(card, 'backBlockIDs') || readFirstMetaBlockId(card, 'frontBlockIDs')
    : '';
  const source = findExplicitSourceByBlockId(sources, sourceBlockId);
  return source ? [createExplicitField('definition', source, 'block-id')] : [];
}

function buildDescriptorFieldsFromExplicitSources(
  card: FSRSCard | null | undefined,
  sources: ReviewStructuredExplicitFieldSource[],
): ReviewStructuredFieldInput[] {
  const fieldMapping = readFieldMapping(card);
  const liveMeta = readCdfLiveRelationMetadata(card);
  const mappedDescriptorBlockId = fieldMapping.descriptor || '';
  const mappedDescriptor = findExplicitSourceByBlockId(sources, mappedDescriptorBlockId)
    || (mappedDescriptorBlockId ? null : findExplicitSourceByRole(sources, 'descriptor'));
  if (mappedDescriptor) {
    return [createExplicitField('source', mappedDescriptor, 'field-mapping', 'Descriptor')];
  }

  const sourceBlockId = liveMeta.relationKind?.startsWith('descriptor-')
    ? liveMeta.sourceBlockId || readFirstMetaBlockId(card, 'frontBlockIDs') || readFirstMetaBlockId(card, 'backBlockIDs')
    : '';
  const source = findExplicitSourceByBlockId(sources, sourceBlockId);
  return source ? [createExplicitField('source', source, 'block-id', 'Descriptor')] : [];
}

function hasBlockingInvalidGrammarIssue(card: FSRSCard | null | undefined): boolean {
  return readCdfLiveRelationMetadata(card).liveRelationIssues.some(issue => (
    issue.code === 'invalid-source-grammar' && issue.severity === 'blocking'
  ));
}

export function buildReviewStructuredFieldModelFromExplicitSources(
  input: ReviewStructuredExplicitFieldModelInput,
): ReviewStructuredFieldModel {
  const sources = normalizeExplicitSources(input.sources || []);
  const family = input.family && input.family !== 'source'
    ? input.family
    : resolveReviewStructuredCardFamily(input.card);

  if (sources.length === 0) {
    return buildReviewStructuredFieldModel({
      card: input.card,
      family,
    });
  }

  if (hasBlockingInvalidGrammarIssue(input.card)) {
    return createExplicitSourceFallback(input, sources, 'invalid-source-grammar');
  }

  const fields = family === 'definition'
    ? buildDefinitionFieldsFromExplicitSources(input.card, sources)
    : family === 'descriptor'
      ? buildDescriptorFieldsFromExplicitSources(input.card, sources)
      : buildItemFieldsFromExplicitSources(input.card, sources);

  if (fields.length === 0) {
    return createExplicitSourceFallback(
      input,
      sources,
      input.fallbackReason || 'explicit-field-identity-unavailable',
    );
  }

  return buildReviewStructuredFieldModel({
    card: input.card,
    family,
    fields,
  });
}
