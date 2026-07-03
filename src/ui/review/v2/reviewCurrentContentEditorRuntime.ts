import { computed, ref } from 'vue';
import type { ReviewEditableTarget } from './types';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';

type ReviewTextEditorTranslate = (key: string, fallback: string) => string;

type ReviewTextEditorShowMessage = (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;

type ReviewTextEditorLogger = {
  error?: (...args: unknown[]) => void;
};

export interface ReviewEditableTargetEditorEntry {
  target: ReviewEditableTarget;
  value: string;
  originalValue: string;
  saveError?: string;
  conflict?: ReviewEditableTargetConflictState;
  fieldErrors?: Record<string, string>;
  fieldConflicts?: Record<string, ReviewEditableTargetConflictState>;
}

export type ReviewEditableTargetConflictResolution = 'source-latest' | 'draft-overwrite';

export interface ReviewEditableTargetConflictState {
  message: string;
  sourceLatestValue?: string;
  draftValue?: string;
  latestSource?: string;
  fieldId?: string;
}

export interface ReviewCurrentContentEditorPendingWrite {
  entry: ReviewEditableTargetEditorEntry;
  targetId: string;
  blockId: string;
  value: string;
  originalValue: string;
  sourceKind: ReviewEditableTarget['sourceKind'];
}

export interface ReviewCurrentContentEditorWriteConflict {
  targetId: string;
  message: string;
  fieldId?: string;
  sourceLatestValue?: string;
  draftValue?: string;
  latestSource?: string;
}

export interface ReviewCurrentContentEditorWriteUpdate {
  targetId: string;
  value: string;
}

export interface ReviewCurrentContentEditorRelationPreview {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  raw?: unknown;
}

export interface ReviewCurrentContentEditorValidationResult {
  conflicts?: ReviewCurrentContentEditorWriteConflict[];
  updates?: ReviewCurrentContentEditorWriteUpdate[];
  relationPreview?: ReviewCurrentContentEditorRelationPreview | null;
}

export interface ReviewCurrentContentEditorAfterSuccessfulWritesResult {
  refreshVisibleContent?: boolean;
}

export type ReviewCurrentContentEditorRuntimeOptions = {
  t: ReviewTextEditorTranslate;
  showMessage: ReviewTextEditorShowMessage;
  logger?: ReviewTextEditorLogger;
  getReviewService: () => ReviewApplicationService | null;
  resolveEditableTargets: () => ReviewEditableTarget[];
  validatePendingWrites?: (
    pendingWrites: ReviewCurrentContentEditorPendingWrite[],
  ) => Promise<ReviewCurrentContentEditorValidationResult | void> | ReviewCurrentContentEditorValidationResult | void;
  confirmRelationPreview?: (
    preview: ReviewCurrentContentEditorRelationPreview,
    pendingWrites: ReviewCurrentContentEditorPendingWrite[],
  ) => Promise<boolean> | boolean;
  afterSuccessfulWrites?: (
    pendingWrites: ReviewCurrentContentEditorPendingWrite[],
    validation: ReviewCurrentContentEditorValidationResult,
  ) => Promise<ReviewCurrentContentEditorAfterSuccessfulWritesResult | void>
    | ReviewCurrentContentEditorAfterSuccessfulWritesResult
    | void;
  suppressSourceBlockRefresh: (blockId: string) => void;
  refreshVisibleContent: (reason: string) => Promise<boolean | undefined> | boolean | undefined;
};

export function createReviewCurrentContentEditorRuntime(
  options: ReviewCurrentContentEditorRuntimeOptions,
) {
  const open = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  const targets = ref<ReviewEditableTarget[]>([]);
  const entries = ref<ReviewEditableTargetEditorEntry[]>([]);
  let seq = 0;

  const dirtyEntries = computed(() => entries.value.filter(entry => entry.value !== entry.originalValue));
  const dirty = computed(() => dirtyEntries.value.length > 0);
  const title = computed(() => options.t('editSourceContent', '编辑源内容'));
  const readonly = computed(() => loading.value || saving.value);
  const confirmDisabled = computed(() => (
    readonly.value
    || targets.value.length === 0
    || dirtyEntries.value.length === 0
  ));
  const hint = computed(() => {
    if (loading.value) {
      return options.t('loadingCurrentContentMarkdown', '正在读取当前块的原始 Markdown...');
    }
    if (saving.value) {
      return options.t('savingCurrentContentMarkdown', '正在保存到思源块...');
    }
    return options.t('editSourceContentHint', '支持 Markdown，Ctrl/Cmd + Enter 保存');
  });

  function resetLoadedState(): void {
    targets.value = [];
    entries.value = [];
  }

  function close(): void {
    if (saving.value) {
      return;
    }

    open.value = false;
    loading.value = false;
    resetLoadedState();
    seq += 1;
  }

  function updateTargetValue(targetId: string, nextValue: string): void {
    const entry = entries.value.find(item => item.target.id === targetId);
    if (!entry) {
      return;
    }
    entry.value = nextValue;
    entry.saveError = undefined;
    entry.conflict = undefined;
    entry.fieldErrors = undefined;
    entry.fieldConflicts = undefined;
  }

  function replaceTargetDraft(targetId: string, nextValue: string, nextOriginalValue?: string): void {
    const entry = entries.value.find(item => item.target.id === targetId);
    if (!entry) {
      return;
    }
    entry.value = nextValue;
    if (nextOriginalValue !== undefined) {
      entry.originalValue = nextOriginalValue;
    }
    entry.saveError = undefined;
    entry.conflict = undefined;
    entry.fieldErrors = undefined;
    entry.fieldConflicts = undefined;
  }

  function clearTargetConflict(targetId: string, fieldId?: string): void {
    const entry = entries.value.find(item => item.target.id === targetId);
    if (!entry) {
      return;
    }
    if (fieldId && entry.fieldErrors) {
      delete entry.fieldErrors[fieldId];
      if (Object.keys(entry.fieldErrors).length === 0) {
        entry.fieldErrors = undefined;
      }
    }
    if (fieldId && entry.fieldConflicts) {
      delete entry.fieldConflicts[fieldId];
      if (Object.keys(entry.fieldConflicts).length === 0) {
        entry.fieldConflicts = undefined;
      }
    }
    if (!fieldId) {
      entry.saveError = undefined;
      entry.conflict = undefined;
    }
  }

  function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function createPendingWrite(entry: ReviewEditableTargetEditorEntry): ReviewCurrentContentEditorPendingWrite {
    return {
      entry,
      targetId: entry.target.id,
      blockId: entry.target.blockId,
      value: entry.value,
      originalValue: entry.originalValue,
      sourceKind: entry.target.sourceKind,
    };
  }

  function resolvePendingWrites(): ReviewCurrentContentEditorPendingWrite[] {
    const dirty = dirtyEntries.value.map(createPendingWrite);
    const hasConceptReferenceChange = dirty.some(write => write.sourceKind === 'concept-reference');
    if (!hasConceptReferenceChange) {
      return dirty;
    }

    const pendingTargetIds = new Set(dirty.map(write => write.targetId));
    const supportMarkdownWrites = entries.value
      .filter(entry => (
        entry.target.sourceKind === 'block-markdown'
        && !pendingTargetIds.has(entry.target.id)
      ))
      .map(createPendingWrite);
    return [...dirty, ...supportMarkdownWrites];
  }

  async function openEditor(): Promise<boolean> {
    const editableTargets = options.resolveEditableTargets();
    const markdownTargets = editableTargets.filter(target => target.sourceKind === 'block-markdown');
    if (editableTargets.length === 0) {
      options.showMessage(options.t('currentContentNotEditable', '当前内容暂不支持编辑'), 3000, 'info');
      return false;
    }

    const reviewService = options.getReviewService();
    if (!reviewService && markdownTargets.length > 0) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return false;
    }

    const currentSeq = ++seq;
    targets.value = editableTargets;
    entries.value = editableTargets.map(target => ({
      target,
      value: '',
      originalValue: '',
    }));
    open.value = true;
    loading.value = true;

    try {
      const loadedEntries = await Promise.all(editableTargets.map(async (target) => {
        if (target.sourceKind === 'concept-reference') {
          const value = target.blockId;
          return {
            target,
            value,
            originalValue: value,
          };
        }
        const markdown = await reviewService.getEditableBlockMarkdown(target.blockId);
        return {
          target,
          value: String(markdown ?? ''),
          originalValue: String(markdown ?? ''),
        };
      }));
      if (currentSeq !== seq || !open.value) {
        return false;
      }
      entries.value = loadedEntries;
      return true;
    } catch (error) {
      if (currentSeq !== seq) {
        return false;
      }
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to load editable review content:', error);
      close();
      options.showMessage(
        options.t('loadCurrentContentFailed', '读取当前内容失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
      return false;
    } finally {
      if (currentSeq === seq) {
        loading.value = false;
      }
    }
  }

  async function confirm(): Promise<boolean> {
    const pendingWrites = resolvePendingWrites();
    if (confirmDisabled.value || pendingWrites.length === 0) {
      return false;
    }

    const markdownWrites = pendingWrites.filter(write => write.sourceKind === 'block-markdown');

    const reviewService = options.getReviewService();
    if (!reviewService && markdownWrites.length > 0) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return false;
    }

    const currentSeq = ++seq;
    saving.value = true;

    try {
      for (const write of pendingWrites) {
        write.entry.saveError = undefined;
        write.entry.conflict = undefined;
        write.entry.fieldErrors = undefined;
        write.entry.fieldConflicts = undefined;
      }

      const validation = await options.validatePendingWrites?.(pendingWrites) || {};
      if (currentSeq !== seq) {
        return false;
      }
      const conflicts = validation.conflicts || [];
      if (conflicts.length > 0) {
        for (const conflict of conflicts) {
          const write = pendingWrites.find(item => item.targetId === conflict.targetId);
          if (write) {
            const conflictState: ReviewEditableTargetConflictState = {
              message: conflict.message,
              sourceLatestValue: conflict.sourceLatestValue,
              draftValue: conflict.draftValue,
              latestSource: conflict.latestSource,
              fieldId: conflict.fieldId,
            };
            if (conflict.fieldId) {
              write.entry.fieldErrors = {
                ...(write.entry.fieldErrors || {}),
                [conflict.fieldId]: conflict.message,
              };
              write.entry.fieldConflicts = {
                ...(write.entry.fieldConflicts || {}),
                [conflict.fieldId]: conflictState,
              };
            } else {
              write.entry.saveError = conflict.message;
              write.entry.conflict = conflictState;
            }
          }
        }
        const message = conflicts[0].message;
        options.showMessage(
          options.t('saveCurrentContentFailed', '保存当前内容失败：{message}')
            .replace('{message}', message),
          5000,
          'error',
        );
        return false;
      }

      for (const update of validation.updates || []) {
        const write = pendingWrites.find(item => item.targetId === update.targetId);
        if (!write) {
          continue;
        }
        write.value = update.value;
        write.entry.value = update.value;
      }

      const relationPreview = validation.relationPreview || null;
      if (relationPreview) {
        const confirmed = await options.confirmRelationPreview?.(relationPreview, pendingWrites);
        if (currentSeq !== seq) {
          return false;
        }
        if (confirmed !== true) {
          return false;
        }
      }

      const dirtyMarkdownWrites = markdownWrites.filter(write => write.value !== write.originalValue);
      const results = await Promise.allSettled(dirtyMarkdownWrites.map(async write => (
        reviewService?.updateBlockMarkdown(write.blockId, write.value)
      )));
      if (currentSeq !== seq) {
        return false;
      }

      const failedWrites = results.flatMap((result, index) => {
        if (result.status === 'fulfilled') {
          options.suppressSourceBlockRefresh(dirtyMarkdownWrites[index].blockId);
          return [];
        }

        const message = formatErrorMessage(result.reason);
        dirtyMarkdownWrites[index].entry.saveError = message;
        dirtyMarkdownWrites[index].entry.conflict = undefined;
        dirtyMarkdownWrites[index].entry.fieldErrors = undefined;
        dirtyMarkdownWrites[index].entry.fieldConflicts = undefined;
        return [{ write: dirtyMarkdownWrites[index], message }];
      });

      if (failedWrites.length > 0) {
        const error = new Error(failedWrites[0].message);
        options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to save editable review content:', error);
        options.showMessage(
          options.t('saveCurrentContentFailed', '保存当前内容失败：{message}')
            .replace('{message}', error.message),
          5000,
          'error',
        );
        return false;
      }

      for (const write of pendingWrites) {
        write.entry.originalValue = write.value;
        write.entry.saveError = undefined;
        write.entry.conflict = undefined;
        write.entry.fieldErrors = undefined;
        write.entry.fieldConflicts = undefined;
      }

      const afterSuccessfulWritesResult = await options.afterSuccessfulWrites?.(pendingWrites, validation);
      if (currentSeq !== seq) {
        return false;
      }

      if (afterSuccessfulWritesResult?.refreshVisibleContent !== false) {
        await options.refreshVisibleContent('manual-edit-save');
        if (currentSeq !== seq) {
          return false;
        }
      }

      open.value = false;
      options.showMessage(options.t('currentContentSaved', '当前内容已保存'), 2000, 'info');
      return true;
    } catch (error) {
      if (currentSeq !== seq) {
        return false;
      }
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to save editable review content:', error);
      options.showMessage(
        options.t('saveCurrentContentFailed', '保存当前内容失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
      return false;
    } finally {
      if (currentSeq === seq) {
        saving.value = false;
      }
    }
  }

  return {
    open,
    loading,
    saving,
    targets,
    entries,
    dirty,
    title,
    readonly,
    confirmDisabled,
    hint,
    close,
    updateTargetValue,
    replaceTargetDraft,
    clearTargetConflict,
    openEditor,
    confirm,
  };
}
