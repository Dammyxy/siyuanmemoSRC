import { ref } from 'vue';

export type ReviewInlineCardEditorBridgeRuntimeOptions = {
  clearStructuredState: () => void;
  canOpen: () => boolean;
  showNotEditable: () => void;
  openSourceEditor: () => Promise<boolean> | boolean;
  closeSourceEditor: () => void;
  confirmSourceEditor: () => Promise<boolean> | boolean;
};

export function createReviewInlineCardEditorBridgeRuntime(
  options: ReviewInlineCardEditorBridgeRuntimeOptions,
) {
  const open = ref(false);

  function clearStructuredState(): void {
    options.clearStructuredState();
  }

  function close(): void {
    clearStructuredState();
    options.closeSourceEditor();
    open.value = false;
  }

  async function openEditor(): Promise<boolean> {
    if (open.value) {
      close();
      return false;
    }

    clearStructuredState();
    if (!options.canOpen()) {
      options.showNotEditable();
      return false;
    }

    open.value = true;
    const opened = await options.openSourceEditor();
    if (!opened) {
      open.value = false;
    }
    return opened;
  }

  async function confirmSource(): Promise<boolean> {
    const saved = await options.confirmSourceEditor();
    if (saved) {
      clearStructuredState();
      open.value = false;
    }
    return saved;
  }

  return {
    open,
    canOpen: options.canOpen,
    openEditor,
    close,
    confirmSource,
  };
}
