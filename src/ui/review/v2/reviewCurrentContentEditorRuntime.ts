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
}

export type ReviewCurrentContentEditorRuntimeOptions = {
  t: ReviewTextEditorTranslate;
  showMessage: ReviewTextEditorShowMessage;
  logger?: ReviewTextEditorLogger;
  getReviewService: () => ReviewApplicationService | null;
  resolveEditableTargets: () => ReviewEditableTarget[];
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
  const title = computed(() => (
    targets.value.length > 1
      ? options.t('editCurrentContentTargets', '编辑当前内容')
      : targets.value[0]?.title || options.t('editCurrentContent', '编辑当前内容')
  ));
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
    return options.t('editCurrentContentHint', '支持 Markdown，Ctrl/Cmd + Enter 保存');
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
  }

  async function openEditor(): Promise<void> {
    const editableTargets = options.resolveEditableTargets();
    if (editableTargets.length === 0) {
      options.showMessage(options.t('currentContentNotEditable', '当前内容暂不支持编辑'), 3000, 'info');
      return;
    }

    const reviewService = options.getReviewService();
    if (!reviewService) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
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
        const markdown = await reviewService.getEditableBlockMarkdown(target.blockId);
        return {
          target,
          value: String(markdown ?? ''),
          originalValue: String(markdown ?? ''),
        };
      }));
      if (currentSeq !== seq || !open.value) {
        return;
      }
      entries.value = loadedEntries;
    } catch (error) {
      if (currentSeq !== seq) {
        return;
      }
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to load editable review content:', error);
      close();
      options.showMessage(
        options.t('loadCurrentContentFailed', '读取当前内容失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
      return;
    } finally {
      if (currentSeq === seq) {
        loading.value = false;
      }
    }
  }

  async function confirm(): Promise<void> {
    const pendingEntries = dirtyEntries.value;
    if (confirmDisabled.value || pendingEntries.length === 0) {
      return;
    }

    const reviewService = options.getReviewService();
    if (!reviewService) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
    }

    const currentSeq = ++seq;
    saving.value = true;

    try {
      for (const entry of pendingEntries) {
        await reviewService.updateBlockMarkdown(entry.target.blockId, entry.value);
        if (currentSeq !== seq) {
          return;
        }
        entry.originalValue = entry.value;
        options.suppressSourceBlockRefresh(entry.target.blockId);
      }

      await options.refreshVisibleContent('manual-edit-save');
      if (currentSeq !== seq) {
        return;
      }

      open.value = false;
      options.showMessage(options.t('currentContentSaved', '当前内容已保存'), 2000, 'info');
    } catch (error) {
      if (currentSeq !== seq) {
        return;
      }
      options.logger?.error?.('[SiYuanMemo][ReviewView] Failed to save editable review content:', error);
      options.showMessage(
        options.t('saveCurrentContentFailed', '保存当前内容失败：{message}')
          .replace('{message}', error instanceof Error ? error.message : String(error)),
        5000,
        'error',
      );
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
    title,
    readonly,
    confirmDisabled,
    hint,
    close,
    updateTargetValue,
    openEditor,
    confirm,
  };
}
