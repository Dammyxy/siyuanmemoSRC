import { describe, expect, it, vi } from 'vitest';
import {
  buildReviewMoreMenuItems,
  buildReviewPriorityMenuLabel,
  isReviewMenuSeparator,
  type ReviewMenuItem,
} from '../reviewMoreMenuItems';

const t = (key: string, fallback: string) => `${key}:${fallback}`;

function createActions() {
  return {
    progressiveExcerpt: vi.fn(),
    progressiveOpenSource: vi.fn(),
    progressiveCompletePiece: vi.fn(),
    editSrs: vi.fn(),
    editCurrentContent: vi.fn(),
    toggleFullscreen: vi.fn(),
    editPriority: vi.fn(),
    toggleDismissed: vi.fn(),
    dismissPeers: vi.fn(),
    deleteCurrent: vi.fn(),
    deletePeers: vi.fn(),
  };
}

function buildItems(overrides: Partial<Parameters<typeof buildReviewMoreMenuItems>[0]> = {}) {
  return buildReviewMoreMenuItems({
    t,
    actions: createActions(),
    currentCardType: 'item',
    progressiveExcerptEnabled: false,
    hasProgressiveSourceTarget: false,
    isLinearPieceReviewCard: false,
    openAsItems: [],
    editableSourceTitle: null,
    currentPriority: null,
    currentDismissed: false,
    canEditCurrentPriority: false,
    canSuspendCurrentCard: false,
    canDeleteCurrentCard: false,
    peerCount: 0,
    isMobile: false,
    ...overrides,
  });
}

describe('reviewMoreMenuItems', () => {
  it('formats review priority labels through injected i18n', () => {
    expect(buildReviewPriorityMenuLabel(t, null)).toBe('reviewPriorityMenuLabel:优先级：-');
    expect(buildReviewPriorityMenuLabel(t, 42)).toBe('reviewPriorityMenuLabel:优先级：42');
  });

  it('groups progressive commands before open/display/card commands', () => {
    const items = buildItems({
      currentCardType: 'topic',
      progressiveExcerptEnabled: true,
      hasProgressiveSourceTarget: true,
      isLinearPieceReviewCard: true,
      openAsItems: [{ id: 'openByTab', label: 'Open Tab' }],
    });

    expect(items.map((item) => item.id)).toEqual([
      'progressive-excerpt',
      'progressive-open-source',
      'progressive-complete-piece',
      'separator-progressive',
      'open-as',
      'edit-srs',
      'fullscreen',
      'separator-card-actions',
      'edit-current-priority',
      'pause-current-card',
      'delete-current-card',
    ]);
    expect(isReviewMenuSeparator(items[3])).toBe(true);
  });

  it('projects card action availability without owning command execution', () => {
    const openAsItems: ReviewMenuItem[] = [{ id: 'openByTab', label: 'Open Tab' }];
    const items = buildItems({
      openAsItems,
      editableSourceTitle: 'Edit source block',
      currentPriority: 7,
      currentDismissed: true,
      canEditCurrentPriority: true,
      canSuspendCurrentCard: true,
      canDeleteCurrentCard: true,
      peerCount: 2,
      isMobile: true,
    });

    expect(items.find((item) => item.id === 'open-as')).toMatchObject({
      disabled: false,
      submenu: openAsItems,
    });
    expect(items.find((item) => item.id === 'edit-current-content')).toMatchObject({
      label: 'Edit source block',
    });
    expect(items.find((item) => item.id === 'fullscreen')).toMatchObject({
      disabled: true,
    });
    expect(items.find((item) => item.id === 'edit-current-priority')).toMatchObject({
      disabled: false,
      label: 'reviewPriorityMenuLabel:优先级：7',
    });
    expect(items.find((item) => item.id === 'pause-current-card')).toMatchObject({
      disabled: false,
      label: 'unsuspendCurrentCard:取消暂停这张卡片',
    });
    expect(items.find((item) => item.id === 'pause-peer-cards')).toMatchObject({
      label: 'suspendPeerCards:暂停这张卡片和同块的其余 2 张卡片',
    });
    expect(items.find((item) => item.id === 'delete-peer-cards')).toMatchObject({
      label: 'deletePeerCards:删除这张卡片和同块的其余 2 张卡片',
    });
  });
});
