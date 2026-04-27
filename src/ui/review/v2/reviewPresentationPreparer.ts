import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import { resolveRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';
import {
  isConceptCard as checkIsConceptCard,
  isConceptDefinitionCard as checkIsConceptDefinitionCard,
  isDescriptorSemanticCard as checkIsDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
import type { FSRSCard } from '@/types/card';
import {
  isNeuralRoamNonFlashcard,
  shouldPreferStableQuickForcePath,
  shouldVerifyQuickDefaultProfile,
} from './reviewRenderPolicy';
import type {
  PreparedReviewPresentation,
  PreparedReviewRendererKind,
  ReviewUIState,
} from './types';

type QuickSide = 'front' | 'back';

function isImageOcclusionCard(card: FSRSCard | undefined): boolean {
  const cardMeta = card?.meta;
  if (!cardMeta || typeof cardMeta !== 'object') {
    return false;
  }
  const source = (cardMeta as Record<string, unknown>).source;
  const imageOcclusion = (cardMeta as Record<string, unknown>).imageOcclusion;
  return imageOcclusion === true || source === 'image-occlusion';
}

function resolveTypeMarker(card: FSRSCard | undefined): string {
  const marker = card?.meta?.typeMarker;
  return typeof marker === 'string' ? marker : '';
}

function isTopicReadModeCard(card: FSRSCard | undefined): boolean {
  return String(card?.type || '') === 'topic';
}

function isForceProtyleCard(card: FSRSCard | undefined): boolean {
  return card?.meta?.forceProtyleRender === true;
}

function isForceQuickCard(card: FSRSCard | undefined): boolean {
  return card?.meta?.forceQuickRender === true || shouldPreferStableQuickForcePath(
    card,
    resolveRenderProfile(card),
  );
}

function isMultiClozeCard(card: FSRSCard | undefined): boolean {
  if (!card?.meta) {
    return false;
  }

  return resolveRenderProfile(card) === 'quick-inline-formula'
    && card.meta.templateID === 'builtin-multi-cloze'
    && Array.isArray(card.meta.faces)
    && card.meta.faces.length > 0
    && card.meta.faceIndex !== undefined;
}

function resolveQuickSide(state: ReviewUIState): QuickSide {
  return state.actions.showAnswer ? 'front' : 'back';
}

function resolveQuickCardId(state: ReviewUIState): string {
  return String(state.content.card?.id || state.content.id || '');
}

export function buildPreparedReviewPresentationIdentity(
  rendererKind: PreparedReviewRendererKind,
  state: ReviewUIState,
): string {
  const content = state.content;
  const card = content.card;
  if (rendererKind === 'descriptor') {
    return [
      content.id || '',
      card?.id || '',
      card?.id || '',
      card?.updatedAt || '',
    ].join('|');
  }

  if (rendererKind === 'concept-definition') {
    const meta = card?.meta;
    const cardXiuyuanID = typeof card?.xiuyuanID === 'string' ? card.xiuyuanID : '';
    const metaXiuyuanID = typeof meta?.xiuyuanID === 'string' ? meta.xiuyuanID : '';
    const faceIndex = typeof meta?.faceIndex === 'number' ? String(meta.faceIndex) : '';
    return [
      content.id || '',
      card?.id || '',
      cardXiuyuanID || metaXiuyuanID,
      faceIndex,
      resolveTypeMarker(card),
    ].join('|');
  }

  if (rendererKind === 'concept') {
    const meta = card?.meta;
    const cardXiuyuanID = typeof card?.xiuyuanID === 'string' ? card.xiuyuanID : '';
    const metaXiuyuanID = typeof meta?.xiuyuanID === 'string' ? meta.xiuyuanID : '';
    return [content.id || '', card?.id || '', cardXiuyuanID || metaXiuyuanID].join('|');
  }

  if (rendererKind === 'quick') {
    return [content.id || '', resolveQuickCardId(state), resolveQuickSide(state)].join(':');
  }

  const meta = card?.meta;
  return [
    card?.id || '',
    card?.blockId || '',
    card?.updatedAt || '',
    meta?.faceIndex ?? '',
    meta?.templateID || '',
    resolveTypeMarker(card),
  ].join('|');
}

function resolvePreparedRendererKind(state: ReviewUIState): PreparedReviewRendererKind | null {
  const content = state.content;
  if (content.type !== 'protyle') {
    return null;
  }

  const card = content.card;
  if (!card || isTopicReadModeCard(card) || isNeuralRoamNonFlashcard(card) || isImageOcclusionCard(card)) {
    return null;
  }

  if (isForceProtyleCard(card)) {
    return null;
  }

  if (isMultiClozeCard(card)) {
    return 'multi-cloze';
  }

  const renderProfile = resolveRenderProfile(card);
  const forceQuick = isForceQuickCard(card);
  if (!forceQuick && (renderProfile === 'concept-definition' || checkIsConceptDefinitionCard(card))) {
    return 'concept-definition';
  }
  if (!forceQuick && (renderProfile === 'concept' || checkIsConceptCard(card))) {
    return 'concept';
  }
  if (!forceQuick && (renderProfile === 'descriptor' || checkIsDescriptorSemanticCard(card))) {
    return 'descriptor';
  }
  if (forceQuick || shouldVerifyQuickDefaultProfile(renderProfile)) {
    return 'quick';
  }

  return null;
}

function attachPreparedPresentation(
  state: ReviewUIState,
  prepared: PreparedReviewPresentation,
): ReviewUIState {
  return {
    ...state,
    content: {
      ...state.content,
      prepared,
    },
  };
}

export async function prepareReviewPresentation(
  state: ReviewUIState,
  services: ReviewRenderServices,
): Promise<ReviewUIState> {
  const rendererKind = resolvePreparedRendererKind(state);
  if (!rendererKind) {
    return state;
  }

  const identityKey = buildPreparedReviewPresentationIdentity(rendererKind, state);
  if (
    state.content.prepared?.rendererKind === rendererKind
    && state.content.prepared.identityKey === identityKey
  ) {
    return state;
  }

  const blockId = String(state.content.id || '');
  const card = state.content.card;
  let viewModel: unknown = null;

  if (rendererKind === 'descriptor') {
    viewModel = await services.descriptorCardRenderService.prepareViewModel(blockId, card);
    if (!viewModel) {
      return state;
    }
  } else if (rendererKind === 'concept-definition') {
    viewModel = await services.conceptDefinitionCardRenderService.prepareViewModel(blockId, card);
  } else if (rendererKind === 'concept') {
    viewModel = await services.conceptCardRenderService.prepareViewModel(blockId, card);
  } else if (rendererKind === 'quick') {
    const cardId = resolveQuickCardId(state);
    viewModel = await services.quickCardRenderService.prepareViewModel(
      blockId,
      resolveQuickSide(state),
      cardId || undefined,
    );
    if (!viewModel) {
      return state;
    }
  } else if (card) {
    viewModel = await services.multiClozeCardRenderService.prepareViewModel(card);
  }

  if (!viewModel) {
    return state;
  }

  return attachPreparedPresentation(state, {
    rendererKind,
    identityKey,
    viewModel,
  });
}
