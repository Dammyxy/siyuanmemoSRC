import { showMessage, type IEventBusMap, type IProtyle } from 'siyuan';
import type { ApplicationContext } from '@/application/ApplicationContext';
import {
  isProgressiveSelectionInsideNativeProtyle,
  type ProgressiveExcerptSelectionSnapshot,
  resolveProgressiveExcerptSelectionSnapshot,
  resolveProgressiveExcerptSnapshotFromSelectedBlocks,
} from '@/application/entries/ProgressiveSelectionResolver';
import {
  applyPreparedSelectionClozeMark,
  type PreparedSelectionClozeMark,
  type PreparedSelectionClozeMarkApplyResult,
  prepareSelectionClozeMark,
} from '@/application/entries/SelectionClozeMarker';
import type {
  SelectionTopicContinuationPreparation,
  SelectionTopicContinuationResult,
} from '@/application/services/SelectionTopicContinuationService';
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
  private pendingItemCommandTimer: number | null = null;

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

  async runItemFromEditor(protyle: IProtyle | unknown): Promise<void> {
    await this.runItemFromSelection({
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

    const topicContinuationPreparation = this.context.getSelectionTopicContinuationService().prepareSelection({
      sourceBlockId: selection.sourceBlockId,
      sourceBlockIds: selection.sourceBlockIds,
      topicContainerId: this.resolveTopicContainerId(selection),
      topicContainerIds: this.resolveTopicContainerIds(selection),
      selectedText: selection.text,
      contentDom: selection.contentDom,
      blockSelections: selection.blockSelections,
      rootId: this.resolveProtyleRootId(detail.protyle, selection.sourceBlockId),
      origin: 'editor',
    });

    menu.addItem({
      icon: 'iconQuote',
      label: this.translate('progressiveExcerptMenuLabel', '摘录'),
      click: async () => {
        await this.runExcerptFromSnapshot(selection);
      },
    });

    if (!topicContinuationPreparation.available) {
      return;
    }

    menu.addItem({
      icon: 'iconAdd',
      label: this.translate('progressiveExcerptContinuationMenuLabel', '在 Topic 下创建 Item'),
      click: async () => {
        await this.runTopicContinuationFromSnapshot(selection, topicContinuationPreparation);
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

  runItemFromCommand(): void {
    this.clearPendingCommand();
    this.pendingItemCommandTimer = window.setTimeout(() => {
      this.pendingItemCommandTimer = null;
      void this.runItemFromSelection();
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

  private async runItemFromSelection(
    options?: ProgressiveExcerptSelectionOptions,
  ): Promise<void> {
    const selection = this.resolveEditorSelectionSnapshot(options);
    if (!selection) {
      this.showMissingItemSelectionMessage();
      return;
    }

    const topicContinuationPreparation = this.context.getSelectionTopicContinuationService().prepareSelection({
      sourceBlockId: selection.sourceBlockId,
      sourceBlockIds: selection.sourceBlockIds,
      topicContainerId: this.resolveTopicContainerId(selection),
      topicContainerIds: this.resolveTopicContainerIds(selection),
      selectedText: selection.text,
      contentDom: selection.contentDom,
      blockSelections: selection.blockSelections,
      rootId: this.resolveProtyleRootId(selection.protyle, selection.sourceBlockId),
      origin: 'editor',
    });

    const rejectionMessage = this.getTopicContinuationRejectionMessage(selection, topicContinuationPreparation);
    if (rejectionMessage) {
      showMessage(rejectionMessage, 3000, 'error');
      return;
    }

    if (topicContinuationPreparation.available) {
      await this.runTopicContinuationFromSnapshot(selection, topicContinuationPreparation);
      return;
    }

    if (topicContinuationPreparation.topicContext && selection.blockSelections.length !== 1) {
      showMessage(
        this.translate('progressiveItemSingleBlockOnly', '请在单个块内连续选区后再创建 Item'),
        3000,
        'error',
      );
      return;
    }

    await this.runPlainClozeFallbackFromSnapshot(selection);
  }

  private async runExcerptFromSnapshot(selection: ProgressiveExcerptSelectionSnapshot): Promise<void> {
    try {
      const result = await this.context.getSelectionExcerptService().executeSelectionExcerptAction({
        selection,
        origin: 'editor',
        sourceMarkingEnabled: this.isSourceMarkingEnabled(),
      });
      if (result.preservation.incomplete) {
        logger.warn('Progressive excerpt created without DOM preservation evidence for likely inline references', {
          sourceBlockId: result.sourceBlockId,
          sourceBlockIds: result.sourceBlockIds,
        });
      }
      if (result.preservation.incomplete) {
        showMessage(
          this.translate('progressiveExcerptPreservationDegraded', '已创建 Topic，但原文链接或块引用可能未完整保留'),
          5000,
          'info',
        );
      }
      showMessage(
        result.sourceMark.diagnostic
          ? this.translate('progressiveExcerptCreatedSourceMarkFailed', '已创建 Topic，但原文标记未写入')
          : this.translate('progressiveExcerptCreatedHotkey', '已创建 Topic，已进入今日渐进学习'),
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

  private async runTopicContinuationFromSnapshot(
    selection: ProgressiveExcerptSelectionSnapshot,
    preparation?: SelectionTopicContinuationPreparation,
  ): Promise<void> {
    let appliedManualMark: PreparedSelectionClozeMark | null = null;
    let sourceMarkFailed = false;
    try {
      const rejectionMessage = this.getTopicContinuationRejectionMessage(selection, preparation);
      if (rejectionMessage) {
        showMessage(rejectionMessage, 3000, 'error');
        return;
      }

      if (preparation?.mode === 'manual-cloze') {
        const preparedMark = this.tryPrepareSelectionClozeMark(selection);
        if (!preparedMark) {
          throw new Error(this.translate('progressiveItemFallbackUnavailable', '当前选区无法转换为普通挖空'));
        }
        if (preparedMark.blockIds.length !== 1) {
          throw new Error(this.translate('progressiveItemSingleBlockOnly', '请在单个块内连续选区后再创建 Item'));
        }

        try {
          await this.tryApplySelectionClozeMark(preparedMark, {
            stage: 'topic-manual-cloze',
            sourceBlockId: selection.sourceBlockId,
          });
          if (!preparedMark.alreadyApplied) {
            this.context.getAutoCardHandler()?.suppressNextTopicDerivedMarkMutation(preparedMark.blockId);
          }
          appliedManualMark = preparedMark;
        } catch {
          sourceMarkFailed = true;
        }
      }

      const result = await this.context.getSelectionTopicContinuationService().createFromSelection({
        sourceBlockId: selection.sourceBlockId,
        sourceBlockIds: selection.sourceBlockIds,
        topicContainerId: this.resolveTopicContainerId(selection),
        topicContainerIds: this.resolveTopicContainerIds(selection),
        selectedText: selection.text,
        contentDom: selection.contentDom,
        blockSelections: selection.blockSelections,
        rootId: this.resolveProtyleRootId(selection.protyle, selection.sourceBlockId),
        origin: 'editor',
      }, preparation);
      showMessage(
        this.formatTopicContinuationMessage(result, { sourceMarkFailed }),
        3000,
        'info',
      );
    } catch (error) {
      await this.tryRollbackSelectionClozeMark(appliedManualMark);
      logger.error('Failed to create derived items from excerpt selection', error);
      showMessage(
        this.translate('progressiveExcerptContinuationFailed', '在 Topic 下创建 Item 失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
    }
  }

  private async runPlainClozeFallbackFromSnapshot(selection: ProgressiveExcerptSelectionSnapshot): Promise<void> {
    try {
      const preparedMark = this.tryPrepareSelectionClozeMark(selection);
      if (!preparedMark) {
        throw new Error(this.translate('progressiveItemFallbackUnavailable', '当前选区无法转换为普通挖空'));
      }

      await this.tryApplySelectionClozeMark(preparedMark, {
        stage: 'plain-cloze-fallback',
        sourceBlockId: selection.sourceBlockId,
      });

      showMessage(
        preparedMark.alreadyApplied
          ? this.translate('progressiveItemFallbackAlreadyMarked', '当前选区已是挖空标记')
          : this.translate('progressiveItemFallbackCreated', '已将选区标记为挖空，普通卡片会按现有规则生成'),
        3000,
        'info',
      );
    } catch (error) {
      logger.error('Failed to mark plain selection as cloze for standard card creation', error);
      showMessage(
        this.translate('progressiveItemFallbackFailed', '创建普通挖空失败：{message}')
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
    if (isProgressiveSelectionInsideNativeProtyle(selectionOptions)) {
      const rangeSelection = resolveProgressiveExcerptSelectionSnapshot({
        ...selectionOptions,
        protyle: options?.protyle,
      });
      if (rangeSelection) {
        return rangeSelection;
      }
    }

    return resolveProgressiveExcerptSnapshotFromSelectedBlocks({
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
    if (this.pendingItemCommandTimer !== null) {
      window.clearTimeout(this.pendingItemCommandTimer);
      this.pendingItemCommandTimer = null;
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

  private showMissingItemSelectionMessage(): void {
    showMessage(
      this.translate('progressiveItemNoSelection', '请先选中文本后再创建 Item'),
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

  private async tryApplySelectionClozeMark(
    selection: ReturnType<typeof prepareSelectionClozeMark>,
    context?: {
      stage: 'topic-manual-cloze' | 'plain-cloze-fallback';
      sourceBlockId?: string;
    },
  ): Promise<PreparedSelectionClozeMarkApplyResult> {
    try {
      return await applyPreparedSelectionClozeMark(selection, {
        persistDomBlock: (blockId, dom) => this.context.getProgressiveReadingService().updateSourceBlockDom(blockId, dom),
      });
    } catch (error) {
      logger.warn('Failed to apply selection cloze mark before item creation', {
        blockId: selection?.blockId || context?.sourceBlockId || null,
        stage: context?.stage || null,
        isTopicContinuation: context?.stage === 'topic-manual-cloze',
        domPreview: this.previewDomForLog(selection?.nextBlockHtml),
        error,
      });
      throw error;
    }
  }

  private tryPrepareSelectionClozeMark(selection: ProgressiveExcerptSelectionSnapshot): ReturnType<typeof prepareSelectionClozeMark> {
    try {
      return prepareSelectionClozeMark(selection);
    } catch (error) {
      logger.warn('Failed to prepare selection cloze mark before standard card creation fallback', error);
      throw new Error(`PROGRESSIVE_CLOZE_MARK_UNAVAILABLE: failed to prepare selection cloze mark: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private translate(key: string, fallback: string): string {
    try {
      return this.context.getI18n()?.[key] || fallback;
    } catch {
      return fallback;
    }
  }

  private resolveProtyleRootId(protyle: unknown, fallbackBlockId?: string): string | undefined {
    if (!protyle || typeof protyle !== 'object') {
      return fallbackBlockId ? String(fallbackBlockId).trim() || undefined : undefined;
    }

    const rootId = String(
      (protyle as { block?: { rootID?: string; rootId?: string; id?: string } }).block?.rootID
      || (protyle as { block?: { rootID?: string; rootId?: string; id?: string } }).block?.rootId
      || (protyle as { block?: { rootID?: string; rootId?: string; id?: string } }).block?.id
      || '',
    ).trim();
    if (rootId) {
      return rootId;
    }
    return fallbackBlockId ? String(fallbackBlockId).trim() || undefined : undefined;
  }

  private isSourceMarkingEnabled(): boolean {
    try {
      return this.context.getSettingsService().getSettings().progressiveReading?.sourceMarkingEnabled !== false;
    } catch (error) {
      logger.warn('Failed to read progressive excerpt source-mark setting, defaulting to enabled', error);
      return true;
    }
  }

  private resolveTopicContainerId(selection: ProgressiveExcerptSelectionSnapshot): string | undefined {
    return this.resolveTopicContainerIds(selection)[0];
  }

  private resolveTopicContainerIds(selection: ProgressiveExcerptSelectionSnapshot): string[] {
    const sourceBlockId = String(selection.sourceBlockId || '').trim();
    const rootId = this.resolveProtyleRootId(selection.protyle, sourceBlockId);
    const root = selection.root || selection.protyle?.wysiwyg?.element || null;
    if (!root || !sourceBlockId) {
      return [];
    }

    const sourceBlock = Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))
      .find((candidate) => candidate.getAttribute('data-node-id') === sourceBlockId);
    const topicContainerIds: string[] = [];
    let current = sourceBlock?.parentElement || null;
    while (current && current !== root) {
      const candidateId = String(current.getAttribute('data-node-id') || '').trim();
      if (candidateId && candidateId !== sourceBlockId && candidateId !== rootId) {
        topicContainerIds.push(candidateId);
      }
      current = current.parentElement;
    }
    return topicContainerIds;
  }

  private async tryRollbackSelectionClozeMark(prepared: PreparedSelectionClozeMark | null): Promise<void> {
    if (!prepared || prepared.alreadyApplied) {
      return;
    }

    const mutations = prepared.blockMutations
      .filter((mutation) => !mutation.alreadyApplied && mutation.previousBlockHtml !== mutation.nextBlockHtml);
    if (mutations.length === 0) {
      return;
    }

    try {
      for (const mutation of mutations) {
        await this.context.getProgressiveReadingService().updateSourceBlockDom(
          mutation.blockId,
          mutation.previousBlockHtml,
        );
      }
      this.restoreLiveSelectionBlocks(prepared);
    } catch (rollbackError) {
      logger.warn('Failed to rollback topic manual cloze mark after item creation failure', {
        blockIds: mutations.map((mutation) => mutation.blockId),
        error: rollbackError,
      });
    }
  }

  private restoreLiveSelectionBlocks(prepared: PreparedSelectionClozeMark): void {
    const root = prepared.root || prepared.protyle?.wysiwyg?.element || null;
    if (!root) {
      return;
    }

    for (const mutation of prepared.blockMutations) {
      const liveBlock = Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))
        .find((candidate) => candidate.getAttribute('data-node-id') === mutation.blockId);
      if (!liveBlock) {
        continue;
      }

      const template = document.createElement('template');
      template.innerHTML = mutation.previousBlockHtml.trim();
      const previousBlock = template.content.firstElementChild;
      if (previousBlock instanceof HTMLElement) {
        liveBlock.replaceWith(previousBlock);
      }
    }

    const instance = typeof prepared.protyle?.getInstance === 'function'
      ? prepared.protyle.getInstance()
      : null;
    if (typeof instance?.reload === 'function') {
      instance.reload(false);
    }
  }

  private formatTopicContinuationMessage(
    result: SelectionTopicContinuationResult,
    options?: { sourceMarkFailed?: boolean },
  ): string {
    if (options?.sourceMarkFailed && result.created > 0) {
      return this.translate('progressiveExcerptContinuationCreatedSourceMarkFailed', '已在当前 Topic 下新增 {created} 个 Item，但原文标记未写入')
        .replace('{created}', String(result.created));
    }
    if (result.created > 0 && result.skipped > 0) {
      return this.translate('progressiveExcerptContinuationCreatedSkipped', '已在当前 Topic 下新增 {created} 个 Item，跳过 {skipped} 个重复项')
        .replace('{created}', String(result.created))
        .replace('{skipped}', String(result.skipped));
    }
    if (result.created > 0) {
      return this.translate('progressiveExcerptContinuationCreated', '已在当前 Topic 下新增 {created} 个 Item')
        .replace('{created}', String(result.created));
    }
    return this.translate('progressiveExcerptContinuationSkipped', '当前 Topic 下已存在相同 Item，已跳过 {skipped} 个重复项')
      .replace('{skipped}', String(result.skipped));
  }

  private getTopicContinuationRejectionMessage(
    selection: ProgressiveExcerptSelectionSnapshot,
    preparation?: SelectionTopicContinuationPreparation,
  ): string | null {
    if (preparation?.sourceEligibility && !preparation.sourceEligibility.eligible) {
      if (preparation.sourceEligibility.reason === 'non-topic-flashcard-source') {
        return preparation.sourceEligibility.message || this.translate(
          'progressiveItemSourceRoleRejected',
          '当前块已经是闪卡，不能继续派生 Item',
        );
      }
    }

    if (!preparation?.topicContext) {
      return null;
    }

    if (selection.blockSelections.length !== 1) {
      return this.translate('progressiveItemSingleBlockOnly', '请在单个块内连续选区后再创建 Item');
    }

    if (preparation.highlightTargetCount > 1) {
      return this.translate(
        'progressiveItemUseBatchFillCurrentBlock',
        '当前选区包含多个高亮，请改用“从当前块高亮补齐 Item”',
      );
    }

    return null;
  }

  private previewDomForLog(html: string | undefined, maxLength = 160): string {
    const normalized = String(html || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength)}...`;
  }
}
