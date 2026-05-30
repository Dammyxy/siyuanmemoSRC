import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import type { ReviewRenderableRenderPolicy } from '@/application/adapters/reviewRenderableRenderPolicy';
import { resolveRenderProfile } from '@/core/card/render-profile/RenderProfileResolver';
import {
  isConceptCard as checkIsConceptCard,
  isConceptDefinitionCard as checkIsConceptDefinitionCard,
  isDescriptorSemanticCard as checkIsDescriptorSemanticCard,
} from '@/core/xiuyuan/cardMeta';
import type { FSRSCard } from '@/types/card';
import {
  isNeuralRoamNonFlashcard,
  resolveReviewSpecialRendererKind,
  shouldPreferStableQuickForcePath,
  shouldVerifyQuickDefaultProfile,
} from './reviewRenderPolicy';
import type {
  PreparedReviewPresentation,
  PreparedReviewRendererKind,
  ReviewUIState,
} from './types';

type QuickSide = 'front' | 'back';

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

function resolveQuickSide(state: ReviewUIState): QuickSide {
  return state.actions.showAnswer ? 'front' : 'back';
}

function resolveQuickCardId(state: ReviewUIState): string {
  return String(state.content.card?.id || state.content.id || '');
}

function resolveRenderPolicy(state: ReviewUIState): ReviewRenderableRenderPolicy | null {
  return state.meta.renderContext?.renderPolicy ?? null;
}

function toPreparedRendererKind(
  rendererKind: ReviewRenderableRenderPolicy['specialRendererKind'],
): PreparedReviewRendererKind | null {
  if (
    rendererKind === 'descriptor'
    || rendererKind === 'concept-definition'
    || rendererKind === 'concept'
    || rendererKind === 'quick'
    || rendererKind === 'multi-cloze'
  ) {
    return rendererKind;
  }
  return null;
}

export function buildPreparedReviewPresentationIdentity(
  rendererKind: PreparedReviewRendererKind,
  state: ReviewUIState,
): string {
  const content = state.content;
  const card = content.card;
  const policy = resolveRenderPolicy(state);
  if (policy) {
    return [
      rendererKind,
      content.id || '',
      policy.cacheTokens.cardId,
      policy.cacheTokens.blockId,
      policy.cacheTokens.faceToken,
      policy.cacheTokens.ruleId,
      policy.cacheTokens.updatedAt,
      policy.profile || '',
      policy.specialRendererKind || '',
      policy.forceProtyleRender ? 'fp1' : 'fp0',
      policy.forceQuickRender ? 'fq1' : 'fq0',
    ].join('|');
  }

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
    meta?.clozeRenderMode || '',
    meta?.renderProfile || '',
    Array.isArray(meta?.faces) ? meta.faces.length : '',
    resolveTypeMarker(card),
  ].join('|');
}

function resolvePreparedRendererKind(state: ReviewUIState): PreparedReviewRendererKind | null {
  const content = state.content;
  if (content.type !== 'protyle') {
    return null;
  }

  const policyRendererKind = state.meta.renderContext?.renderPolicy?.specialRendererKind ?? null;
  if (policyRendererKind === 'image-occlusion') {
    return null;
  }
  const preparedPolicyRendererKind = toPreparedRendererKind(policyRendererKind);
  if (preparedPolicyRendererKind) {
    return preparedPolicyRendererKind;
  }

  const card = content.card;
  const renderProfile = resolveRenderProfile(card);
  const forceQuick = isForceQuickCard(card);

  const rendererKind = resolveReviewSpecialRendererKind({
    card,
    contentType: content.type,
    renderProfile,
    forceProtyleRender: isForceProtyleCard(card),
    forceQuickRender: forceQuick,
    isTopicReadMode: isTopicReadModeCard(card),
    isNeuralRoamNonFlashcard: isNeuralRoamNonFlashcard(card),
    isConceptDefinitionCard: checkIsConceptDefinitionCard(card),
    isConceptCard: checkIsConceptCard(card),
    isDescriptorCard: checkIsDescriptorSemanticCard(card),
    isQuickCard: forceQuick || shouldVerifyQuickDefaultProfile(renderProfile),
  });

  if (rendererKind === 'image-occlusion') {
    return null;
  }

  return rendererKind;
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
