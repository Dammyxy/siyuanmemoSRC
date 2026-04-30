import type { App } from 'siyuan';
import SrsEditorDialog from '@/ui/srs/SrsEditorDialog.vue';
import type { FSRSCard } from '@/types/card';
import type { QueueReviewSchedulingContext } from '@/types/unified-data-source';

type ReviewSrsTranslate = (key: string, fallback: string) => string;

type ReviewSrsLogger = {
  debug?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

type CreateVueDialogLike = (options: {
  title: string;
  component: unknown;
  props: Record<string, unknown>;
  events: Record<string, (payload: unknown) => Promise<void> | void>;
  width: string;
  height: string;
  visualVariant: string;
  containerClass: string;
}) => unknown;

type ReviewSiyuanApiLike = {
  BUILTIN_DECK_ID: string;
};

type ReviewServiceLike = {
  getSiyuanApi?: () => ReviewSiyuanApiLike | undefined;
};

type ReviewSrsCardLike = Pick<FSRSCard, 'id'> & Partial<FSRSCard>;

type ReviewStorageLike = {
  getCard?: (cardId: string) => ReviewSrsCardLike | undefined;
  getCardByBlockId?: (blockId: string) => ReviewSrsCardLike | undefined;
};

export type ReviewSrsEditorContextLike = {
  getReviewService?: () => ReviewServiceLike | undefined;
  getStorage?: () => ReviewStorageLike | undefined;
};

export type ReviewScheduledCardPayload = {
  cardId?: string;
  blockId?: string;
  dueTimestamp?: number;
};

export type ReviewDismissedCardPayload = {
  cardId?: string;
  blockId?: string;
  dismissed?: boolean;
};

export type OpenReviewSrsEditorDialogInput = {
  app?: App | null;
  blockId: string;
  cardId?: string;
  context: ReviewSrsEditorContextLike | null | undefined;
  i18n?: Record<string, string>;
  plugin?: unknown;
  t: ReviewSrsTranslate;
  logger?: ReviewSrsLogger;
  createDialog: CreateVueDialogLike;
  resolveSchedulingContext: (card: FSRSCard) => QueueReviewSchedulingContext | null;
  advanceScheduledCard: (payload: Required<Pick<ReviewScheduledCardPayload, 'blockId' | 'cardId'>> & {
    dueTimestamp?: number;
  }) => Promise<void> | void;
  advanceDismissedCard: (payload: Required<Pick<ReviewDismissedCardPayload, 'blockId' | 'cardId'>> & {
    dismissed: boolean;
  }) => Promise<void> | void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveCard(input: {
  storage: ReviewStorageLike | undefined;
  blockId: string;
  cardId?: string;
}): ReviewSrsCardLike | undefined {
  return input.cardId
    ? input.storage?.getCard?.(input.cardId)
    : input.storage?.getCardByBlockId?.(input.blockId);
}

export function openReviewSrsEditorDialog(input: OpenReviewSrsEditorDialogInput): void {
  input.logger?.debug?.('[SiYuanMemo][ReviewView] openSrsEditorDialog called with card reference:', {
    blockId: input.blockId,
    cardId: input.cardId,
  });

  if (!input.app) {
    input.logger?.error?.('[SiYuanMemo][ReviewView] ERROR: props.app is undefined!');
    return;
  }

  if (!input.blockId) {
    input.logger?.error?.('[SiYuanMemo][ReviewView] ERROR: blockId is required but got undefined!');
    return;
  }

  const reviewService = input.context?.getReviewService?.();
  const siyuanApi = reviewService?.getSiyuanApi?.();
  if (!reviewService || !siyuanApi) {
    input.logger?.error?.('[SiYuanMemo][ReviewView] ERROR: review siyuan api is unavailable');
    return;
  }

  const card = resolveCard({
    storage: input.context?.getStorage?.(),
    blockId: input.blockId,
    cardId: input.cardId,
  });
  if (!card) {
    input.logger?.error?.('[SiYuanMemo][ReviewView] ERROR: Card not found for card reference:', {
      blockId: input.blockId,
      cardId: input.cardId,
    });
    return;
  }

  input.createDialog({
    title: input.t('editSrsData', '编辑 SRS 数据'),
    component: SrsEditorDialog,
    props: {
      card: {
        id: card.id,
        blockId: input.blockId,
        deckId: siyuanApi.BUILTIN_DECK_ID,
      },
      deckId: siyuanApi.BUILTIN_DECK_ID,
      i18n: input.i18n || {},
      plugin: input.plugin,
      reviewService,
      schedulingContext: input.resolveSchedulingContext(card as FSRSCard),
    },
    events: {
      scheduled: async (payload: unknown) => {
        const scheduledPayload = isRecord(payload) ? payload as ReviewScheduledCardPayload : {};
        await input.advanceScheduledCard({
          cardId: typeof scheduledPayload.cardId === 'string' ? scheduledPayload.cardId : card.id,
          blockId: input.blockId,
          dueTimestamp: typeof scheduledPayload.dueTimestamp === 'number' ? scheduledPayload.dueTimestamp : undefined,
        });
      },
      dismissed: async (payload: unknown) => {
        const dismissedPayload = isRecord(payload) ? payload as ReviewDismissedCardPayload : {};
        await input.advanceDismissedCard({
          cardId: typeof dismissedPayload.cardId === 'string' ? dismissedPayload.cardId : card.id,
          blockId: typeof dismissedPayload.blockId === 'string' ? dismissedPayload.blockId : input.blockId,
          dismissed: dismissedPayload.dismissed === true,
        });
      },
    },
    width: 'min(680px, 92vw)',
    height: 'min(640px, 66vh)',
    visualVariant: 'form',
    containerClass: 'siyuanmemo-srs-editor-dialog',
  });
}
