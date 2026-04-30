import { computed, ref } from 'vue';
import type { ReviewEditableSource } from './types';
import type { ReviewApplicationService } from '@/application/services/ReviewApplicationService';

type ReviewTextEditorTranslate = (key: string, fallback: string) => string;

type ReviewTextEditorShowMessage = (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;

type ReviewTextEditorLogger = {
  error?: (...args: unknown[]) => void;
};

export type ReviewCurrentContentEditorRuntimeOptions = {
  t: ReviewTextEditorTranslate;
  showMessage: ReviewTextEditorShowMessage;
  logger?: ReviewTextEditorLogger;
  getReviewService: () => ReviewApplicationService | null;
  resolveEditableSource: () => ReviewEditableSource | null;
  suppressSourceBlockRefresh: (blockId: string) => void;
  refreshVisibleContent: (reason: string) => Promise<boolean | undefined> | boolean | undefined;
};

export function createReviewCurrentContentEditorRuntime(
  options: ReviewCurrentContentEditorRuntimeOptions,
) {
  const open = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  const source = ref<ReviewEditableSource | null>(null);
  const value = ref('');
  const originalValue = ref('');
  let seq = 0;

  const title = computed(() => (
    source.value?.title || options.t('editCurrentContent', '编辑当前内容')
  ));
  const readonly = computed(() => loading.value || saving.value);
  const confirmDisabled = computed(() => (
    readonly.value
    || !source.value
    || value.value === originalValue.value
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

  function close(): void {
    if (saving.value) {
      return;
    }

    open.value = false;
    loading.value = false;
    source.value = null;
    value.value = '';
    originalValue.value = '';
    seq += 1;
  }

  async function openEditor(): Promise<void> {
    const editableSource = options.resolveEditableSource();
    if (!editableSource) {
      options.showMessage(options.t('currentContentNotEditable', '当前内容暂不支持编辑'), 3000, 'info');
      return;
    }

    const reviewService = options.getReviewService();
    if (!reviewService) {
      options.showMessage(options.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return;
    }

    const currentSeq = ++seq;
    source.value = editableSource;
    open.value = true;
    loading.value = true;
    value.value = '';
    originalValue.value = '';

    try {
      const kramdown = await reviewService.getBlockKramdown(editableSource.blockId);
      if (currentSeq !== seq || !open.value) {
        return;
      }
      value.value = kramdown;
      originalValue.value = kramdown;
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
    const editableSource = source.value;
    if (!editableSource || confirmDisabled.value) {
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
      await reviewService.updateBlockMarkdown(editableSource.blockId, value.value);
      if (currentSeq !== seq) {
        return;
      }

      originalValue.value = value.value;
      options.suppressSourceBlockRefresh(editableSource.blockId);
      await options.refreshVisibleContent('manual-edit-save');

      open.value = false;
      source.value = null;
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
    source,
    value,
    originalValue,
    title,
    readonly,
    confirmDisabled,
    hint,
    close,
    openEditor,
    confirm,
  };
}
