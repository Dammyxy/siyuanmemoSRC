import { showMessage } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';
import {
  isProgressiveSelectionInsideNativeProtyle,
  resolveProgressiveSelection,
} from '@/application/entries/ProgressiveSelectionResolver';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProgressiveExcerptHotkeyHandler');

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) {
    return false;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }
  return element.isContentEditable;
}

function isReviewSurface(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('.fsrs-review-v2'));
}

export class ProgressiveExcerptHotkeyHandler {
  private started = false;
  private pendingExcerptTimer: number | null = null;
  private pendingExcerptSignature = '';

  constructor(private readonly context: ApplicationContext) {}

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    document.removeEventListener('keydown', this.handleKeyDown, true);
    this.clearPendingExcerpt();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key.toLowerCase() !== 'x') {
      return;
    }
    if (isReviewSurface(event.target)) {
      return;
    }
    if (!isTypingTarget(event.target) && !isProgressiveSelectionInsideNativeProtyle()) {
      return;
    }
    if (!isProgressiveSelectionInsideNativeProtyle()) {
      return;
    }
    if (!this.isExcerptEnabled()) {
      return;
    }

    const selection = resolveProgressiveSelection();
    if (!selection) {
      return;
    }

    this.scheduleExcerptAfterNative(selection.blockId, selection.text);
  };

  private scheduleExcerptAfterNative(blockId: string, text: string): void {
    const signature = `${blockId}::${text}`;
    if (this.pendingExcerptTimer !== null && this.pendingExcerptSignature === signature) {
      return;
    }

    this.clearPendingExcerpt();
    this.pendingExcerptSignature = signature;
    this.pendingExcerptTimer = window.setTimeout(() => {
      this.clearPendingExcerpt();
      void this.runExcerpt(blockId, text);
    }, 0);
  }

  private clearPendingExcerpt(): void {
    if (this.pendingExcerptTimer !== null) {
      window.clearTimeout(this.pendingExcerptTimer);
      this.pendingExcerptTimer = null;
    }
    this.pendingExcerptSignature = '';
  }

  private async runExcerpt(blockId: string, text: string): Promise<void> {
    try {
      await this.context.getSelectionExcerptService().createFromSelection({
        sourceBlockId: blockId,
        selectedText: text,
        origin: 'editor',
      });
      showMessage(
        this.translate('progressiveExcerptCreatedHotkey', '已创建摘录 Topic，已进入今日渐进学习'),
        3000,
        'info',
      );
    } catch (error) {
      logger.error('Failed to create excerpt from editor hotkey', error);
      showMessage(
        this.translate('progressiveExcerptFailed', '摘抄失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
    }
  }

  private isExcerptEnabled(): boolean {
    try {
      return this.context.getSettingsService().getSettings().progressiveReading?.altXExcerptEnabled === true;
    } catch (error) {
      logger.warn('Failed to read progressive excerpt setting, defaulting to disabled', error);
      return false;
    }
  }

  private translate(key: string, fallback: string): string {
    try {
      return this.context.getI18n()?.[key] || fallback;
    } catch {
      return fallback;
    }
  }
}
