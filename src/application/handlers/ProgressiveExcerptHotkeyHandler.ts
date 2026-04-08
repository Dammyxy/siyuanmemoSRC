import { showMessage, type IProtyle } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';
import {
  isProgressiveSelectionInsideNativeProtyle,
  resolveProgressiveSelection,
} from '@/application/entries/ProgressiveSelectionResolver';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProgressiveExcerptHotkeyHandler');

export const PROGRESSIVE_EXCERPT_REQUEST_EVENT = 'siyuanmemo:progressive-excerpt-request';

function getProtyleRoot(protyle: unknown): HTMLElement | null {
  if (!protyle || typeof protyle !== 'object') {
    return null;
  }

  const direct = (protyle as { wysiwyg?: { element?: HTMLElement } }).wysiwyg?.element;
  if (direct instanceof HTMLElement) {
    return direct;
  }

  const nested = (protyle as { protyle?: { wysiwyg?: { element?: HTMLElement } } }).protyle?.wysiwyg?.element;
  if (nested instanceof HTMLElement) {
    return nested;
  }

  return null;
}

type ProgressiveExcerptSelectionOptions = {
  root?: HTMLElement | null;
};

export class ProgressiveExcerptHotkeyHandler {
  private pendingCommandTimer: number | null = null;

  constructor(private readonly context: ApplicationContext) {}

  start(): void {
    // Kept as a compatibility no-op while the handler is now command-driven.
  }

  stop(): void {
    this.clearPendingCommand();
  }

  async runFromEditor(protyle: IProtyle | unknown): Promise<void> {
    await this.runExcerptFromSelection({
      root: getProtyleRoot(protyle),
    });
  }

  runFromCommand(): void {
    this.clearPendingCommand();
    this.pendingCommandTimer = window.setTimeout(() => {
      this.pendingCommandTimer = null;
      if (this.requestReviewExcerpt()) {
        return;
      }
      void this.runExcerptFromSelection();
    }, 0);
  }

  private async runExcerptFromSelection(options?: ProgressiveExcerptSelectionOptions): Promise<void> {
    if (!this.isExcerptEnabled()) {
      this.showDisabledMessage();
      return;
    }

    const selectionOptions = options?.root ? { root: options.root } : undefined;
    if (!isProgressiveSelectionInsideNativeProtyle(selectionOptions)) {
      this.showMissingSelectionMessage();
      return;
    }

    const selection = resolveProgressiveSelection(selectionOptions);
    if (!selection) {
      this.showMissingSelectionMessage();
      return;
    }

    try {
      await this.context.getSelectionExcerptService().createFromSelection({
        sourceBlockId: selection.blockId,
        selectedText: selection.text,
        origin: 'editor',
      });
      showMessage(
        this.translate('progressiveExcerptCreatedHotkey', '已创建摘录 Topic，已进入今日渐进学习'),
        3000,
        'info',
      );
    } catch (error) {
      logger.error('Failed to create excerpt from editor command', error);
      showMessage(
        this.translate('progressiveExcerptFailed', '摘抄失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
    }
  }

  private requestReviewExcerpt(): boolean {
    const requestEvent = new CustomEvent(PROGRESSIVE_EXCERPT_REQUEST_EVENT, {
      bubbles: false,
      cancelable: true,
      detail: { source: 'command' },
    });
    window.dispatchEvent(requestEvent);
    return requestEvent.defaultPrevented;
  }

  private clearPendingCommand(): void {
    if (this.pendingCommandTimer !== null) {
      window.clearTimeout(this.pendingCommandTimer);
      this.pendingCommandTimer = null;
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

  private showMissingSelectionMessage(): void {
    showMessage(
      this.translate('progressiveExcerptNoSelection', '请先在同一块内选中文本再摘抄'),
      3000,
      'error',
    );
  }

  private showDisabledMessage(): void {
    showMessage(
      this.translate('progressiveExcerptDisabled', '摘抄快捷键已关闭，请先在设置中开启'),
      3000,
      'info',
    );
  }

  private translate(key: string, fallback: string): string {
    try {
      return this.context.getI18n()?.[key] || fallback;
    } catch {
      return fallback;
    }
  }
}
