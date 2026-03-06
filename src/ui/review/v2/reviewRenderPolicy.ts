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
}

export type ReviewRenderProfile = string | null | undefined;

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
    'review-render-v1',
    `b:${toToken(input.blockId)}`,
    `c:${toToken(input.cardId)}`,
    `t:${toToken(input.cardType)}`,
    `m:${toToken(input.typeMarker)}`,
    `n:${toBooleanToken(input.neuralIsFlashcard)}`,
    `fp:${toBooleanToken(input.forceProtyleRender)}`,
    `fq:${toBooleanToken(input.forceQuickRender)}`,
  ];
}

export function isNeuralRoamNonFlashcard(card?: FSRSCard | null): boolean {
  const meta = card?.meta;
  if (!meta || typeof meta !== 'object') {
    return false;
  }

  const neuralContext = (meta as Record<string, unknown>).neuralContext;
  if (!neuralContext || typeof neuralContext !== 'object') {
    return false;
  }

  const isFlashcard = (neuralContext as Record<string, unknown>).isFlashcard;
  return isFlashcard === false;
}

export function shouldVerifyQuickDefaultProfile(profile: ReviewRenderProfile): boolean {
  return profile === 'quick-default';
}

export function shouldBypassSemanticFallback(
  card?: FSRSCard | null,
  profile?: ReviewRenderProfile
): boolean {
  if (!card || card.type !== 'item') {
    return false;
  }

  const meta = card.meta as Record<string, unknown> | undefined;
  if (meta?.forceProtyleRender === true || meta?.forceQuickRender === true) {
    return false;
  }

  if (profile === 'descriptor' || profile === 'concept' || profile === 'concept-definition') {
    return false;
  }

  const typeMarker = typeof meta?.typeMarker === 'string' ? meta.typeMarker : '';
  if (
    typeMarker === 'C'
    || typeMarker.startsWith('concept-descriptor')
    || typeMarker.includes('concept-definition')
  ) {
    return false;
  }

  const cardTypeMarker = typeof card.cardTypeMarker === 'string'
    ? card.cardTypeMarker
    : typeof meta?.cardTypeMarker === 'string'
      ? meta.cardTypeMarker
      : '';

  return cardTypeMarker !== 'concept' && cardTypeMarker !== 'descriptor';
}

export function buildReviewRenderCacheKey(input: ReviewRenderPolicyKeyInput): string {
  return buildBaseSegments(input).join('|');
}

export function buildReviewRenderWatchKey(input: ReviewRenderPolicyKeyInput): string {
  return [
    ...buildBaseSegments(input),
    `ct:${toToken(input.contentType)}`,
  ].join('|');
}
