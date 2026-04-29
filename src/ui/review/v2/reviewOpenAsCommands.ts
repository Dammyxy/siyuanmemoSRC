import type { App } from 'siyuan';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import type {
  InitialReviewSessionState,
  QueueType,
  ReviewTabTransferState,
} from '@/types/unified-data-source';
import type { ReviewTabRuntimeState } from '@/types/review-tab';
import type { ReviewHeaderVariant } from './types';
import type { ReviewMenuItem } from './reviewMoreMenuItems';

export type ReviewTabOpenPosition = 'right' | 'bottom';

export type ReviewTabOpenOptions = {
  queue?: unknown;
  adapter?: unknown;
  title: string;
  headerVariant?: ReviewHeaderVariant;
  position?: ReviewTabOpenPosition;
  sharedReviewSessionId?: string | null;
  transferState?: ReviewTabTransferState;
  reviewState?: ReviewTabRuntimeState | null;
};

export type ReviewOpenAsTabManager = {
  openReviewTab: (options: ReviewTabOpenOptions) => void;
  openReviewTabInNewTab?: (options: ReviewTabOpenOptions) => void;
  openReviewInNewWindow?: (options: ReviewTabOpenOptions) => void;
};

export type ReviewOpenAsDialogManager = {
  openStandardReviewDialog?: (options: {
    queueType: QueueType;
    title: string;
    headerVariant: ReviewHeaderVariant;
    queueInstance?: unknown;
    initialSessionState?: InitialReviewSessionState;
  }) => void;
};

export type ReviewStandardDialogTarget = {
  queueType: QueueType;
  headerVariant: ReviewHeaderVariant;
};

type ReviewOpenAsLogger = {
  debug?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

type ReviewOpenAsTranslator = (key: string, fallback: string) => string;

export type BuildReviewOpenAsMenuItemsOptions = {
  app?: App | null;
  mode: string;
  title?: string;
  currentSourceBlockId: string;
  tabManager: ReviewOpenAsTabManager | null | undefined;
  dialogManager: ReviewOpenAsDialogManager | null | undefined;
  standardDialogTarget: ReviewStandardDialogTarget | null;
  t: ReviewOpenAsTranslator;
  buildReviewTabOpenOptions: (overrides?: {
    position?: ReviewTabOpenPosition;
    reviewState?: ReviewTabRuntimeState | null;
  }) => ReviewTabOpenOptions;
  buildReviewTabRuntimeState: () => ReviewTabRuntimeState | null;
  getInitialReviewSessionState: () => InitialReviewSessionState | undefined;
  getUnderlyingQueue: () => unknown;
  openManagedReviewSplit: (position: ReviewTabOpenPosition) => void;
  closeCurrentReviewSurface: () => void;
  logger?: ReviewOpenAsLogger;
  openBlockAtSource?: typeof openReviewBlockAtSource;
};

export function buildReviewOpenAsMenuItems(
  options: BuildReviewOpenAsMenuItemsOptions,
): ReviewMenuItem[] {
  const {
    app,
    currentSourceBlockId,
    tabManager,
    dialogManager,
    standardDialogTarget,
    t,
    logger,
  } = options;
  const openBlockAtSource = options.openBlockAtSource ?? openReviewBlockAtSource;
  const isTabSurface = options.mode === 'tab';

  if (!tabManager || typeof tabManager.openReviewTab !== 'function') {
    return [];
  }

  const menuItems: ReviewMenuItem[] = [
    {
      id: 'locateSourceBlock',
      icon: 'iconOpen',
      label: t('locateSourceBlock', '定位到原块位置'),
      disabled: !app || !currentSourceBlockId,
      click() {
        if (!app || !currentSourceBlockId) {
          return;
        }
        openBlockAtSource({
          app,
          blockId: currentSourceBlockId,
        });
      },
    },
    {
      id: 'openRightReviewAndLocateSource',
      icon: 'iconLayoutRight',
      label: t('openRightReviewAndLocateSource', '右侧复习并定位原块'),
      disabled: !app || !currentSourceBlockId,
      async click() {
        if (!app || !currentSourceBlockId) {
          return;
        }
        try {
          await openBlockAtSource({
            app,
            blockId: currentSourceBlockId,
          });
        } catch (error) {
          logger?.warn?.('[SiYuanMemo][ReviewView] Failed to locate source block before opening review:', error);
        }
        tabManager.openReviewTab(options.buildReviewTabOpenOptions({
          position: 'right',
          reviewState: options.buildReviewTabRuntimeState(),
        }));
        options.closeCurrentReviewSurface();
      },
    },
  ];

  if (isTabSurface) {
    menuItems.push({
      id: 'managedSplitRight',
      icon: 'iconLayoutRight',
      label: t('splitCurrentReviewRight', '右侧分屏当前复习'),
      click() {
        options.openManagedReviewSplit('right');
      },
    });

    menuItems.push({
      id: 'managedSplitBottom',
      icon: 'iconLayout',
      label: t('splitCurrentReviewBottom', '下方分屏当前复习'),
      click() {
        options.openManagedReviewSplit('bottom');
      },
    });

    if (standardDialogTarget && typeof dialogManager?.openStandardReviewDialog === 'function') {
      menuItems.push({
        id: 'openInDialog',
        icon: 'iconOpen',
        label: t('openInDialog', 'Dialog'),
        click() {
          logger?.debug?.('[SiYuanMemo][ReviewView] Opening review in dialog and closing current tab');
          dialogManager.openStandardReviewDialog?.({
            queueType: standardDialogTarget.queueType,
            title: options.title || t('reviewTitle', 'Review'),
            headerVariant: standardDialogTarget.headerVariant,
            queueInstance: options.getUnderlyingQueue(),
            initialSessionState: options.getInitialReviewSessionState(),
          });
          options.closeCurrentReviewSurface();
        },
      });
    }
    return menuItems;
  }

  menuItems.push({
    id: 'openByTab',
    icon: 'iconOpen',
    label: t('openInNewTab', 'New Tab'),
    click() {
      logger?.debug?.('[SiYuanMemo][ReviewView] Opening review in new tab and closing dialog');
      const reviewTabOptions = options.buildReviewTabOpenOptions();
      if (typeof tabManager.openReviewTabInNewTab === 'function') {
        tabManager.openReviewTabInNewTab(reviewTabOptions);
      } else {
        tabManager.openReviewTab(reviewTabOptions);
      }
      options.closeCurrentReviewSurface();
    },
  });

  menuItems.push({
    id: 'insertRight',
    icon: 'iconLayoutRight',
    label: t('openInRight', 'Right Side'),
    click() {
      logger?.debug?.('[SiYuanMemo][ReviewView] Opening review on right side and closing dialog');
      tabManager.openReviewTab(options.buildReviewTabOpenOptions({
        position: 'right',
      }));
      options.closeCurrentReviewSurface();
    },
  });

  if (typeof tabManager.openReviewInNewWindow === 'function') {
    menuItems.push({
      id: 'openByNewWindow',
      icon: 'iconOpenWindow',
      label: t('openInNewWindow', 'New Window'),
      click() {
        logger?.debug?.('[SiYuanMemo][ReviewView] Opening review in new window and closing dialog');
        tabManager.openReviewInNewWindow?.(options.buildReviewTabOpenOptions());
        options.closeCurrentReviewSurface();
      },
    });
  }

  return menuItems;
}
