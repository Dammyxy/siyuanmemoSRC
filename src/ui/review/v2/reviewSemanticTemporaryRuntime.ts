import type { FSRSCard } from '@/types/card';
import type { ReviewUIState } from './types';

type ReviewTranslate = (key: string, fallback: string) => string;

type ReviewSemanticToastType = 'info' | 'error';

type ReviewSemanticShowMessage = (
  message: string,
  timeout?: number,
  type?: ReviewSemanticToastType,
) => void;

export type ReviewSemanticTemporaryView = {
  nodeId: string;
  blockId: string;
  title: string;
  card: FSRSCard | null;
  uiState: ReviewUIState | null;
  showAnswer: boolean;
  status: 'block' | 'card' | 'scoring' | 'error';
  error?: string;
};

export type ReviewSemanticTemporaryQueue = {
  onFeedback?: (currentItem: FSRSCard | null, feedback: { action: 'rate'; rating: number }) => Promise<void> | void;
  suppressReviewedCardForCurrentSession?: (card: FSRSCard) => boolean;
};

export type ReviewSemanticTemporaryRuntimeDeps = {
  t: ReviewTranslate;
  getTemporaryView: () => ReviewSemanticTemporaryView | null;
  setTemporaryView: (view: ReviewSemanticTemporaryView | null) => void;
  getReviewQueue: () => ReviewSemanticTemporaryQueue | null | undefined;
  resolveCardByBlockId: (blockId: string) => FSRSCard | null;
  renderItemPreview: (
    card: FSRSCard,
    options: { showAnswer: boolean; session: unknown },
  ) => Promise<ReviewUIState>;
  getSession: () => unknown;
  showMessage: ReviewSemanticShowMessage;
};

function normalizeId(value: unknown): string {
  return String(value || '').trim();
}

function normalizeRating(rating: number): number {
  return Math.max(1, Math.min(4, Math.floor(Number(rating) || 0)));
}

export function createReviewSemanticTemporaryRuntime(deps: ReviewSemanticTemporaryRuntimeDeps) {
  function clearTemporaryView(): void {
    deps.setTemporaryView(null);
  }

  function revealTemporaryView(): boolean {
    const temporary = deps.getTemporaryView();
    if (!temporary?.card) {
      return false;
    }
    deps.setTemporaryView({
      ...temporary,
      showAnswer: true,
    });
    return true;
  }

  async function viewNode(nodeId: string, title?: string, sourceBlockId?: string): Promise<void> {
    const normalizedNodeId = normalizeId(nodeId);
    if (!normalizedNodeId) {
      deps.showMessage(deps.t('semanticTemporaryViewPending', 'Temporary Semantic node view is not wired yet.'), 3000, 'info');
      return;
    }

    const normalizedBlockId = normalizeId(sourceBlockId || normalizedNodeId) || normalizedNodeId;
    const temporaryTitle = normalizeId(title || normalizedNodeId) || normalizedNodeId;
    const card = deps.resolveCardByBlockId(normalizedBlockId);
    deps.setTemporaryView({
      nodeId: normalizedNodeId,
      blockId: normalizedBlockId,
      title: temporaryTitle,
      card,
      uiState: null,
      showAnswer: false,
      status: card ? 'card' : 'block',
    });

    if (!card) {
      return;
    }

    try {
      const uiState = await deps.renderItemPreview(card, {
        showAnswer: false,
        session: deps.getSession(),
      });
      const current = deps.getTemporaryView();
      if (!current || current.nodeId !== normalizedNodeId || current.blockId !== normalizedBlockId) {
        return;
      }
      deps.setTemporaryView({
        ...current,
        uiState,
      });
    } catch (error) {
      deps.setTemporaryView({
        nodeId: normalizedNodeId,
        blockId: normalizedBlockId,
        title: temporaryTitle,
        card,
        uiState: null,
        showAnswer: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      const failed = deps.getTemporaryView();
      deps.showMessage(
        `${deps.t('semanticTemporaryViewFailed', 'Temporary Semantic card view failed')}: ${failed?.error ?? ''}`,
        5000,
        'error',
      );
    }
  }

  async function gradeTemporaryReview(rating: number): Promise<void> {
    const temporary = deps.getTemporaryView();
    if (!temporary?.card) {
      return;
    }

    deps.setTemporaryView({
      ...temporary,
      status: 'scoring',
      error: undefined,
    });

    try {
      const queue = deps.getReviewQueue();
      if (typeof queue?.onFeedback !== 'function') {
        throw new Error('SEMANTIC_TEMPORARY_REVIEW_UNAVAILABLE: review queue cannot score temporary card');
      }
      await queue.onFeedback(temporary.card, { action: 'rate', rating: normalizeRating(rating) });
      queue.suppressReviewedCardForCurrentSession?.(temporary.card);
      clearTemporaryView();
    } catch (error) {
      deps.setTemporaryView({
        ...temporary,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      const failed = deps.getTemporaryView();
      deps.showMessage(
        `${deps.t('semanticTemporaryReviewFailed', 'Temporary Semantic review failed')}: ${failed?.error ?? ''}`,
        5000,
        'error',
      );
    }
  }

  return {
    clearTemporaryView,
    gradeTemporaryReview,
    revealTemporaryView,
    viewNode,
  };
}
