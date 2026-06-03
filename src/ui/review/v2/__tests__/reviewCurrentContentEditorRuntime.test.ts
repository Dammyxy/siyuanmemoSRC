import { describe, expect, it, vi } from 'vitest';
import type { ReviewEditableTarget } from '../types';
import { createReviewCurrentContentEditorRuntime } from '../reviewCurrentContentEditorRuntime';

const t = (_key: string, fallback: string) => fallback;

function createTarget(
  id: string,
  blockId: string,
  title: string,
  role: ReviewEditableTarget['role'] = 'current-content',
): ReviewEditableTarget {
  return {
    id,
    blockId,
    title,
    role,
    rendererKind: 'descriptor',
    sourceKind: 'block-markdown',
  };
}

describe('reviewCurrentContentEditorRuntime', () => {
  it('loads multiple editable targets and saves dirty targets only', async () => {
    const targets = [
      createTarget('descriptor:concept:concept-block', 'concept-block', 'Concept', 'concept'),
      createTarget('descriptor:descriptor:descriptor-block', 'descriptor-block', 'Descriptor', 'descriptor'),
    ];
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async (blockId: string) => `${blockId} original`),
      getBlockKramdown: vi.fn(async (blockId: string) => `${blockId} original`),
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
      resolveEditableTargets: () => targets,
      suppressSourceBlockRefresh: suppress,
      refreshVisibleContent: refresh,
    });

    await runtime.openEditor();
    runtime.updateTargetValue('descriptor:descriptor:descriptor-block', 'descriptor changed');
    await runtime.confirm();

    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('concept-block');
    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('descriptor-block');
    expect(reviewService.getBlockKramdown).not.toHaveBeenCalled();
    expect(runtime.entries.value).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ blockId: 'concept-block' }),
        value: 'concept-block original',
        originalValue: 'concept-block original',
      }),
      expect.objectContaining({
        target: expect.objectContaining({ blockId: 'descriptor-block' }),
        value: 'descriptor changed',
        originalValue: 'descriptor changed',
      }),
    ]);
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledTimes(1);
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('descriptor-block', 'descriptor changed');
    expect(suppress).toHaveBeenCalledTimes(1);
    expect(suppress).toHaveBeenCalledWith('descriptor-block');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('manual-edit-save');
    expect(runtime.open.value).toBe(false);
    expect(showMessage).toHaveBeenLastCalledWith('当前内容已保存', 2000, 'info');
  });

  it('keeps no-op save disabled and cancel discards edits without writing', async () => {
    const target = createTarget('quick:current-content:block-1', 'block-1', 'Current');
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => 'old **markdown**'),
      getBlockKramdown: vi.fn(async () => 'old **markdown**'),
      updateBlockMarkdown: vi.fn(async () => undefined),
    };
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage: vi.fn(),
      logger: {},
      getReviewService: () => reviewService as never,
      resolveEditableTargets: () => [target],
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: vi.fn(),
    });

    await runtime.openEditor();
    expect(runtime.confirmDisabled.value).toBe(true);
    runtime.updateTargetValue(target.id, 'changed but cancelled');
    expect(runtime.confirmDisabled.value).toBe(false);
    runtime.close();

    expect(runtime.open.value).toBe(false);
    expect(runtime.entries.value).toEqual([]);
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalled();
  });

  it('keeps the editor open when saving a dirty target fails', async () => {
    const targets = [
      createTarget('descriptor:concept:concept-block', 'concept-block', 'Concept', 'concept'),
      createTarget('descriptor:descriptor:descriptor-block', 'descriptor-block', 'Descriptor', 'descriptor'),
    ];
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async (blockId: string) => `${blockId} original`),
      getBlockKramdown: vi.fn(async (blockId: string) => `${blockId} original`),
      updateBlockMarkdown: vi.fn(async (blockId: string) => {
        if (blockId === 'descriptor-block') {
          throw new Error('save failed');
        }
      }),
    };
    const refresh = vi.fn(async () => true);
    const showMessage = vi.fn();
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage,
      logger: {},
      getReviewService: () => reviewService as never,
      resolveEditableTargets: () => targets,
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: refresh,
    });

    await runtime.openEditor();
    runtime.updateTargetValue('descriptor:descriptor:descriptor-block', 'descriptor changed');
    await runtime.confirm();

    expect(runtime.open.value).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenLastCalledWith('保存当前内容失败：save failed', 5000, 'error');
  });

  it('reports missing editable targets and missing review service', async () => {
    const showMessage = vi.fn();
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage,
      logger: {},
      getReviewService: () => null,
      resolveEditableTargets: () => [],
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
      resolveEditableTargets: () => [createTarget('quick:current-content:block-1', 'block-1', 'Block one')],
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: vi.fn(),
    });
    await serviceMissingRuntime.openEditor();

    expect(showMessage).toHaveBeenLastCalledWith('Plugin not ready', 3000, 'error');
  });
});
