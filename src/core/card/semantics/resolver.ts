import { CardType, type FSRSCard } from '@/types/card';
import { buildSrsCardQuickSymbolRenderRepairPatch } from '@/core/card/render-contract';
import {
  readSrsCardCreationReceipt,
  SRS_CARD_CREATION_RECEIPT_META_KEY,
} from './creationReceipt';
import type {
  SrsCardSemanticAuditResult,
  SrsCardSemanticDiagnostic,
  SrsCardSemanticEvidence,
  SrsCardSemanticKind,
  SrsCardSemanticPatch,
  SrsCardSemanticRepairPlan,
  SrsCardSemanticResolverInput,
  SrsCardSemanticResolution,
} from './types';
import { isSrsCardSemanticKind } from './types';

const LIST_TEMPLATE_IDS = new Set(['builtin-list-item']);
const ITEM_TEMPLATE_IDS = new Set([
  'builtin-quick-card',
  'builtin-basic-qa',
  'builtin-bidirectional',
  'builtin-bidirectional-single',
  'builtin-multi-cloze',
  'builtin-riff-sync',
]);
const CONCEPT_TEMPLATE_IDS = new Set(['builtin-concept-simple']);
const DESCRIPTOR_TEMPLATE_IDS = new Set([
  'builtin-concept-definition',
  'builtin-concept-definition-forward',
  'builtin-concept-definition-reverse',
  'builtin-concept-descriptor',
  'builtin-concept-descriptor-forward',
  'builtin-concept-descriptor-reverse',
  'builtin-concept-descriptor-both',
]);
const TOPIC_TEMPLATE_IDS = new Set(['builtin-topic']);
const ITEM_TYPE_MARKERS = new Set([
  'Q',
  'qa',
  'forward',
  'reverse',
  'list-qa',
  'list-concept-multiline',
  'list-descriptor-multiline',
  'multi-cloze',
]);
const CONCEPT_TYPE_MARKERS = new Set(['C', 'concept']);
const DESCRIPTOR_TYPE_MARKERS = new Set([
  'descriptor',
  'concept-descriptor',
  'concept-descriptor-forward',
  'concept-descriptor-reverse',
  'concept-definition',
  'concept-definition-forward',
  'concept-definition-reverse',
  'descriptor-forward',
  'descriptor-reverse',
]);
const COMMIT_PROOF_SOURCES = new Set<SrsCardSemanticEvidence['source']>([
  'creation-receipt',
  'template',
  'card-marker',
  'progressive',
  'block-attr',
  'symbol-source',
]);

export function resolveCardSemantics(input: SrsCardSemanticResolverInput): SrsCardSemanticResolution {
  const { card } = input;
  const evidence = collectEvidence(input);
  const persistedKind = isSrsCardSemanticKind(card.type) ? card.type : null;
  const diagnostics: SrsCardSemanticDiagnostic[] = [];
  const commitProofs = evidence.filter((item) => {
    return item.kind
      && item.strength === 'deterministic'
      && COMMIT_PROOF_SOURCES.has(item.source);
  });
  const commitKinds = Array.from(new Set(commitProofs.map((item) => item.kind)));

  for (const item of evidence) {
    if (item.source === 'creation-receipt' && item.valid === false) {
      diagnostics.push({
        code: 'semantic-receipt-invalid',
        message: 'Creation receipt is diagnostic only because required identity evidence is missing or mismatched.',
        evidence: [item],
      });
    }
  }

  if (commitKinds.length > 1) {
    diagnostics.push({
      code: 'semantic-evidence-conflict',
      message: 'Deterministic semantic evidence disagrees; automatic repair is unsafe.',
      evidence: commitProofs,
    });
    return {
      cardId: card.id,
      persistedKind,
      effectiveKind: null,
      confidence: 'ambiguous',
      evidence,
      diagnostics,
      patch: null,
    };
  }

  const effectiveKind = (commitKinds[0] ?? persistedKind) || null;
  if (!effectiveKind) {
    diagnostics.push({
      code: 'semantic-evidence-missing',
      message: 'No deterministic SRS semantic evidence found.',
      evidence,
    });
    return {
      cardId: card.id,
      persistedKind,
      effectiveKind: null,
      confidence: 'insufficient',
      evidence,
      diagnostics,
      patch: null,
    };
  }

  const rawTypeEvidence = evidence.find((item) => item.source === 'raw-type');
  if (persistedKind && persistedKind !== effectiveKind && rawTypeEvidence) {
    diagnostics.push({
      code: 'semantic-raw-type-mismatch',
      message: `Persisted card type ${persistedKind} differs from effective semantic kind ${effectiveKind}.`,
      evidence: [rawTypeEvidence],
    });
  }

  const markerEvidence = evidence.filter((item) => item.source === 'card-marker' && item.kind && item.kind !== effectiveKind);
  if (markerEvidence.length > 0) {
    diagnostics.push({
      code: 'semantic-marker-mismatch',
      message: 'Card semantic markers disagree with effective semantic kind.',
      evidence: markerEvidence,
    });
  }

  return {
    cardId: card.id,
    persistedKind,
    effectiveKind,
    confidence: 'deterministic',
    evidence,
    diagnostics,
    patch: buildRepairPatch(card, effectiveKind),
  };
}

export function auditCardSemantics(input: SrsCardSemanticResolverInput): SrsCardSemanticAuditResult {
  const resolution = resolveCardSemantics(input);
  return {
    resolution,
    repairPlan: planCardSemanticRepair(input, resolution),
  };
}

export function planCardSemanticRepair(
  input: SrsCardSemanticResolverInput,
  resolution = resolveCardSemantics(input),
): SrsCardSemanticRepairPlan {
  if (resolution.confidence === 'ambiguous') {
    return {
      cardId: input.card.id,
      status: 'ambiguous',
      beforeKind: resolution.persistedKind,
      afterKind: null,
      resolution,
      patch: null,
    };
  }
  if (resolution.confidence === 'insufficient' || !resolution.effectiveKind) {
    return {
      cardId: input.card.id,
      status: 'insufficient',
      beforeKind: resolution.persistedKind,
      afterKind: resolution.effectiveKind,
      resolution,
      patch: null,
    };
  }
  if (!resolution.patch || Object.keys(resolution.patch).length === 0) {
    return {
      cardId: input.card.id,
      status: 'noop',
      beforeKind: resolution.persistedKind,
      afterKind: resolution.effectiveKind,
      resolution,
      patch: null,
    };
  }
  return {
    cardId: input.card.id,
    status: 'safe-repair',
    beforeKind: resolution.persistedKind,
    afterKind: resolution.effectiveKind,
    resolution,
    patch: resolution.patch,
  };
}

export function applyCardSemanticPatch(card: FSRSCard, patch: SrsCardSemanticPatch): FSRSCard {
  const shouldPatchMeta = !!patch.metaPatch || !!patch.metaDelete?.length;
  const nextMeta = shouldPatchMeta
    ? { ...(card.meta || {}), ...(patch.metaPatch || {}) }
    : card.meta;
  for (const key of patch.metaDelete ?? []) {
    delete nextMeta?.[key];
  }
  const next: FSRSCard = {
    ...card,
    ...(patch.type ? { type: patch.type } : {}),
    meta: nextMeta,
    updatedAt: Date.now(),
  };
  if (Object.prototype.hasOwnProperty.call(patch, 'cardTypeMarker')) {
    if (patch.cardTypeMarker === null) {
      delete next.cardTypeMarker;
    } else {
      next.cardTypeMarker = patch.cardTypeMarker;
    }
  }
  return next;
}

function collectEvidence(input: SrsCardSemanticResolverInput): SrsCardSemanticEvidence[] {
  const { card } = input;
  const meta = isRecord(card.meta) ? card.meta : {};
  return [
    ...collectReceiptEvidence(card),
    ...collectTemplateEvidence(meta),
    ...collectSymbolSourceEvidence(meta),
    ...collectProgressiveEvidence(meta),
    ...collectCardMarkerEvidence(card, meta),
    ...collectBlockAttrEvidence(input.blockAttrs),
    ...collectRawTypeEvidence(card),
    ...collectStructureEvidence(input.structure),
  ];
}

function collectReceiptEvidence(card: FSRSCard): SrsCardSemanticEvidence[] {
  const meta = isRecord(card.meta) ? card.meta : {};
  if (!Object.prototype.hasOwnProperty.call(meta, SRS_CARD_CREATION_RECEIPT_META_KEY)) {
    return [];
  }
  const receipt = readSrsCardCreationReceipt(card);
  const rawReceipt = meta[SRS_CARD_CREATION_RECEIPT_META_KEY];
  if (!receipt) {
    return [{
      source: 'creation-receipt',
      kind: null,
      path: `meta.${SRS_CARD_CREATION_RECEIPT_META_KEY}`,
      value: rawReceipt,
      strength: 'diagnostic',
      valid: false,
      reason: 'malformed-receipt',
    }];
  }
  const hasCardIdentity = receipt.cardIds.includes(card.id);
  const hasSourceIdentity = receipt.sourceBlockIds.includes(card.blockId);
  const valid = hasCardIdentity && hasSourceIdentity;
  return [{
    source: 'creation-receipt',
    kind: receipt.semanticKind,
    path: `meta.${SRS_CARD_CREATION_RECEIPT_META_KEY}`,
    value: receipt,
    strength: valid ? 'deterministic' : 'diagnostic',
    valid,
    reason: valid ? undefined : 'identity-mismatch',
  }];
}

function collectTemplateEvidence(meta: Record<string, unknown>): SrsCardSemanticEvidence[] {
  const templateID = normalizeString(meta.templateID ?? meta.templateId);
  const kind = resolveTemplateKind(templateID);
  return templateID && kind
    ? [{
      source: 'template',
      kind,
      path: 'meta.templateID',
      value: templateID,
      strength: 'deterministic',
      valid: true,
    }]
    : [];
}

function collectSymbolSourceEvidence(meta: Record<string, unknown>): SrsCardSemanticEvidence[] {
  const evidence: SrsCardSemanticEvidence[] = [];
  const source = normalizeString(meta.source);
  const cardSource = normalizeString(meta.cardSource);
  const symbolType = normalizeString(meta.symbolType);
  const quickDetectReason = normalizeString(meta.quickDetectReason);

  if (source === 'symbol') {
    evidence.push(buildSymbolSourceEvidence('meta.source', source));
  }
  if (meta.symbolDetected === true) {
    evidence.push(buildSymbolSourceEvidence('meta.symbolDetected', true));
  }
  if (cardSource === 'quick-symbol') {
    evidence.push(buildSymbolSourceEvidence('meta.cardSource', cardSource));
  }
  if (symbolType) {
    evidence.push(buildSymbolSourceEvidence('meta.symbolType', symbolType));
  }
  if (quickDetectReason === 'symbol-rule') {
    evidence.push(buildSymbolSourceEvidence('meta.quickDetectReason', quickDetectReason));
  }
  return evidence;
}

function buildSymbolSourceEvidence(path: string, value: unknown): SrsCardSemanticEvidence {
  return {
    source: 'symbol-source',
    kind: CardType.Item,
    path,
    value,
    strength: 'deterministic',
    valid: true,
  };
}

function collectProgressiveEvidence(meta: Record<string, unknown>): SrsCardSemanticEvidence[] {
  const progressive = isRecord(meta.progressive) ? meta.progressive : null;
  const kind = normalizeString(progressive?.kind);
  const semanticKind = kind === 'piece' || kind === 'excerpt'
    ? CardType.Topic
    : kind === 'derived-item'
      ? CardType.Item
      : null;
  return semanticKind
    ? [{
      source: 'progressive',
      kind: semanticKind,
      path: 'meta.progressive.kind',
      value: kind,
      strength: 'deterministic',
      valid: true,
    }]
    : [];
}

function collectCardMarkerEvidence(card: FSRSCard, meta: Record<string, unknown>): SrsCardSemanticEvidence[] {
  const evidence: SrsCardSemanticEvidence[] = [];
  const marker = normalizeString(card.cardTypeMarker ?? meta.cardTypeMarker);
  if (marker === 'concept' || marker === 'descriptor') {
    evidence.push({
      source: 'card-marker',
      kind: marker === 'concept' ? CardType.Concept : CardType.Descriptor,
      path: card.cardTypeMarker ? 'cardTypeMarker' : 'meta.cardTypeMarker',
      value: marker,
      strength: 'deterministic',
      valid: true,
    });
  }

  const typeMarker = normalizeString(meta.typeMarker);
  const typeMarkerKind = resolveTypeMarkerKind(typeMarker);
  if (typeMarker && typeMarkerKind) {
    evidence.push({
      source: 'card-marker',
      kind: typeMarkerKind,
      path: 'meta.typeMarker',
      value: typeMarker,
      strength: 'deterministic',
      valid: true,
    });
  }
  return evidence;
}

function collectBlockAttrEvidence(attrs: Record<string, unknown> | null | undefined): SrsCardSemanticEvidence[] {
  if (!isRecord(attrs)) {
    return [];
  }
  const marker = normalizeString(
    attrs['custom-card-type-marker']
      ?? attrs['custom-fsrs-card-type-marker']
      ?? attrs['custom-srs-card-type-marker'],
  );
  if (marker === 'concept' || marker === 'descriptor') {
    return [{
      source: 'block-attr',
      kind: marker === 'concept' ? CardType.Concept : CardType.Descriptor,
      path: 'blockAttrs.cardTypeMarker',
      value: marker,
      strength: 'deterministic',
      valid: true,
    }];
  }
  return [];
}

function collectRawTypeEvidence(card: FSRSCard): SrsCardSemanticEvidence[] {
  return isSrsCardSemanticKind(card.type)
    ? [{
      source: 'raw-type',
      kind: card.type,
      path: 'type',
      value: card.type,
      strength: 'diagnostic',
      valid: true,
    }]
    : [];
}

function collectStructureEvidence(structure: SrsCardSemanticResolverInput['structure']): SrsCardSemanticEvidence[] {
  if (!structure || !isSrsCardSemanticKind(structure.detectedKind)) {
    return [];
  }
  return [{
    source: 'structure',
    kind: structure.detectedKind,
    path: 'structure.detectedKind',
    value: structure.reason ?? structure.detectedKind,
    strength: 'diagnostic',
    valid: true,
  }];
}

function resolveTemplateKind(templateID: string | null): SrsCardSemanticKind | null {
  if (!templateID) {
    return null;
  }
  if (LIST_TEMPLATE_IDS.has(templateID) || ITEM_TEMPLATE_IDS.has(templateID)) {
    return CardType.Item;
  }
  if (CONCEPT_TEMPLATE_IDS.has(templateID)) {
    return CardType.Concept;
  }
  if (DESCRIPTOR_TEMPLATE_IDS.has(templateID)) {
    return CardType.Descriptor;
  }
  if (TOPIC_TEMPLATE_IDS.has(templateID)) {
    return CardType.Topic;
  }
  return null;
}

function resolveTypeMarkerKind(typeMarker: string | null): SrsCardSemanticKind | null {
  if (!typeMarker) {
    return null;
  }
  if (ITEM_TYPE_MARKERS.has(typeMarker)) {
    return CardType.Item;
  }
  if (CONCEPT_TYPE_MARKERS.has(typeMarker)) {
    return CardType.Concept;
  }
  if (DESCRIPTOR_TYPE_MARKERS.has(typeMarker)) {
    return CardType.Descriptor;
  }
  return null;
}

function buildRepairPatch(card: FSRSCard, kind: SrsCardSemanticKind): SrsCardSemanticPatch | null {
  const patch: SrsCardSemanticPatch = {};
  if (card.type !== kind) {
    patch.type = kind;
  }
  if (kind === CardType.Concept && card.cardTypeMarker !== 'concept') {
    patch.cardTypeMarker = 'concept';
  }
  if (kind === CardType.Descriptor && card.cardTypeMarker !== 'descriptor') {
    patch.cardTypeMarker = 'descriptor';
  }
  if ((kind === CardType.Item || kind === CardType.Topic) && card.cardTypeMarker) {
    patch.cardTypeMarker = null;
  }
  if (kind === CardType.Item) {
    const renderPatch = buildSrsCardQuickSymbolRenderRepairPatch(card);
    if (renderPatch?.metaPatch) {
      patch.metaPatch = {
        ...(patch.metaPatch || {}),
        ...renderPatch.metaPatch,
      };
    }
    if (renderPatch?.metaDelete?.length) {
      patch.metaDelete = Array.from(new Set([
        ...(patch.metaDelete || []),
        ...renderPatch.metaDelete,
      ]));
    }
  }
  return hasPatchChanges(patch) ? patch : null;
}

function hasPatchChanges(patch: SrsCardSemanticPatch): boolean {
  return !!patch.type
    || Object.prototype.hasOwnProperty.call(patch, 'cardTypeMarker')
    || !!Object.keys(patch.metaPatch || {}).length
    || !!patch.metaDelete?.length;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
