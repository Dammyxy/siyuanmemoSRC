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
}

export type ReviewRenderProfile = string | null | undefined;

function readProgressiveKind(meta: Record<string, unknown> | undefined): string {
  const progressive = meta?.progressive;
  if (!progressive || typeof progressive !== 'object') {
    return '';
  }

  const kind = (progressive as Record<string, unknown>).kind;
  return typeof kind === 'string' ? kind : '';
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
    'review-render-v1',
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

function hasQuickRenderIndicators(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) {
    return false;
  }

  const source = typeof meta.source === 'string' ? meta.source : '';
  const cardSource = typeof meta.cardSource === 'string' ? meta.cardSource : '';
  const symbolType = typeof meta.symbolType === 'string' ? meta.symbolType : '';
  const renderProfile = typeof meta.renderProfile === 'string' ? meta.renderProfile : '';

  return meta.symbolDetected === true
    || source === 'symbol'
    || source === 'quick'
    || cardSource === 'quick-symbol'
    || symbolType.length > 0
    || renderProfile === 'quick-default'
    || renderProfile === 'quick-inline-formula';
}

export function shouldPreferStableQuickForcePath(
  card?: FSRSCard | null,
  profile?: ReviewRenderProfile,
): boolean {
  if (!card || card.type !== 'item') {
    return false;
  }

  const meta = card.meta as Record<string, unknown> | undefined;
  if (!meta || meta.forceProtyleRender === true) {
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

  if (readProgressiveKind(meta) === 'derived-item') {
    return profile === 'quick-default';
  }

  const source = typeof meta.source === 'string' ? meta.source : '';
  const cardSource = typeof meta.cardSource === 'string' ? meta.cardSource : '';
  const symbolType = typeof meta.symbolType === 'string' ? meta.symbolType : '';

  return meta.symbolDetected === true
    || source === 'symbol'
    || cardSource === 'quick-symbol'
    || symbolType.length > 0
    || profile === 'quick-default';
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

  const templateId = typeof meta?.templateID === 'string' ? meta.templateID : '';
  if (templateId === 'builtin-quick-card' || templateId === 'builtin-bidirectional-single') {
    return false;
  }

  if (hasQuickRenderIndicators(meta)) {
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
