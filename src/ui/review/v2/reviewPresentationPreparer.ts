import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import type { ReviewRenderableRenderPolicy } from '@/application/adapters/reviewRenderableRenderPolicy';
import {
  resolveSrsCardRenderContractFromTarget,
  type SrsCardRenderContract,
} from '@/core/card/render-contract';
import type {
  PreparedReviewPresentation,
  PreparedReviewRendererKind,
  ReviewUIState,
} from './types';

type QuickSide = 'front' | 'back';

function resolveQuickSide(state: ReviewUIState): QuickSide {
  const frontBackContract = resolveRenderContract(state)?.frontBackContract;
  if (frontBackContract?.mode === 'quick-side') {
    return state.actions.showAnswer
      ? frontBackContract.beforeReveal
      : frontBackContract.afterReveal;
  }
  return state.actions.showAnswer ? 'front' : 'back';
}

function resolveQuickCardId(state: ReviewUIState): string {
  return state.meta.renderContext?.targetIdentity.cardId ?? '';
}

function resolveRenderPolicy(state: ReviewUIState): ReviewRenderableRenderPolicy | null {
  return state.meta.renderContext?.renderPolicy ?? null;
}

function resolveRenderContract(state: ReviewUIState): SrsCardRenderContract | null {
  const target = state.meta.renderContext?.contentTarget;
  if (!target) {
    return null;
  }
  try {
    return resolveSrsCardRenderContractFromTarget(target);
  } catch {
    return null;
  }
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
  const renderContract = resolveRenderContract(state);
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
      renderContract?.renderFamily || '',
      renderContract?.frontBackContract.mode || '',
      policy.forceProtyleRender ? 'fp1' : 'fp0',
      policy.forceQuickRender ? 'fq1' : 'fq0',
    ].join('|');
  }

  return [rendererKind, content.id || '', card?.id || '', card?.blockId || '', card?.updatedAt || ''].join('|');
}

function resolvePreparedRendererKind(state: ReviewUIState): PreparedReviewRendererKind | null {
  const content = state.content;
  if (content.type !== 'protyle') {
    return null;
  }

  const policy = state.meta.renderContext?.renderPolicy ?? null;
  const renderContract = resolveRenderContract(state);
  const policyRendererKind = renderContract?.rendererKind === 'protyle'
    ? null
    : renderContract?.rendererKind ?? policy?.specialRendererKind ?? null;
  if (policyRendererKind === 'image-occlusion') {
    return null;
  }
  const preparedPolicyRendererKind = toPreparedRendererKind(policyRendererKind);
  if (preparedPolicyRendererKind) {
    return preparedPolicyRendererKind;
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

  const policy = resolveRenderPolicy(state);
  const renderContract = resolveRenderContract(state);
  return attachPreparedPresentation(state, {
    rendererKind,
    identityKey,
    viewModel,
    ...(renderContract ? { renderContract } : {}),
    diagnostics: policy?.diagnostics ?? [],
  });
}
