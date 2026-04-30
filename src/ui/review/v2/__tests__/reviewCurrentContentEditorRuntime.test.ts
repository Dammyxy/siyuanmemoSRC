import { describe, expect, it, vi } from 'vitest';
import { createReviewCurrentContentEditorRuntime } from '../reviewCurrentContentEditorRuntime';

const t = (_key: string, fallback: string) => fallback;

describe('reviewCurrentContentEditorRuntime', () => {
  it('loads editable markdown and saves changed content', async () => {
    const reviewService = {
      getBlockKramdown: vi.fn(async () => 'old **markdown**'),
      updateBlockMarkdown: vi.fn(async () => undefined),
    };
    const suppress = vi.fn();
    const refresh = vi.fn(async () => true);
    const showMessage = vi.fn();
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage,
      logger: {},
      getReviewService: () => reviewService as never,
      resolveEditableSource: () => ({ blockId: 'block-1', title: 'Block one' }),
      suppressSourceBlockRefresh: suppress,
      refreshVisibleContent: refresh,
    });

    await runtime.openEditor();
    runtime.value.value = 'new markdown';
    await runtime.confirm();

    expect(reviewService.getBlockKramdown).toHaveBeenCalledWith('block-1');
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('block-1', 'new markdown');
    expect(suppress).toHaveBeenCalledWith('block-1');
    expect(refresh).toHaveBeenCalledWith('manual-edit-save');
    expect(runtime.open.value).toBe(false);
    expect(showMessage).toHaveBeenLastCalledWith('当前内容已保存', 2000, 'info');
  });

  it('reports missing editable source and missing review service', async () => {
    const showMessage = vi.fn();
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage,
      logger: {},
      getReviewService: () => null,
      resolveEditableSource: () => null,
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: vi.fn(),
    });

    await runtime.openEditor();
    expect(showMessage).toHaveBeenCalledWith('当前内容暂不支持编辑', 3000, 'info');

    const serviceMissingRuntime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage,
      logger: {},
      getReviewService: () => null,
      resolveEditableSource: () => ({ blockId: 'block-1', title: 'Block one' }),
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: vi.fn(),
    });
    await serviceMissingRuntime.openEditor();

    expect(showMessage).toHaveBeenLastCalledWith('Plugin not ready', 3000, 'error');
  });
});
