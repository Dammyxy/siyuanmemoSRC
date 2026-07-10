import ActionParamsDialog from '@/ui/browser/ActionParamsDialog.vue';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import type { CardEditorApplicationService } from '@/application/services/CardEditorApplicationService';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import type { FSRSCard } from '@/types/card';
import type { RefreshCurrentItemOptions } from './types';

type ReviewCardActionTranslate = (key: string, fallback: string) => string;

type ReviewCardActionShowMessage = (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;

type ReviewCardActionLogger = {
  error?: (...args: unknown[]) => void;
};

type CreateReviewCardActionDialog = (options: {
  title: string;
  component: unknown;
  props: Record<string, unknown>;
  events: Record<string, (payload?: unknown) => Promise<void> | void>;
  width: string;
  height: string;
  visualVariant: string;
  containerClass: string;
}) => { destroy: () => void };

type ConfirmReviewCardActionDialog = (options: {
  title: string;
  content: string;
  confirmText: string;
  cancelText: string;
}) => Promise<boolean>;

export type ReviewCardPeerInfo = {
  currentCardId: string;
  currentBlockId: string;
  peerCards: FSRSCard[];
};

export type ReviewCardActionRuntimeOptions = {
  t: ReviewCardActionTranslate;
  showMessage: ReviewCardActionShowMessage;
  logger?: ReviewCardActionLogger;
  createDialog: CreateReviewCardActionDialog;
  confirmDialog: ConfirmReviewCardActionDialog;
  getCurrentCard: () => FSRSCard | null | undefined;
  getCurrentCardMeta: () => { cardID?: string; blockID?: string } | null | undefined;
  getCurrentContentTargetIdentity?: () => { cardId?: string; blockId?: string } | null | undefined;
  getCurrentReviewCardId: () => string;
  getCurrentReviewBlockId: () => string;
  getCardEditorService: () => CardEditorApplicationService | null;
  getCardService: () => CardApplicationService | null;
  buildExpectedRefreshOptions: (reference: { cardId?: string; blockId?: string } | null | undefined) => RefreshCurrentItemOptions;
  refreshCurrentItem: (card: FSRSCard, options: RefreshCurrentItemOptions) => Promise<unknown>;
  advanceDismissedCurrentCard: (payload: { cardId?: string; blockId?: string; dismissed?: boolean }) => Promise<void>;
  advanceCurrentReviewCardByReference: (payload: { cardId?: string; blockId?: string }) => Promise<void>;
  removeCardIdsFromActiveQueue: (cardIds: string[]) => Promise<void>;
};

export function filterOutCurrentCardId(cardIds: string[], currentCardId: string): string[] {
  return cardIds.filter((cardId) => cardId !== currentCardId);
}

export function resolveCurrentAndPeerCardIds(peerInfo: ReviewCardPeerInfo): string[] {
  return Array.from(new Set([
    peerInfo.currentCardId,
    ...peerInfo.peerCards.map((card) => String(card?.id || '').trim()),
  ].filter((cardId) => cardId.length > 0)));
}

export function createReviewCardActionRuntime(options: ReviewCardActionRuntimeOptions) {
  function openNumberDialog(input: {
    title: string;
    label: string;
    description?: string;
    unit?: string;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    integer?: boolean;
  }): Promise<number | null> {
    return new Promise((resolve) => {
      const dialog = options.createDialog({
        title: input.title,
        component: ActionParamsDialog,
        props: {
          label: input.label,
          description: input.description,
          unit: input.unit,
          defaultValue: input.defaultValue,
          min: input.min,
          max: input.max,
          step: input.step,
          integer: input.integer,
          confirmText: options.t('confirm', '确认'),
          cancelText: options.t('cancel', '取消'),
        },
        events: {
          confirm: (value?: unknown) => {
            dialog.destroy();
            resolve(typeof value === 'number' ? value : Number(value));
          },
          cancel: () => {
            dialog.destroy();
            resolve(null);
          },
        },
        width: '520px',
        height: '220px',
        visualVariant: 'form',
        containerClass: 'siyuanmemo-action-params-dialog',
      });
    });
  }

  function getCurrentReviewCardReference(): { cardId: string; blockId: string } {
    const targetIdentity = options.getCurrentContentTargetIdentity?.();
    const cardMeta = options.getCurrentCardMeta();
    const currentCard = options.getCurrentCard();
    return {
      cardId: String(targetIdentity?.cardId || cardMeta?.cardID || currentCard?.id || '').trim(),
      blockId: String(targetIdentity?.blockId || cardMeta?.blockID || currentCard?.blockId || '').trim(),
    };
  }

  function hasCurrentReviewCard(): boolean {
    const reference = getCurrentReviewCardReference();
    return reference.cardId.length > 0 && reference.blockId.length > 0;
  }

  function resolveCurrentReviewCardActionReference(): { cardId: string; blockId: string } | null {
    const reference = getCurrentReviewCardReference();
    if (reference.cardId.length === 0 || reference.blockId.length === 0) {
      options.showMessage(options.t('reviewNoCurrentCardAction', '当前没有可操作的卡片'), 3000, 'info');
      return null;
    }
    return reference;
  }

  function resolveCurrentReviewCardPriority(): number | null {
    const currentCard = options.getCurrentCard();
    if (!currentCard) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.floor(Number(currentCard.priority) || 0)));
  }

  function resolveCurrentReviewCardDismissed(): boolean {
    const currentCard = options.getCurrentCard();
    return currentCard ? isCardDismissed(currentCard) : false;
  }

  function resolveCurrentBlockPeerCards(): ReviewCardPeerInfo | null {
    const currentCardId = options.getCurrentReviewCardId();
    const currentBlockId = options.getCurrentReviewBlockId();
    if (!currentCardId || !currentBlockId) {
      return null;
    }

    const cardService = options.getCardService();
    if (!cardService) {
      return null;
    }

    const peerCards = cardService
      .getCardsByBlockId(currentBlockId)
      .filter((card) => String(card?.id || '').trim().length > 0 && card.id !== currentCardId);

    return {
      currentCardId,
      currentBlockId,
      peerCards,
    };
  }

  async function handleEditCurrentCardPriority(): Promise<void> {
    const cardEditorService = options.getCardEditorService();
    const reference = resolveCurrentReviewCardActionReference();
    if (!reference) {
      return;
    }
    if (!cardEditorService) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
    }

    const nextPriority = await openNumberDialog({
      title: options.t('priority', '优先级'),
      label: options.t('priorityLabel', '优先级'),
      description: options.t('priorityHelper', '范围 0-100，数值越小越优先。'),
      defaultValue: resolveCurrentReviewCardPriority() ?? 0,
      min: 0,
      max: 100,
      step: 1,
      integer: true,
    });
    if (nextPriority === null) {
      return;
    }

    try {
      const snapshot = await cardEditorService.updatePriority(reference.cardId, nextPriority);
      await options.refreshCurrentItem(snapshot.card, options.buildExpectedRefreshOptions(reference));
      options.showMessage(options.t('prioritySaved', '优先级已更新'), 3000, 'info');
    } catch (error) {
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to update current card priority:', error);
      options.showMessage(options.t('prioritySaveFailed', '优先级更新失败'), 5000, 'error');
    }
  }

  async function handleDismissCurrentCard(): Promise<void> {
    const cardEditorService = options.getCardEditorService();
    const reference = resolveCurrentReviewCardActionReference();
    if (!reference) {
      return;
    }
    if (!cardEditorService) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
    }

    try {
      const nextDismissed = !resolveCurrentReviewCardDismissed();
      const snapshot = await cardEditorService.setDismissed(reference.cardId, nextDismissed);
      if (!nextDismissed) {
        await options.refreshCurrentItem(snapshot.card, options.buildExpectedRefreshOptions(reference));
        options.showMessage(options.t('reviewCardUnsuspended', '已取消暂停这张卡片'), 3000, 'info');
        return;
      }

      await options.advanceDismissedCurrentCard({
        cardId: reference.cardId,
        blockId: reference.blockId,
        dismissed: true,
      });
      options.showMessage(options.t('reviewCardSuspended', '已暂停这张卡片'), 3000, 'info');
    } catch (error) {
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to toggle current card dismissed state:', error);
      options.showMessage(
        options.t('reviewCardDismissToggleFailed', '更新暂停状态失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
    }
  }

  async function handleDismissPeerCards(): Promise<void> {
    const cardEditorService = options.getCardEditorService();
    const peerInfo = resolveCurrentBlockPeerCards();
    if (!cardEditorService || !peerInfo || peerInfo.peerCards.length === 0) {
      return;
    }
    const targetCardIds = resolveCurrentAndPeerCardIds(peerInfo);

    try {
      const result = await cardEditorService.setDismissedMany(targetCardIds, true);
      const currentUpdated = result.updatedCardIds.includes(peerInfo.currentCardId);
      const updatedPeerCardIds = filterOutCurrentCardId(result.updatedCardIds, peerInfo.currentCardId);
      await options.removeCardIdsFromActiveQueue(updatedPeerCardIds);
      if (currentUpdated) {
        await options.advanceDismissedCurrentCard({
          cardId: peerInfo.currentCardId,
          blockId: peerInfo.currentBlockId,
          dismissed: true,
        });
      }

      if (result.failedCardIds.length > 0) {
        options.showMessage(
          options.t('reviewPeerCardsSuspendPartial', '已暂停 {done} 张卡片，另有 {failed} 张失败')
            .replace('{done}', String(result.updatedCardIds.length))
            .replace('{failed}', String(result.failedCardIds.length)),
          4000,
          'error',
        );
        return;
      }

      options.showMessage(
        options.t('reviewPeerCardsSuspended', '已暂停这张卡片和同块的其余 {count} 张卡片')
          .replace('{count}', String(Math.max(0, result.updatedCardIds.length - 1))),
        3000,
        'info',
      );
    } catch (error) {
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to suspend peer cards:', error);
      options.showMessage(
        options.t('reviewPeerCardsSuspendFailed', '暂停其余卡片失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
    }
  }

  async function handleDeleteCurrentCard(): Promise<void> {
    const cardService = options.getCardService();
    const reference = resolveCurrentReviewCardActionReference();
    if (!reference) {
      return;
    }
    if (!cardService) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
    }

    const confirmed = await options.confirmDialog({
      title: options.t('deleteCurrentCardConfirmTitle', '删除卡片'),
      content: options.t('deleteCurrentCardConfirmContent', '确认删除当前卡片吗？此操作不可撤销。'),
      confirmText: options.t('deleteCard', '删除'),
      cancelText: options.t('cancel', '取消'),
    });
    if (!confirmed) {
      return;
    }

    try {
      const result = await cardService.deleteCard({ cardId: reference.cardId });
      if (!result.ok) {
        throw result.error;
      }
      await options.advanceCurrentReviewCardByReference({
        cardId: reference.cardId,
        blockId: reference.blockId,
      });
      options.showMessage(options.t('reviewCardDeleted', '已删除当前卡片'), 3000, 'info');
    } catch (error) {
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to delete current card:', error);
      options.showMessage(
        options.t('reviewCardDeleteFailed', '删除卡片失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
    }
  }

  async function handleDeletePeerCards(): Promise<void> {
    const cardService = options.getCardService();
    const peerInfo = resolveCurrentBlockPeerCards();
    if (!cardService || !peerInfo || peerInfo.peerCards.length === 0) {
      return;
    }
    const targetCardIds = resolveCurrentAndPeerCardIds(peerInfo);

    const confirmed = await options.confirmDialog({
      title: options.t('deletePeerCardsConfirmTitle', '删除这张卡片和同块卡片'),
      content: options.t('deletePeerCardsConfirmContent', '确认删除这张卡片和同块的其余 {count} 张卡片吗？此操作不可撤销。')
        .replace('{count}', String(peerInfo.peerCards.length)),
      confirmText: options.t('deleteCard', '删除'),
      cancelText: options.t('cancel', '取消'),
    });
    if (!confirmed) {
      return;
    }

    try {
      const result = await cardService.deleteCards({ cardIds: targetCardIds });
      if (!result.ok) {
        throw result.error;
      }

      const currentDeleted = result.value.deletedCardIds.includes(peerInfo.currentCardId);
      const deletedPeerCardIds = filterOutCurrentCardId(result.value.deletedCardIds, peerInfo.currentCardId);
      await options.removeCardIdsFromActiveQueue(deletedPeerCardIds);
      if (currentDeleted) {
        await options.advanceCurrentReviewCardByReference({
          cardId: peerInfo.currentCardId,
          blockId: peerInfo.currentBlockId,
        });
      }

      if (result.value.failedCardIds.length > 0) {
        options.showMessage(
          options.t('reviewPeerCardsDeletePartial', '已删除 {done} 张卡片，另有 {failed} 张失败')
            .replace('{done}', String(result.value.deletedCardIds.length))
            .replace('{failed}', String(result.value.failedCardIds.length)),
          4000,
          'error',
        );
        return;
      }

      options.showMessage(
        options.t('reviewPeerCardsDeleted', '已删除这张卡片和同块的其余 {count} 张卡片')
          .replace('{count}', String(Math.max(0, result.value.deletedCardIds.length - 1))),
        3000,
        'info',
      );
    } catch (error) {
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to delete peer cards:', error);
      options.showMessage(
        options.t('reviewPeerCardsDeleteFailed', '删除其余卡片失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
    }
  }

  return {
    openNumberDialog,
    getCurrentReviewCardReference,
    hasCurrentReviewCard,
    resolveCurrentReviewCardActionReference,
    resolveCurrentReviewCardPriority,
    resolveCurrentReviewCardDismissed,
    resolveCurrentBlockPeerCards,
    resolveCurrentAndPeerCardIds,
    filterOutCurrentCardId,
    handleEditCurrentCardPriority,
    handleDismissCurrentCard,
    handleDismissPeerCards,
    handleDeleteCurrentCard,
    handleDeletePeerCards,
  };
}
