import { showMessage, type IEventBusMap, type IProtyle } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';
import {
  isProgressiveSelectionInsideNativeProtyle,
  type ProgressiveExcerptSelectionSnapshot,
  resolveProgressiveExcerptSelectionSnapshot,
} from '@/application/entries/ProgressiveSelectionResolver';
import {
  applyProgressiveExcerptHighlight,
  prepareProgressiveExcerptHighlight,
} from '@/application/entries/ProgressiveExcerptHighlight';
import type { ExcerptRecord } from '@/application/services/ExcerptRecordService';
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
  protyle?: IProtyle | unknown;
};

type ProgressiveExcerptContentMenuDetail = Pick<IEventBusMap['open-menu-content'], 'menu' | 'protyle'>;

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
      protyle,
    });
  }

  handleContentMenu(e: unknown): void {
    const detail = this.getEventDetail<ProgressiveExcerptContentMenuDetail>(e);
    const menu = detail?.menu;
    if (!menu) {
      return;
    }

    const selection = this.resolveEditorSelectionSnapshot({
      root: getProtyleRoot(detail.protyle),
      protyle: detail.protyle,
    });
    if (!selection) {
      return;
    }

    menu.addItem({
      icon: 'iconQuote',
      label: this.translate('progressiveExcerptMenuLabel', '摘录'),
      click: async () => {
        await this.runExcerptFromSnapshot(selection);
      },
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

  private async runExcerptFromSelection(
    options?: ProgressiveExcerptSelectionOptions,
    actionOptions?: { requireEnabled?: boolean },
  ): Promise<void> {
    if ((actionOptions?.requireEnabled ?? true) && !this.isExcerptEnabled()) {
      this.showDisabledMessage();
      return;
    }

    const selection = this.resolveEditorSelectionSnapshot(options);
    if (!selection) {
      this.showMissingSelectionMessage();
      return;
    }

    await this.runExcerptFromSnapshot(selection);
  }

  private async runExcerptFromSnapshot(selection: ProgressiveExcerptSelectionSnapshot): Promise<void> {
    try {
      const materialized = await this.context.getSelectionExcerptService().materializeExcerptSource(selection);
      const preparedHighlight = this.tryPrepareExcerptHighlight(materialized.highlightSnapshot);
      const result = await this.context.getSelectionExcerptService().createFromSelection({
        sourceBlockId: materialized.sourceBlockId,
        sourceBlockIds: materialized.sourceBlockIds,
        selectedText: selection.text,
        contentDom: materialized.contentDom,
        origin: 'editor',
      });
      if (result.kind === 'duplicate') {
        await this.tryApplyExcerptHighlight(preparedHighlight);
        await this.tryOpenExistingExcerpt(result.record);
        showMessage(
          this.translate('progressiveExcerptDuplicateJumped', '这段原文已摘录过，已跳到现有摘录'),
          3000,
          'info',
        );
        return;
      }

      result.colorApplied = await this.tryApplyExcerptHighlight(preparedHighlight);
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

  private resolveEditorSelectionSnapshot(
    options?: ProgressiveExcerptSelectionOptions,
  ): ProgressiveExcerptSelectionSnapshot | null {
    const selectionOptions = options?.root ? { root: options.root } : undefined;
    if (!isProgressiveSelectionInsideNativeProtyle(selectionOptions)) {
      return null;
    }

    return resolveProgressiveExcerptSelectionSnapshot({
      ...selectionOptions,
      protyle: options?.protyle,
    });
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

  private getEventDetail<T extends object>(event: unknown): T | null {
    if (!event || typeof event !== 'object') {
      return null;
    }
    const detail = (event as { detail?: unknown }).detail;
    if (detail && typeof detail === 'object') {
      return detail as T;
    }
    return event as T;
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
      this.translate('progressiveExcerptNoSelection', '请先选中文本后再摘抄'),
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

  private async tryOpenExistingExcerpt(record: ExcerptRecord): Promise<void> {
    try {
      const tabApplicationService = this.context.getTabApplicationService();
      if (record.excerptEntityType === 'doc') {
        await tabApplicationService.openDocumentTab({ docId: record.excerptEntityId });
        return;
      }
      await tabApplicationService.openBlockTab({ blockId: record.excerptEntityId });
    } catch (error) {
      logger.warn('Failed to jump to existing excerpt record after duplicate detection', error);
    }
  }

  private async tryApplyExcerptHighlight(selection: Parameters<typeof applyProgressiveExcerptHighlight>[0]): Promise<boolean> {
    try {
      return await applyProgressiveExcerptHighlight(selection, {
        persistDomBlock: (blockId, dom) => this.context.getSelectionExcerptService().updateSourceBlockDom(blockId, dom),
      });
    } catch (error) {
      logger.warn('Failed to apply progressive excerpt highlight after excerpt creation', error);
      return false;
    }
  }

  private tryPrepareExcerptHighlight(selection: ProgressiveExcerptSelectionSnapshot): ReturnType<typeof prepareProgressiveExcerptHighlight> {
    try {
      return prepareProgressiveExcerptHighlight(selection);
    } catch (error) {
      logger.warn('Failed to prepare progressive excerpt highlight before excerpt creation', error);
      return null;
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
