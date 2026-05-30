import { resolveCardFaceToken, resolveCardRuleId } from '@/core/card/cardSemanticLocator';
import { resolveRenderProfile, type SupportedRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';
import {
  isConceptCard,
  isConceptDefinitionCard,
  isDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
import type { FSRSCard } from '@/types/card';

export type ReviewRenderableSpecialRendererKind =
  | 'image-occlusion'
  | 'multi-cloze'
  | 'concept-definition'
  | 'concept'
  | 'descriptor'
  | 'quick'
  | null;

export type ReviewRenderableSemanticKind = Exclude<ReviewRenderableSpecialRendererKind, null>;

export interface ReviewRenderableLegacyProjection {
  templateID: string;
  typeMarker: string;
  faceIndex: number | null;
  renderProfile: string;
  clozeRenderMode: string;
  used: string[];
}

export interface ReviewRenderableRenderPolicy {
  version: 1;
  profile: SupportedRenderProfile | null;
  specialRendererKind: ReviewRenderableSpecialRendererKind;
  semanticKind: ReviewRenderableSemanticKind | null;
  forceProtyleRender: boolean;
  forceQuickRender: boolean;
  quickDetectReason: string;
  cacheTokens: {
    cardId: string;
    blockId: string;
    cardType: string;
    faceToken: string;
    ruleId: string;
    updatedAt: string;
  };
  legacyProjection: ReviewRenderableLegacyProjection;
  diagnostics: string[];
}

export function buildReviewRenderableRenderPolicy(card: FSRSCard | null | undefined): ReviewRenderableRenderPolicy {
  const meta = readMeta(card);
  const profile = resolveRenderProfile(card);
  const forceProtyleRender = meta.forceProtyleRender === true;
  const forceQuickRender = meta.forceQuickRender === true || shouldPreferStableQuickForcePath(card, profile);
  const specialRendererKind = forceProtyleRender ? null : resolveSpecialRendererKind(card, profile, forceQuickRender);
  const legacyProjection = buildLegacyProjection(meta);
  const diagnostics = legacyProjection.used.length > 0 ? ['legacy-render-projection-read'] : [];

  return {
    version: 1,
    profile,
    specialRendererKind,
    semanticKind: specialRendererKind,
    forceProtyleRender,
    forceQuickRender,
    quickDetectReason: readString(meta.quickDetectReason),
    cacheTokens: {
      cardId: readString(card?.id),
      blockId: readString(card?.blockId),
      cardType: readString(card?.type),
      faceToken: resolveCardFaceToken(card),
      ruleId: resolveCardRuleId(card) ?? '',
      updatedAt: String(card?.updatedAt ?? ''),
    },
    legacyProjection,
    diagnostics,
  };
}

export function shouldPreferStableQuickForcePath(
  card: FSRSCard | null | undefined,
  profile: SupportedRenderProfile | string | null | undefined,
): boolean {
  if (!card || card.type !== 'item') {
    return false;
  }

  const meta = readMeta(card);
  if (meta.forceProtyleRender === true) {
    return false;
  }

  if (isNativeMultiClozeCard(meta, profile)) {
    return false;
  }

  if (
    profile === 'descriptor'
    || profile === 'concept'
    || profile === 'concept-definition'
    || profile === 'quick-inline-formula'
  ) {
    return false;
  }

  if (isProgressiveDerivedItemCard(card)) {
    return false;
  }

  return hasQuickRenderIndicators(meta) || profile === 'quick-default';
}

export function isProgressiveDerivedItemCard(card?: FSRSCard | null): boolean {
  const progressive = readMeta(card).progressive;
  return !!progressive
    && typeof progressive === 'object'
    && !Array.isArray(progressive)
    && (progressive as Record<string, unknown>).kind === 'derived-item';
}

export function isImageOcclusionReviewCard(card?: FSRSCard | null): boolean {
  const meta = readMeta(card);
  const source = readString(meta.source);
  return meta.imageOcclusion === true || source === 'image-occlusion';
}

export function isInlineFormulaMultiClozeCard(
  card?: FSRSCard | null,
  profile?: SupportedRenderProfile | string | null,
): boolean {
  const meta = readMeta(card);
  const templateId = readString(meta.templateID);
  const clozeRenderMode = readString(meta.clozeRenderMode);
  const requestedProfile = profile ?? (readString(meta.renderProfile) || null);

  return templateId === 'builtin-multi-cloze'
    && (
      requestedProfile === 'quick-inline-formula'
      || clozeRenderMode === 'inline-formula-cloze'
    );
}

export function isOrdinaryMultiClozeReviewCard(
  card?: FSRSCard | null,
  profile?: SupportedRenderProfile | string | null,
): boolean {
  const meta = readMeta(card);
  const templateId = readString(meta.templateID);
  const clozeRenderMode = readString(meta.clozeRenderMode);
  const requestedProfile = profile ?? (readString(meta.renderProfile) || null);

  return templateId === 'builtin-multi-cloze'
    && clozeRenderMode !== 'inline-formula-cloze'
    && requestedProfile !== 'quick-inline-formula';
}

export function shouldVerifyQuickDefaultProfile(profile: SupportedRenderProfile | string | null | undefined): boolean {
  return profile === 'quick-default';
}

export function shouldBypassSemanticFallback(
  card?: FSRSCard | null,
  profile?: SupportedRenderProfile | string | null,
): boolean {
  if (!card || card.type !== 'item') {
    return false;
  }

  const meta = readMeta(card);
  if (meta.forceProtyleRender === true || meta.forceQuickRender === true) {
    return false;
  }

  if (isProgressiveDerivedItemCard(card)) {
    return true;
  }

  const templateId = readString(meta.templateID);
  if (templateId === 'builtin-quick-card' || templateId === 'builtin-bidirectional-single') {
    return false;
  }

  if (hasQuickRenderIndicators(meta)) {
    return false;
  }

  if (profile === 'descriptor' || profile === 'concept' || profile === 'concept-definition') {
    return false;
  }

  const typeMarker = readString(meta.typeMarker);
  if (
    typeMarker === 'C'
    || typeMarker.startsWith('concept-descriptor')
    || typeMarker.includes('concept-definition')
  ) {
    return false;
  }

  const cardTypeMarker = readString(card.cardTypeMarker) || readString(meta.cardTypeMarker);
  return cardTypeMarker !== 'concept' && cardTypeMarker !== 'descriptor';
}

export function resolveReviewSpecialRendererKind(input: {
  card?: FSRSCard | null;
  contentType?: string | null;
  renderProfile?: SupportedRenderProfile | string | null;
  forceProtyleRender?: boolean | null;
  forceQuickRender?: boolean | null;
  isTopicReadMode?: boolean | null;
  isNeuralRoamNonFlashcard?: boolean | null;
  isConceptDefinitionCard?: boolean | null;
  isConceptCard?: boolean | null;
  isDescriptorCard?: boolean | null;
  isQuickCard?: boolean | null;
}): ReviewRenderableSpecialRendererKind {
  if (input.contentType !== 'protyle') {
    return null;
  }

  const card = input.card;
  if (!card || input.isTopicReadMode === true) {
    return null;
  }

  if (input.isNeuralRoamNonFlashcard === true || isNeuralRoamNonFlashcard(card)) {
    return null;
  }

  if (isImageOcclusionReviewCard(card)) {
    return 'image-occlusion';
  }

  if (input.forceProtyleRender === true) {
    return null;
  }

  const profile = input.renderProfile;
  if (isInlineFormulaMultiClozeCard(card, profile)) {
    return 'multi-cloze';
  }

  if (isOrdinaryMultiClozeReviewCard(card, profile)) {
    return 'multi-cloze';
  }

  if (input.forceQuickRender === true) {
    return input.isQuickCard === true ? 'quick' : null;
  }

  if (profile === 'concept-definition' || input.isConceptDefinitionCard === true) {
    return 'concept-definition';
  }

  if (profile === 'concept' || input.isConceptCard === true) {
    return 'concept';
  }

  if (profile === 'descriptor' || input.isDescriptorCard === true) {
    return 'descriptor';
  }

  if (input.isQuickCard === true) {
    return 'quick';
  }

  return null;
}

export function isNeuralRoamNonFlashcard(card?: FSRSCard | null): boolean {
  const neuralContext = readMeta(card).neuralContext;
  if (!neuralContext || typeof neuralContext !== 'object' || Array.isArray(neuralContext)) {
    return false;
  }

  return (neuralContext as Record<string, unknown>).isFlashcard === false;
}

function resolveSpecialRendererKind(
  card: FSRSCard | null | undefined,
  profile: SupportedRenderProfile | null,
  forceQuickRender: boolean,
): ReviewRenderableSpecialRendererKind {
  if (!card || isNeuralRoamNonFlashcard(card)) {
    return null;
  }

  if (isImageOcclusionReviewCard(card)) {
    return 'image-occlusion';
  }

  if (isInlineFormulaMultiClozeCard(card, profile) || isOrdinaryMultiClozeReviewCard(card, profile)) {
    return 'multi-cloze';
  }

  if (profile === 'concept-definition') {
    return 'concept-definition';
  }
  if (profile === 'concept') {
    return 'concept';
  }
  if (profile === 'descriptor') {
    return 'descriptor';
  }

  if (hasDescriptorFieldMapping(card) || isDescriptorSemanticCard(card)) {
    return 'descriptor';
  }
  if (hasConceptDefinitionFieldMapping(card) || isConceptDefinitionCard(card)) {
    return 'concept-definition';
  }
  if (isConceptCard(card)) {
    return 'concept';
  }

  if (forceQuickRender || shouldVerifyQuickDefaultProfile(profile)) {
    return 'quick';
  }

  return null;
}

function buildLegacyProjection(meta: Record<string, unknown>): ReviewRenderableLegacyProjection {
  const templateID = readString(meta.templateID);
  const typeMarker = readString(meta.typeMarker);
  const faceIndex = readNumber(meta.faceIndex);
  const renderProfile = readString(meta.renderProfile);
  const clozeRenderMode = readString(meta.clozeRenderMode);
  const used: string[] = [];
  if (templateID) used.push('templateID');
  if (typeMarker) used.push('typeMarker');
  if (faceIndex !== null) used.push('faceIndex');
  if (renderProfile) used.push('renderProfile');
  if (clozeRenderMode) used.push('clozeRenderMode');
  return {
    templateID,
    typeMarker,
    faceIndex,
    renderProfile,
    clozeRenderMode,
    used,
  };
}

function hasConceptDefinitionFieldMapping(card: FSRSCard | null | undefined): boolean {
  return readFieldMappingValue(card, 'definition').length > 0;
}

function hasDescriptorFieldMapping(card: FSRSCard | null | undefined): boolean {
  return readFieldMappingValue(card, 'descriptor').length > 0;
}

function readFieldMappingValue(card: FSRSCard | null | undefined, key: string): string {
  const fieldMapping = readMeta(card).fieldMapping;
  if (!fieldMapping || typeof fieldMapping !== 'object' || Array.isArray(fieldMapping)) {
    return '';
  }
  return readString((fieldMapping as Record<string, unknown>)[key]);
}

function hasQuickRenderIndicators(meta: Record<string, unknown>): boolean {
  if (isNativeMultiClozeCard(meta, readString(meta.renderProfile) || null)) {
    return false;
  }

  return meta.symbolDetected === true
    || readString(meta.source) === 'symbol'
    || readString(meta.source) === 'quick'
    || readString(meta.cardSource) === 'quick-symbol'
    || readString(meta.symbolType).length > 0
    || readString(meta.renderProfile) === 'quick-default'
    || readString(meta.renderProfile) === 'quick-inline-formula';
}

function isNativeMultiClozeCard(
  meta: Record<string, unknown>,
  profile: SupportedRenderProfile | string | null | undefined,
): boolean {
  const templateId = readString(meta.templateID);
  const clozeRenderMode = readString(meta.clozeRenderMode);
  return templateId === 'builtin-multi-cloze'
    && profile !== 'quick-inline-formula'
    && clozeRenderMode !== 'inline-formula-cloze';
}

function readMeta(card: FSRSCard | null | undefined): Record<string, unknown> {
  return card?.meta && typeof card.meta === 'object' && !Array.isArray(card.meta) ? card.meta : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) ? numeric : null;
}
