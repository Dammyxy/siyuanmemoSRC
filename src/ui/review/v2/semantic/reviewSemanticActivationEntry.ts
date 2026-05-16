import type { SemanticActivationSessionController } from '@/application/services/SemanticActivationSessionController';
import {
  buildSemanticSurfaceModel,
  type SemanticAiRelationCandidate,
  type SemanticSurfaceModel,
} from '@/core/semantic/SemanticActivationPresentation';
import type {
  SemanticCandidateColumns,
  SemanticLens,
  SemanticNode,
  SemanticStationType,
} from '@/core/semantic/semanticActivationTypes';
import type {
  BackendSemanticCommandResult,
  BackendSemanticSessionSnapshot,
} from '../../../../../packages/contracts/src/backend-rpc';
import type { ReviewUIState } from '../types';
import type { ReviewConceptRoamFocus } from '../reviewConceptRoam';

type TranslateFn = (key: string, fallback: string) => string;
type ShowMessageFn = (message: string, timeout?: number, type?: 'info' | 'error') => void;

export interface SemanticActivationEntryModel {
  overlay: NonNullable<ReviewUIState['overlay']>;
  model: SemanticSurfaceModel;
}

export interface SemanticActivationEntryResult {
  status: 'started' | 'unavailable' | 'failed';
  entry?: SemanticActivationEntryModel;
  result?: BackendSemanticCommandResult | null;
  message?: string;
}

export interface SemanticActivationEntryDeps {
  controller: Pick<
    SemanticActivationSessionController,
    | 'startSessionFromReviewConcept'
    | 'followCandidate'
    | 'recordImplicitNodeAction'
    | 'createStation'
    | 'acceptRelation'
    | 'rejectRelation'
    | 'ignoreRelation'
    | 'markIrrelevant'
  >;
  content: ReviewUIState['content'];
  conceptFocus: ReviewConceptRoamFocus | null;
  i18n?: Record<string, string>;
  t: TranslateFn;
  showMessage: ShowMessageFn;
  aiRelations?: SemanticAiRelationCandidate[];
}

function emptyCandidateColumns(): SemanticCandidateColumns {
  return {
    assimilation: [],
    accommodation: [],
    free: [],
  };
}

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function readSession(result: BackendSemanticCommandResult): BackendSemanticSessionSnapshot | null {
  if (result.status !== 'ok' || !result.session) {
    return null;
  }
  return result.session;
}

function buildRootNode(content: ReviewUIState['content'], session: BackendSemanticSessionSnapshot): SemanticNode {
  const card = content.card;
  const title = normalizeString(card?.content)
    || normalizeString(card?.meta?.title)
    || normalizeString(content.data)
    || session.rootFocusNodeId;
  const preview = normalizeString(card?.fullContent)
    || normalizeString(card?.content)
    || normalizeString(content.data)
    || title;
  const breadcrumb = Array.isArray(card?.meta?.breadcrumb)
    ? card?.meta?.breadcrumb.map(normalizeString).filter(Boolean)
    : [];

  return {
    nodeId: session.currentNodeId,
    nodeType: 'concept',
    title,
    preview,
    location: {
      blockId: session.currentNodeId,
      cardId: card?.id ?? null,
      deckId: card?.deckId ?? null,
      breadcrumb,
      backlinkBlockIds: [],
    },
  };
}

function buildOverlayProps(input: {
  model: SemanticSurfaceModel;
  i18n?: Record<string, string>;
  aiRelations?: SemanticAiRelationCandidate[];
  onFollow: (nodeId: string, lens: SemanticLens) => void;
  onImplicitAction: (
    nodeId: string,
    action: 'follow' | 'expand' | 'node-station' | 'path-station' | 'skip' | 'mark-irrelevant',
    lens: SemanticLens,
  ) => void;
  onCreateStation: (stationType: SemanticStationType) => void;
  onAnalyzePath: () => void;
  onRelationDecision: (relationId: string, decision: 'accepted' | 'rejected' | 'ignored') => void;
}): Record<string, unknown> {
  return {
    model: input.model,
    i18n: input.i18n,
    aiRelations: input.aiRelations ?? [],
    onFollow: input.onFollow,
    onImplicitAction: input.onImplicitAction,
    onCreateStation: input.onCreateStation,
    onAnalyzePath: input.onAnalyzePath,
    onRelationDecision: input.onRelationDecision,
  };
}

export async function startSemanticActivationFromReviewConcept(
  deps: SemanticActivationEntryDeps,
): Promise<SemanticActivationEntryResult> {
  if (!deps.conceptFocus?.focusBlockId) {
    const message = deps.t('semanticActivationConceptUnavailable', 'Semantic Activation needs a Concept review context.');
    deps.showMessage(message, 3000, 'error');
    return { status: 'unavailable', message };
  }

  const result = await deps.controller.startSessionFromReviewConcept(deps.conceptFocus.focusBlockId);
  if (result.status !== 'ok') {
    const message = result.message || deps.t('semanticActivationStartUnavailable', 'Semantic Activation is unavailable.');
    deps.showMessage(message, 3000, 'error');
    return {
      status: result.status === 'unavailable' ? 'unavailable' : 'failed',
      result,
      message,
    };
  }

  const session = readSession(result);
  if (!session) {
    const message = deps.t('semanticActivationStartFailed', 'Semantic Activation did not return a session.');
    deps.showMessage(message, 3000, 'error');
    return { status: 'failed', result, message };
  }

  const model = buildSemanticSurfaceModel({
    session,
    currentNode: buildRootNode(deps.content, session),
    candidates: emptyCandidateColumns(),
  });

  const run = (operation: Promise<BackendSemanticCommandResult>) => {
    operation.catch((error) => {
      deps.showMessage(error instanceof Error ? error.message : String(error || 'Semantic action failed'), 3000, 'error');
    });
  };

  const aiRelations = deps.aiRelations ?? [];
  const overlay: SemanticActivationEntryModel['overlay'] = {
    component: 'SemanticActivationSurface',
    layout: 'cover',
    props: buildOverlayProps({
      model,
      i18n: deps.i18n,
      aiRelations,
      onFollow: (nodeId, lens) => {
        run(deps.controller.followCandidate(nodeId, lens));
      },
      onImplicitAction: (nodeId, action, lens) => {
        if (action === 'mark-irrelevant') {
          run(deps.controller.markIrrelevant(nodeId));
          return;
        }
        run(deps.controller.recordImplicitNodeAction(nodeId, action, lens));
      },
      onCreateStation: (stationType) => {
        run(deps.controller.createStation(stationType));
      },
      onAnalyzePath: () => {
        deps.showMessage(deps.t('semanticAnalyzeCurrentPathQueued', 'Semantic path analysis is ready for the current path.'), 2000, 'info');
      },
      onRelationDecision: (relationId, decision) => {
        const relation = aiRelations.find((candidate) => candidate.relationId === relationId);
        if (decision === 'ignored') {
          run(deps.controller.ignoreRelation());
          return;
        }
        if (!relation) {
          deps.showMessage(deps.t('semanticRelationCandidateMissing', 'Semantic relation candidate is no longer available.'), 3000, 'error');
          return;
        }
        run(decision === 'accepted'
          ? deps.controller.acceptRelation(relation)
          : deps.controller.rejectRelation(relation));
      },
    }),
  };

  deps.showMessage(deps.t('semanticActivationStarted', 'Semantic Activation started.'), 2000, 'info');
  return {
    status: 'started',
    result,
    entry: { overlay, model },
  };
}
