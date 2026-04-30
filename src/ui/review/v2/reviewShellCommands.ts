import { Menu } from 'siyuan';
import { QueueType } from '@/types/unified-data-source';
import type { ReviewHeaderVariant } from './types';

type ReviewShellTranslate = (key: string, fallback: string) => string;

type ReviewShellShowMessage = (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;

type ReviewShellLogger = {
  debug?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
};

export type ReviewShellDialogManager = {
  switchStandardReviewDialogQueue?: (queueType: QueueType) => Promise<void> | void;
};

export type ReviewShellTabManager = {
  replaceCurrentReviewTabWithStandardQueue?: (queueType: QueueType) => void;
};

export type StandardReviewQueueSwitchPreset = {
  queueType: QueueType;
  headerVariant: ReviewHeaderVariant;
  title: string;
};

type ReviewTitlebarRuntimeOptions = {
  isEnabled: () => boolean;
  getDialogContainer: () => HTMLElement | null;
  getTitle: () => string;
  getAriaLabel: (title: string) => string;
  onTriggerPointerDown: (event: Event) => void;
  onTriggerClick: (event: MouseEvent) => void;
};

export type ReviewTitlebarQueueSwitchRuntime = {
  scheduleSync: () => void;
  disconnectObserver: () => void;
  restoreTitlebarText: () => void;
  clear: () => void;
};

export type ReviewFullscreenOptions = {
  mode: string;
  isMobile?: boolean;
  getDialogContainer: () => HTMLElement | null;
  getContentMain: () => HTMLElement | null;
  getProtyleFromHost: (host: Element) => { resize?: () => void } | null;
  logger?: ReviewShellLogger;
};

const MAIN_REVIEW_QUEUE_SWITCH_ORDER: QueueType[] = [
  QueueType.RetrievalPractice,
  QueueType.IncrementalLearning,
  QueueType.FinalDrill,
  QueueType.FilterGroup,
  QueueType.NeuralRoam,
];

const MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT: Partial<Record<ReviewHeaderVariant, QueueType>> = {
  'retrieval-practice': QueueType.RetrievalPractice,
  'incremental-learning': QueueType.IncrementalLearning,
  'final-drill': QueueType.FinalDrill,
  'filter-group': QueueType.FilterGroup,
  'neural-roam': QueueType.NeuralRoam,
};

export function buildStandardReviewQueueSwitchPresets(
  t: ReviewShellTranslate,
): StandardReviewQueueSwitchPreset[] {
  return [
    {
      queueType: QueueType.RetrievalPractice,
      headerVariant: 'retrieval-practice',
      title: t('retrievalPractice', '提取练习'),
    },
    {
      queueType: QueueType.IncrementalLearning,
      headerVariant: 'incremental-learning',
      title: t('incrementalLearning', '渐进学习'),
    },
    {
      queueType: QueueType.FinalDrill,
      headerVariant: 'final-drill',
      title: t('finalDrill', '刻意练习'),
    },
    {
      queueType: QueueType.FilterGroup,
      headerVariant: 'filter-group',
      title: t('filterGroupPractice', '分组队列'),
    },
    {
      queueType: QueueType.NeuralRoam,
      headerVariant: 'neural-roam',
      title: t('neuralReviewTitle', t('neuralRoam', '神经漫游')),
    },
  ];
}

export function resolveCurrentMainQueueSwitchType(input: {
  headerVariant?: ReviewHeaderVariant;
  activeQueueType?: string | null;
}): QueueType | null {
  const variantQueueType = input.headerVariant
    ? MAIN_REVIEW_QUEUE_BY_HEADER_VARIANT[input.headerVariant]
    : null;
  if (variantQueueType) {
    return variantQueueType;
  }

  const activeQueueType = input.activeQueueType;
  if ((MAIN_REVIEW_QUEUE_SWITCH_ORDER as string[]).includes(String(activeQueueType || ''))) {
    return activeQueueType as QueueType;
  }

  return null;
}

export function resolveMenuAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

export function resolveMenuOpenPoint(anchor: HTMLElement, event?: MouseEvent | null): { x: number; y: number } {
  const rect = anchor.getBoundingClientRect();
  const hasUsableRect = Number.isFinite(rect.left)
    && Number.isFinite(rect.bottom)
    && (rect.width > 0 || rect.height > 0 || rect.left !== 0 || rect.bottom !== 0);
  if (hasUsableRect) {
    return {
      x: rect.left,
      y: rect.bottom,
    };
  }

  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return { x: 0, y: 0 };
}

export function openMenuAtAnchor(menu: Menu, anchor: HTMLElement, event?: MouseEvent | null): void {
  menu.open(resolveMenuOpenPoint(anchor, event));
}

export function switchToStandardReviewQueue(input: {
  queueType: QueueType;
  currentQueueType: QueueType | null;
  mode: string;
  dialogManager: ReviewShellDialogManager | null | undefined;
  tabManager: ReviewShellTabManager | null | undefined;
  t: ReviewShellTranslate;
  showMessage: ReviewShellShowMessage;
}): void {
  if (input.queueType === input.currentQueueType) {
    return;
  }

  if (input.mode === 'dialog') {
    if (typeof input.dialogManager?.switchStandardReviewDialogQueue === 'function') {
      void input.dialogManager.switchStandardReviewDialogQueue(input.queueType);
      return;
    }
  }

  if (input.mode === 'tab') {
    if (typeof input.tabManager?.replaceCurrentReviewTabWithStandardQueue === 'function') {
      input.tabManager.replaceCurrentReviewTabWithStandardQueue(input.queueType);
      return;
    }
  }

  input.showMessage(input.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
}

export function openQueueSwitchMenuAtAnchor(input: {
  anchor: HTMLElement;
  event?: MouseEvent | null;
  currentQueueType: QueueType | null;
  presets: StandardReviewQueueSwitchPreset[];
  switchQueue: (queueType: QueueType) => void;
}): void {
  const menu = new Menu('review-queue-switch-menu');

  for (const item of input.presets) {
    const isCurrent = item.queueType === input.currentQueueType;
    menu.addItem({
      id: item.queueType,
      icon: isCurrent ? 'iconCheck' : undefined,
      label: item.title,
      disabled: isCurrent,
      click: () => {
        input.switchQueue(item.queueType);
      },
    });
  }

  openMenuAtAnchor(menu, input.anchor, input.event);
}

export function handleQueueSwitchTriggerPointerDown(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function getReviewDialogTitleElement(dialogContainer: HTMLElement | null): HTMLElement | null {
  return dialogContainer?.querySelector('.b3-dialog__title') as HTMLElement | null;
}

function getReviewDialogHeaderElement(dialogContainer: HTMLElement | null): HTMLElement | null {
  return dialogContainer?.querySelector('.b3-dialog__header') as HTMLElement | null;
}

function getReviewDialogTitlebarHostElement(dialogContainer: HTMLElement | null): HTMLElement | null {
  return getReviewDialogTitleElement(dialogContainer) || getReviewDialogHeaderElement(dialogContainer);
}

function getReviewDialogTitlebarSlotElement(host: HTMLElement | null): HTMLElement | null {
  if (!host) {
    return null;
  }
  if (host.classList.contains('b3-dialog__title')) {
    return host;
  }
  return host.querySelector('.siyuanmemo-review-titlebar__slot') as HTMLElement | null;
}

export function createReviewTitlebarQueueSwitchRuntime(
  options: ReviewTitlebarRuntimeOptions,
): ReviewTitlebarQueueSwitchRuntime {
  let syncTimer: number | null = null;
  let observer: MutationObserver | null = null;
  let observedHeader: HTMLElement | null = null;

  const disconnectObserver = (): void => {
    observer?.disconnect();
    observer = null;
    observedHeader = null;
  };

  const restoreTitlebarText = (): void => {
    const hostElement = getReviewDialogTitlebarHostElement(options.getDialogContainer());
    if (!hostElement || hostElement.dataset.siyuanmemoQueueSwitch !== 'true') {
      return;
    }

    hostElement.classList.remove('siyuanmemo-review-titlebar__host');
    delete hostElement.dataset.siyuanmemoQueueSwitch;

    if (hostElement.classList.contains('b3-dialog__title')) {
      hostElement.classList.remove('siyuanmemo-review-titlebar__slot');
      hostElement.replaceChildren();
      hostElement.textContent = options.getTitle();
      return;
    }

    hostElement.replaceChildren();
    hostElement.textContent = options.getTitle();
  };

  const isSynced = (): boolean => {
    if (!options.isEnabled()) {
      return false;
    }

    const hostElement = getReviewDialogTitlebarHostElement(options.getDialogContainer());
    const slotElement = getReviewDialogTitlebarSlotElement(hostElement);
    if (!hostElement || !slotElement) {
      return false;
    }

    const trigger = slotElement.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
    if (!trigger) {
      return false;
    }

    const title = options.getTitle();
    return hostElement.dataset.siyuanmemoQueueSwitch === 'true'
      && slotElement.classList.contains('siyuanmemo-review-titlebar__slot')
      && trigger.textContent === title
      && trigger.title === title
      && trigger.getAttribute('aria-label') === options.getAriaLabel(title);
  };

  const scheduleSync = (): void => {
    if (syncTimer !== null) {
      window.clearTimeout(syncTimer);
    }

    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      ensureObserver();
      sync();
    }, 0);
  };

  const ensureObserver = (): void => {
    if (!options.isEnabled()) {
      disconnectObserver();
      return;
    }

    const headerElement = getReviewDialogHeaderElement(options.getDialogContainer());
    if (!headerElement) {
      return;
    }

    if (observer && observedHeader === headerElement) {
      return;
    }

    disconnectObserver();
    observer = new MutationObserver(() => {
      if (!options.isEnabled()) {
        return;
      }
      if (!isSynced()) {
        scheduleSync();
      }
    });
    observer.observe(headerElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observedHeader = headerElement;
  };

  const sync = (): void => {
    ensureObserver();
    const hostElement = getReviewDialogTitlebarHostElement(options.getDialogContainer());
    if (!hostElement) {
      return;
    }

    if (!options.isEnabled()) {
      disconnectObserver();
      restoreTitlebarText();
      return;
    }

    const slotElement = hostElement.classList.contains('b3-dialog__title')
      ? hostElement
      : (hostElement.querySelector('.siyuanmemo-review-titlebar__slot') as HTMLElement | null)
        || document.createElement('span');
    if (!hostElement.classList.contains('b3-dialog__title')) {
      slotElement.className = 'siyuanmemo-review-titlebar__slot';
    }

    const existingTrigger = slotElement.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
    if (existingTrigger && isSynced()) {
      return;
    }

    const title = options.getTitle();
    const trigger = existingTrigger || document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'siyuanmemo-review-titlebar__queue-switch';
    trigger.title = title;
    trigger.textContent = title;
    trigger.setAttribute('aria-label', options.getAriaLabel(title));
    trigger.onpointerdown = options.onTriggerPointerDown;
    trigger.onmousedown = options.onTriggerPointerDown;
    trigger.onclick = options.onTriggerClick;

    hostElement.dataset.siyuanmemoQueueSwitch = 'true';
    if (hostElement.classList.contains('b3-dialog__title')) {
      hostElement.classList.add('siyuanmemo-review-titlebar__slot');
      hostElement.replaceChildren(trigger);
      return;
    }

    hostElement.classList.add('siyuanmemo-review-titlebar__host');
    slotElement.replaceChildren(trigger);
    hostElement.replaceChildren(slotElement);
  };

  return {
    scheduleSync,
    disconnectObserver,
    restoreTitlebarText,
    clear(): void {
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer);
        syncTimer = null;
      }
      disconnectObserver();
      restoreTitlebarText();
    },
  };
}

export function isReviewFullscreenActive(input: {
  getDialogContainer: () => HTMLElement | null;
  getContentMain: () => HTMLElement | null;
}): boolean {
  const dialogContainer = input.getDialogContainer();
  const contentMain = input.getContentMain();
  return Boolean(
    dialogContainer?.classList.contains('fullscreen')
    || contentMain?.classList.contains('fullscreen'),
  );
}

export function shouldApplyInitialReviewFullscreen(input: {
  startFullscreen?: boolean;
  mode: string;
  isMobile?: boolean;
  fullscreenActive: boolean;
}): boolean {
  return input.startFullscreen === true
    && input.mode !== 'tab'
    && input.isMobile !== true
    && !input.fullscreenActive;
}

export function toggleReviewFullscreen(input: ReviewFullscreenOptions): void {
  if (input.isMobile || input.mode === 'tab') {
    return;
  }

  input.logger?.debug?.('[SiYuanMemo][ReviewView] Fullscreen button clicked');

  const dialogContainer = input.getDialogContainer();
  const contentMain = input.getContentMain();
  input.logger?.debug?.('[SiYuanMemo][ReviewView] dialogContainer found:', !!dialogContainer);
  input.logger?.debug?.('[SiYuanMemo][ReviewView] contentMain found:', !!contentMain);

  if (contentMain && dialogContainer) {
    const isFullscreen = contentMain.classList.contains('fullscreen');
    input.logger?.debug?.('[SiYuanMemo][ReviewView] Current fullscreen state:', isFullscreen);

    if (isFullscreen) {
      contentMain.classList.remove('fullscreen');
      dialogContainer.classList.remove('fullscreen');
      dialogContainer.style.maxWidth = '1024px';
      document.getElementById('drag')?.classList.remove('fn__hidden');
      input.logger?.debug?.('[SiYuanMemo][ReviewView] Exited fullscreen');
    } else {
      contentMain.classList.add('fullscreen');
      dialogContainer.classList.add('fullscreen');
      dialogContainer.style.maxWidth = '100vw';
      document.getElementById('drag')?.classList.add('fn__hidden');
      input.logger?.debug?.('[SiYuanMemo][ReviewView] Entered fullscreen');
    }

    setTimeout(() => {
      const protyleHost = contentMain.querySelector('.fsrs-review-v2-content__protyle-host');
      input.logger?.debug?.('[SiYuanMemo][ReviewView] protyleHost:', protyleHost);

      if (protyleHost) {
        const protyle = input.getProtyleFromHost(protyleHost);
        input.logger?.debug?.('[SiYuanMemo][ReviewView] protyle instance:', protyle);

        if (protyle && typeof protyle.resize === 'function') {
          protyle.resize();
          input.logger?.debug?.('[SiYuanMemo][ReviewView] Protyle resized');
        }
      }
    }, 0);
  } else {
    input.logger?.debug?.('[SiYuanMemo][ReviewView] ERROR: contentMain or dialogContainer not found!');
  }
}
