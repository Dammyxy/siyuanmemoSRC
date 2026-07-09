import type {
  ReviewRenderableRenderPolicy,
  ReviewRenderableSpecialRendererKind,
} from '@/application/adapters/reviewRenderableRenderPolicy';
export {
  buildReviewRenderableRenderPolicy,
  isImageOcclusionReviewCard,
  isInlineFormulaMultiClozeCard,
  isNeuralRoamNonFlashcard,
  isOrdinaryMultiClozeReviewCard,
  isProgressiveDerivedItemCard,
  resolveReviewSpecialRendererKind,
  shouldBypassSemanticFallback,
  shouldPreferStableQuickForcePath,
  shouldVerifyQuickDefaultProfile,
} from '@/application/adapters/reviewRenderableRenderPolicy';
import type { FSRSCard } from '@/types/card';

type NullableBoolean = boolean | null | undefined;

export interface ReviewRenderPolicyKeyInput {
  contentType?: string | null;
  blockId?: string | null;
  cardId?: string | null;
  cardType?: string | null;
  typeMarker?: string | null;
  neuralIsFlashcard?: NullableBoolean;
  forceProtyleRender?: NullableBoolean;
  forceQuickRender?: NullableBoolean;
  source?: string | null;
  symbolDetected?: NullableBoolean;
  cardSource?: string | null;
  symbolType?: string | null;
  renderProfile?: string | null;
  quickDetectReason?: string | null;
  specialRendererKind?: ReviewRenderableSpecialRendererKind;
  faceToken?: string | null;
  ruleId?: string | null;
  updatedAt?: string | number | null;
}

export type ReviewRenderProfile = string | null | undefined;
export type ReviewSpecialRendererKind = ReviewRenderableSpecialRendererKind;

export interface ReviewSpecialRendererInput {
  card?: FSRSCard | null;
  contentType?: string | null;
  renderProfile?: ReviewRenderProfile;
  forceProtyleRender?: NullableBoolean;
  forceQuickRender?: NullableBoolean;
  isTopicReadMode?: NullableBoolean;
  isNeuralRoamNonFlashcard?: NullableBoolean;
  isConceptDefinitionCard?: NullableBoolean;
  isConceptCard?: NullableBoolean;
  isDescriptorCard?: NullableBoolean;
  isQuickCard?: NullableBoolean;
}

function toToken(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '_';
  }
  return String(value);
}

function toBooleanToken(value: NullableBoolean): string {
  if (value === true) return '1';
  if (value === false) return '0';
  return '_';
}

function buildBaseSegments(input: ReviewRenderPolicyKeyInput): string[] {
  return [
    'review-render-v2',
    `b:${toToken(input.blockId)}`,
    `c:${toToken(input.cardId)}`,
    `t:${toToken(input.cardType)}`,
    `m:${toToken(input.typeMarker)}`,
    `n:${toBooleanToken(input.neuralIsFlashcard)}`,
    `fp:${toBooleanToken(input.forceProtyleRender)}`,
    `fq:${toBooleanToken(input.forceQuickRender)}`,
    `src:${toToken(input.source)}`,
    `sd:${toBooleanToken(input.symbolDetected)}`,
    `cs:${toToken(input.cardSource)}`,
    `st:${toToken(input.symbolType)}`,
    `rp:${toToken(input.renderProfile)}`,
    `qd:${toToken(input.quickDetectReason)}`,
    `sr:${toToken(input.specialRendererKind)}`,
    `fk:${toToken(input.faceToken)}`,
    `rid:${toToken(input.ruleId)}`,
    `u:${toToken(input.updatedAt)}`,
  ];
}

export function buildReviewRenderPolicyKeyInputFromPolicy(input: {
  contentType?: string | null;
  blockId?: string | null;
  policy?: ReviewRenderableRenderPolicy | null;
}): ReviewRenderPolicyKeyInput | null {
  const policy = input.policy;
  if (!policy) {
    return null;
  }

  return {
    contentType: input.contentType ?? null,
    blockId: input.blockId ?? policy.cacheTokens.blockId,
    cardId: policy.cacheTokens.cardId,
    cardType: policy.cacheTokens.cardType,
    typeMarker: null,
    neuralIsFlashcard: null,
    forceProtyleRender: policy.forceProtyleRender,
    forceQuickRender: policy.forceQuickRender,
    renderProfile: policy.profile,
    quickDetectReason: policy.quickDetectReason,
    specialRendererKind: policy.specialRendererKind,
    faceToken: policy.cacheTokens.faceToken,
    ruleId: policy.cacheTokens.ruleId,
    updatedAt: policy.cacheTokens.updatedAt,
  };
}

export function buildReviewRenderCacheKey(input: ReviewRenderPolicyKeyInput): string {
  return buildBaseSegments(input).join('|');
}

export function buildReviewRenderCacheKeyFromPolicy(input: {
  blockId?: string | null;
  policy?: ReviewRenderableRenderPolicy | null;
}): string | null {
  const keyInput = buildReviewRenderPolicyKeyInputFromPolicy({
    blockId: input.blockId,
    policy: input.policy,
  });
  return keyInput ? buildReviewRenderCacheKey(keyInput) : null;
}

export function buildReviewRenderWatchKey(input: ReviewRenderPolicyKeyInput): string {
  return [
    ...buildBaseSegments(input),
    `ct:${toToken(input.contentType)}`,
  ].join('|');
}

export function buildReviewRenderWatchKeyFromPolicy(input: {
  contentType?: string | null;
  blockId?: string | null;
  policy?: ReviewRenderableRenderPolicy | null;
}): string | null {
  const keyInput = buildReviewRenderPolicyKeyInputFromPolicy(input);
  return keyInput ? buildReviewRenderWatchKey(keyInput) : null;
}
