export type ReviewMenuItem = {
  id?: string;
  icon?: string;
  label: string;
  disabled?: boolean;
  click?: () => void | Promise<void>;
  submenu?: ReviewMenuItem[];
};

type ReviewTranslate = (key: string, fallback: string) => string;

type ReviewMoreMenuActions = {
  progressiveExcerpt: () => void;
  progressiveOpenSource: () => void;
  progressiveCompletePiece: () => void;
  editSrs: () => void;
  editCurrentContent: () => void;
  toggleFullscreen: () => void;
  editPriority: () => void;
  toggleDismissed: () => void;
  dismissPeers: () => void;
  deleteCurrent: () => void;
  deletePeers: () => void;
};

export type BuildReviewMoreMenuItemsInput = {
  t: ReviewTranslate;
  actions: ReviewMoreMenuActions;
  currentCardType?: string | null;
  progressiveExcerptEnabled: boolean;
  hasProgressiveSourceTarget: boolean;
  isLinearPieceReviewCard: boolean;
  openAsItems: ReviewMenuItem[];
  editableSourceTitle?: string | null;
  currentPriority: number | null;
  currentDismissed: boolean;
  canEditCurrentPriority: boolean;
  canSuspendCurrentCard: boolean;
  canDeleteCurrentCard: boolean;
  peerCount: number;
  isMobile: boolean;
};

export function buildReviewPriorityMenuLabel(t: ReviewTranslate, priority: number | null): string {
  const displayValue = priority === null ? '-' : String(priority);
  return t('reviewPriorityMenuLabel', '优先级：{value}').replace('{value}', displayValue);
}

export function isReviewMenuSeparator(item: ReviewMenuItem): boolean {
  return item.id?.startsWith('separator-') === true;
}

export function buildReviewMoreMenuItems(input: BuildReviewMoreMenuItemsInput): ReviewMenuItem[] {
  const items: ReviewMenuItem[] = [];

  if (input.currentCardType === 'topic' && input.progressiveExcerptEnabled) {
    items.push({
      id: 'progressive-excerpt',
      icon: 'iconQuote',
      label: input.t('progressiveExcerptSelection', '摘录选区'),
      click: input.actions.progressiveExcerpt,
    });
  }

  if (input.hasProgressiveSourceTarget) {
    items.push({
      id: 'progressive-open-source',
      icon: 'iconOpen',
      label: input.t('progressiveOpenSource', '跳到来源'),
      click: input.actions.progressiveOpenSource,
    });
  }

  if (input.isLinearPieceReviewCard) {
    items.push({
      id: 'progressive-complete-piece',
      icon: 'iconRight',
      label: input.t('progressiveCompletePiece', '完成当前片'),
      click: input.actions.progressiveCompletePiece,
    });
  }

  if (items.length > 0) {
    items.push({
      id: 'separator-progressive',
      label: '',
    });
  }

  items.push({
    id: 'open-as',
    icon: 'iconOpen',
    label: input.t('openBy', '打开为'),
    disabled: input.openAsItems.length === 0,
    submenu: input.openAsItems,
  });

  items.push({
    id: 'edit-srs',
    icon: 'iconEdit',
    label: input.t('editSrsData', '编辑 SRS 数据'),
    click: input.actions.editSrs,
  });

  if (input.editableSourceTitle) {
    items.push({
      id: 'edit-current-content',
      icon: 'iconEdit',
      label: input.editableSourceTitle,
      click: input.actions.editCurrentContent,
    });
  }

  items.push({
    id: 'fullscreen',
    icon: 'iconFullscreen',
    label: input.t('fullscreen', '全屏'),
    disabled: input.isMobile,
    click: input.actions.toggleFullscreen,
  });

  items.push({
    id: 'separator-card-actions',
    label: '',
  });

  items.push({
    id: 'edit-current-priority',
    icon: 'iconSort',
    label: buildReviewPriorityMenuLabel(input.t, input.currentPriority),
    disabled: !input.canEditCurrentPriority,
    click: input.actions.editPriority,
  });

  items.push({
    id: 'pause-current-card',
    icon: 'iconPause',
    label: input.currentDismissed
      ? input.t('unsuspendCurrentCard', '取消暂停这张卡片')
      : input.t('suspendCurrentCard', '暂停这张卡片'),
    disabled: !input.canSuspendCurrentCard,
    click: input.actions.toggleDismissed,
  });

  if (input.peerCount > 0) {
    items.push({
      id: 'pause-peer-cards',
      icon: 'iconPause',
      label: input.t('suspendPeerCards', '暂停这张卡片和同块的其余 {count} 张卡片')
        .replace('{count}', String(input.peerCount)),
      click: input.actions.dismissPeers,
    });
  }

  items.push({
    id: 'delete-current-card',
    icon: 'iconTrashcan',
    label: input.t('deleteCurrentCard', '删除卡片'),
    disabled: !input.canDeleteCurrentCard,
    click: input.actions.deleteCurrent,
  });

  if (input.peerCount > 0) {
    items.push({
      id: 'delete-peer-cards',
      icon: 'iconTrashcan',
      label: input.t('deletePeerCards', '删除这张卡片和同块的其余 {count} 张卡片')
        .replace('{count}', String(input.peerCount)),
      click: input.actions.deletePeers,
    });
  }

  return items;
}
