import type { Ref } from 'vue';
import { isProgressiveSelectionInsideNativeProtyle } from '@/application/entries/ProgressiveSelectionResolver';
import type { ReviewEditorState } from './reviewEditorState';
import type { ReviewNativeSplitGuardState } from './types';
import { matchReviewNativeTabSplitCommand, pruneNativeTabSplitMenu } from './reviewNativeSplitHostGuard';

type TimerId = ReturnType<typeof globalThis.setTimeout>;

type ReviewNativeSplitLogger = {
  debug?: (...args: unknown[]) => void;
};

export type ReviewNativeSplitRuntimeOptions = {
  rootRef: Ref<HTMLElement | null>;
  editorState: Ref<ReviewEditorState>;
  mode: () => 'dialog' | 'tab' | undefined;
  reviewSessionId: () => string;
  resolveGuardState: () => ReviewNativeSplitGuardState | null;
  t: (key: string, fallback: string) => string;
  showMessage: (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;
  logger?: ReviewNativeSplitLogger;
  now?: () => number;
  setTimeout?: (handler: () => void, timeout: number) => TimerId;
  clearTimeout?: (timerId: TimerId) => void;
};

const NATIVE_SPLIT_BLOCKED_NOTICE_COOLDOWN_MS = 1500;

export function getReviewEventElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

export function isVisibleReviewRoot(root: HTMLElement | null): root is HTMLElement {
  if (!root || !root.isConnected) {
    return false;
  }
  if (root.hidden) {
    return false;
  }
  const style = window.getComputedStyle(root);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function createReviewNativeSplitRuntime(options: ReviewNativeSplitRuntimeOptions) {
  const now = options.now ?? (() => Date.now());
  const schedule = options.setTimeout ?? ((handler, timeout) => globalThis.setTimeout(handler, timeout));
  const cancel = options.clearTimeout ?? ((timerId) => globalThis.clearTimeout(timerId));
  let menuPruneTimer: TimerId | null = null;
  let blockedNoticeAt = 0;

  function resolveCurrentNativeSplitGuardState(): ReviewNativeSplitGuardState | null {
    return options.resolveGuardState();
  }

  function getActiveTabHeaderId(): string {
    const activeTabHeader = document.querySelector('[data-type="tab-header"].item--focus');
    if (!(activeTabHeader instanceof HTMLElement)) {
      return '';
    }
    return String(activeTabHeader.getAttribute('data-id') || '').trim();
  }

  function isCurrentReviewTabActive(): boolean {
    if (options.mode() !== 'tab') {
      return false;
    }
    const normalizedReviewSessionId = String(options.reviewSessionId() || '').trim();
    return normalizedReviewSessionId.length > 0 && getActiveTabHeaderId() === normalizedReviewSessionId;
  }

  function shouldBlockCurrentNativeTabSplit(): boolean {
    return isCurrentReviewTabActive() && resolveCurrentNativeSplitGuardState()?.blockNativeTabSplit === true;
  }

  function isCurrentReviewTabHeader(target: EventTarget | null): boolean {
    if (options.mode() !== 'tab') {
      return false;
    }
    const targetElement = getReviewEventElement(target);
    const tabHeader = targetElement?.closest('[data-type="tab-header"]');
    if (!(tabHeader instanceof HTMLElement)) {
      return false;
    }
    const normalizedReviewSessionId = String(options.reviewSessionId() || '').trim();
    return normalizedReviewSessionId.length > 0
      && String(tabHeader.getAttribute('data-id') || '').trim() === normalizedReviewSessionId;
  }

  function showNativeSplitBlockedNotice(): void {
    const timestamp = now();
    if (timestamp - blockedNoticeAt < NATIVE_SPLIT_BLOCKED_NOTICE_COOLDOWN_MS) {
      return;
    }
    blockedNoticeAt = timestamp;
    options.showMessage(
      options.t(
        'nativeSplitBlockedForSpecialReview',
        '当前特殊渲染卡已禁用思源原生分屏，请使用“右侧/下方分屏当前复习”',
      ),
      2500,
      'info',
    );
  }

  function clearMenuPruneTimer(): void {
    if (menuPruneTimer !== null) {
      cancel(menuPruneTimer);
      menuPruneTimer = null;
    }
  }

  function scheduleTabMenuHandling(): void {
    clearMenuPruneTimer();
    menuPruneTimer = schedule(() => {
      menuPruneTimer = null;
      const commonMenu = document.getElementById('commonMenu');
      if (!(commonMenu instanceof HTMLElement) || commonMenu.getAttribute('data-name') !== 'tab') {
        return;
      }
      if (!shouldBlockCurrentNativeTabSplit()) {
        return;
      }
      const removed = pruneNativeTabSplitMenu(commonMenu);
      if (removed) {
        options.logger?.debug?.('[SiYuanMemo][ReviewView] Removed native split menu for special renderer review tab', {
          reviewSessionId: options.reviewSessionId(),
          rendererKind: resolveCurrentNativeSplitGuardState()?.rendererKind,
        });
      }
    }, 0);
  }

  function handleTabContextMenu(event: MouseEvent): void {
    if (!isCurrentReviewTabHeader(event.target)) {
      return;
    }

    scheduleTabMenuHandling();
  }

  function isInsideReviewRoot(target: EventTarget | null): boolean {
    const root = options.rootRef.value;
    const element = getReviewEventElement(target);
    return !!root && !!element && root.contains(element);
  }

  function getVisibleReviewRoots(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.fsrs-review-v2'))
      .filter((element): element is HTMLDivElement => element instanceof HTMLDivElement)
      .filter((element) => isVisibleReviewRoot(element));
  }

  function isActiveReviewSurface(): boolean {
    const root = options.rootRef.value;
    if (!isVisibleReviewRoot(root)) {
      return false;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && root.contains(activeElement)) {
      return true;
    }

    const visibleRoots = getVisibleReviewRoots();
    return visibleRoots.length === 1
      && visibleRoots[0] === root
      && (activeElement === document.body || activeElement === document.documentElement || activeElement === null);
  }

  function maybeHandleBlockedHotkey(event: KeyboardEvent): boolean {
    const command = matchReviewNativeTabSplitCommand(event);
    if (!command || !shouldBlockCurrentNativeTabSplit()) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    options.logger?.debug?.('[SiYuanMemo][ReviewView] Blocked native split hotkey for special renderer review tab', {
      command,
      reviewSessionId: options.reviewSessionId(),
      rendererKind: resolveCurrentNativeSplitGuardState()?.rendererKind,
    });
    showNativeSplitBlockedNotice();
    return true;
  }

  function isReviewKeyboardContext(target: EventTarget | null): boolean {
    if (isInsideReviewRoot(target) || isInsideReviewRoot(document.activeElement)) {
      return true;
    }

    const root = options.rootRef.value;
    const activeElement = document.activeElement;
    return !!root
      && root.isConnected
      && (activeElement === document.body || activeElement === document.documentElement);
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    const element = getReviewEventElement(target);
    if (!element) {
      return false;
    }
    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
  }

  function isCurrentNativeProtyleSurface(target: EventTarget | null): boolean {
    if (options.editorState.value.renderer !== 'main-protyle') {
      return false;
    }
    const root = options.rootRef.value;
    if (!root || !root.querySelector('.protyle')) {
      return false;
    }
    return isInsideReviewRoot(target) || isInsideReviewRoot(document.activeElement);
  }

  function hasProgressiveExcerptRequestContext(): boolean {
    return isCurrentNativeProtyleSurface(document.activeElement)
      || isProgressiveSelectionInsideNativeProtyle({ root: options.rootRef.value })
      || isInsideReviewRoot(document.activeElement);
  }

  return {
    clearMenuPruneTimer,
    handleTabContextMenu,
    isActiveReviewSurface,
    isCurrentNativeProtyleSurface,
    isInsideReviewRoot,
    isReviewKeyboardContext,
    isTypingTarget,
    hasProgressiveExcerptRequestContext,
    maybeHandleBlockedHotkey,
  };
}
