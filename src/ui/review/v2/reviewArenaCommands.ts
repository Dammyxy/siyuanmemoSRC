import { ref } from 'vue';
import SrsArenaConflictDialog from './dialogs/SrsArenaConflictDialog.vue';
import type { SrsArenaRecommendation } from '@/types/arena';
import type { FSRSCard } from '@/types/card';
import type { QueueReviewSchedulingContext } from '@/types/unified-data-source';
import type { ReviewAIRequestedView } from './reviewAICommands';

type ReviewArenaTranslate = (key: string, fallback: string) => string;

type ReviewArenaShowMessage = (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;

type ReviewArenaLogger = {
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

type ReviewArenaDialogHandle = {
  destroy: () => void;
};

type CreateReviewArenaDialog = (options: {
  title: string;
  component: unknown;
  props: Record<string, unknown>;
  events: Record<string, (payload?: unknown) => Promise<void> | void>;
  width: string;
  height: string;
  onClose: () => void;
  visualVariant: string;
  containerClass: string;
}) => ReviewArenaDialogHandle;

type ReviewArenaKernelLike = {
  buildSrsRecommendation?: (
    card: FSRSCard,
    schedulerType: 'fsrs-v6' | 'sm15' | 'a-factor-v2' | null,
    now: number,
    options: {
      ratingBasis: number;
      schedulingContext: QueueReviewSchedulingContext | null;
    },
  ) => Promise<SrsArenaRecommendation | null>;
};

type ReviewArenaServiceLike = {
  rescheduleCard?: (
    cardId: string,
    options: {
      mode: 'direct';
      dueTimestamp: number;
      scheduledDays: number;
    },
  ) => Promise<unknown>;
};

type SrsArenaConflictAdoptPayload = {
  kind?: 'weighted' | 'contestant';
  contestantId?: string;
  dueTimestamp?: number;
  scheduledDays?: number;
};

export type ReviewArenaFeedbackPayload = {
  cardId: string;
  rating: number;
  item: FSRSCard | null;
};

export type ReviewArenaRuntimeOptions = {
  t: ReviewArenaTranslate;
  i18n?: Record<string, string>;
  logger?: ReviewArenaLogger;
  showMessage: ReviewArenaShowMessage;
  createDialog: CreateReviewArenaDialog;
  getCurrentCard: () => FSRSCard | null;
  getArenaKernelService: () => ReviewArenaKernelLike | null;
  getReviewService: () => ReviewArenaServiceLike | null;
  getSchedulerTypeForCard: (card: FSRSCard | null | undefined) => 'fsrs-v6' | 'sm15' | 'a-factor-v2' | null;
  resolveSchedulingContext: (card: FSRSCard | null | undefined) => QueueReviewSchedulingContext | null;
  now?: () => number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function resolveArenaTargetKindFromCard(card: FSRSCard | null | undefined): 'topic' | 'item' | 'concept' | 'descriptor' | 'note' {
  const type = String(card?.type || '').trim();
  if (type === 'topic' || type === 'item' || type === 'concept' || type === 'descriptor') {
    return type;
  }
  return 'note';
}

export function resolveReviewArenaScenario(view: ReviewAIRequestedView, card: FSRSCard | null | undefined): 'topic-auto-card' | 'candidate-card-generation' | 'card-prompt-rewrite' | 'descriptor-augmentation' | 'concept-expression-coach' | 'note-refinement' {
  const type = String(card?.type || '').trim();
  if (type === 'topic') return 'topic-auto-card';
  if (type === 'descriptor') return 'descriptor-augmentation';
  if (type === 'concept') return 'concept-expression-coach';
  if (type === 'item') return 'card-prompt-rewrite';
  return view === 'general-chat' ? 'note-refinement' : 'candidate-card-generation';
}

export function createReviewArenaRuntime(options: ReviewArenaRuntimeOptions) {
  const hint = ref<string | null>(null);
  let conflictDialog: ReviewArenaDialogHandle | null = null;

  function destroyConflictDialog(): void {
    if (!conflictDialog) {
      return;
    }
    conflictDialog.destroy();
    conflictDialog = null;
  }

  function openConflictDialog(card: FSRSCard, recommendation: SrsArenaRecommendation): void {
    const reviewService = options.getReviewService();
    if (!reviewService?.rescheduleCard) {
      options.logger?.warn?.('[SiYuanMemo][ReviewView] Cannot open SRS arena conflict dialog without review service');
      return;
    }

    destroyConflictDialog();
    conflictDialog = options.createDialog({
      title: options.t('srsArenaConflictTitle', 'Arena 排期冲突'),
      component: SrsArenaConflictDialog,
      props: {
        recommendation,
        i18n: options.i18n || {},
      },
      events: {
        keep: () => {
          destroyConflictDialog();
        },
        close: () => {
          destroyConflictDialog();
        },
        adopt: async (payload: unknown) => {
          const adoptPayload = isRecord(payload) ? payload as SrsArenaConflictAdoptPayload : {};
          const dueTimestamp = Number(adoptPayload.dueTimestamp);
          const scheduledDays = Number(adoptPayload.scheduledDays);
          if (!Number.isFinite(dueTimestamp) || dueTimestamp <= 0 || !Number.isFinite(scheduledDays) || scheduledDays < 0) {
            options.logger?.warn?.('[SiYuanMemo][ReviewView] Ignore invalid SRS arena adopt payload', adoptPayload);
            return;
          }
          try {
            await reviewService.rescheduleCard?.(card.id, {
              mode: 'direct',
              dueTimestamp,
              scheduledDays,
            });
            options.showMessage(options.t('srsArenaAdopted', '已采用 Arena 排期'), 2000, 'info');
            destroyConflictDialog();
          } catch (error) {
            options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to adopt SRS arena schedule:', error);
            options.showMessage(options.t('srsArenaAdoptFailed', '采用 Arena 排期失败'), 3000, 'error');
          }
        },
      },
      width: 'min(720px, 92vw)',
      height: 'min(680px, 78vh)',
      onClose: () => {
        conflictDialog = null;
      },
      visualVariant: 'form',
      containerClass: 'siyuanmemo-srs-arena-conflict-dialog',
    });
  }

  async function refreshHint(card: FSRSCard | null | undefined, rating: number): Promise<SrsArenaRecommendation | null> {
    const currentCard = (card || options.getCurrentCard() || null) as FSRSCard | null;
    const arenaKernel = options.getArenaKernelService();
    if (!arenaKernel?.buildSrsRecommendation || !currentCard || rating < 1 || rating > 4) {
      hint.value = null;
      return null;
    }
    try {
      const recommendation = await arenaKernel.buildSrsRecommendation(
        currentCard,
        options.getSchedulerTypeForCard(currentCard),
        options.now?.() ?? Date.now(),
        {
          ratingBasis: rating,
          schedulingContext: options.resolveSchedulingContext(currentCard),
        },
      );
      hint.value = recommendation?.shouldHighlight ? (recommendation.summary || null) : null;
      return recommendation;
    } catch (error) {
      options.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to refresh SRS arena hint:', error);
      hint.value = null;
      return null;
    }
  }

  async function handleFeedback(payload: ReviewArenaFeedbackPayload): Promise<void> {
    const reviewedCard = (payload.item || options.getCurrentCard() || null) as FSRSCard | null;
    const recommendation = await refreshHint(reviewedCard, payload.rating);
    if (reviewedCard && recommendation?.shouldHighlight === true) {
      openConflictDialog(reviewedCard, recommendation);
    }
  }

  return {
    hint,
    destroyConflictDialog,
    openConflictDialog,
    refreshHint,
    handleFeedback,
  };
}
