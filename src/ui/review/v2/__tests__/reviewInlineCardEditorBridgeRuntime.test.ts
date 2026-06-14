import { describe, expect, it, vi } from 'vitest';
import { createReviewInlineCardEditorBridgeRuntime } from '../reviewInlineCardEditorBridgeRuntime';

describe('reviewInlineCardEditorBridgeRuntime', () => {
  it('opens the inline card editor only when editable targets exist', async () => {
    const clearStructuredState = vi.fn();
    const showNotEditable = vi.fn();
    const openSourceEditor = vi.fn(async () => true);
    let editable = false;
    const runtime = createReviewInlineCardEditorBridgeRuntime({
      clearStructuredState,
      canOpen: () => editable,
      showNotEditable,
      openSourceEditor,
      closeSourceEditor: vi.fn(),
      confirmSourceEditor: vi.fn(),
    });

    await runtime.openEditor();

    expect(runtime.open.value).toBe(false);
    expect(showNotEditable).toHaveBeenCalledTimes(1);
    expect(openSourceEditor).not.toHaveBeenCalled();

    editable = true;
    await runtime.openEditor();

    expect(clearStructuredState).toHaveBeenCalledTimes(2);
    expect(openSourceEditor).toHaveBeenCalledTimes(1);
    expect(runtime.open.value).toBe(true);
  });

  it('closes and clears bridge state after source close or successful save', async () => {
    const clearStructuredState = vi.fn();
    const closeSourceEditor = vi.fn();
    const confirmSourceEditor = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const runtime = createReviewInlineCardEditorBridgeRuntime({
      clearStructuredState,
      canOpen: () => true,
      showNotEditable: vi.fn(),
      openSourceEditor: vi.fn(async () => true),
      closeSourceEditor,
      confirmSourceEditor,
    });

    await runtime.openEditor();
    await runtime.confirmSource();

    expect(runtime.open.value).toBe(true);
    expect(clearStructuredState).toHaveBeenCalledTimes(1);

    await runtime.confirmSource();

    expect(runtime.open.value).toBe(false);
    expect(clearStructuredState).toHaveBeenCalledTimes(2);

    await runtime.openEditor();
    runtime.close();

    expect(runtime.open.value).toBe(false);
    expect(closeSourceEditor).toHaveBeenCalledTimes(1);
    expect(clearStructuredState).toHaveBeenCalledTimes(4);
  });

  it('closes an already open bridge instead of reopening source editor', async () => {
    const closeSourceEditor = vi.fn();
    const openSourceEditor = vi.fn(async () => true);
    const runtime = createReviewInlineCardEditorBridgeRuntime({
      clearStructuredState: vi.fn(),
      canOpen: () => true,
      showNotEditable: vi.fn(),
      openSourceEditor,
      closeSourceEditor,
      confirmSourceEditor: vi.fn(),
    });

    await runtime.openEditor();
    await runtime.openEditor();

    expect(openSourceEditor).toHaveBeenCalledTimes(1);
    expect(closeSourceEditor).toHaveBeenCalledTimes(1);
    expect(runtime.open.value).toBe(false);
  });
});
