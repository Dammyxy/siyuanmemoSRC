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
  it('loads multiple editable targets and saves dirty targets together', async () => {
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
    runtime.updateTargetValue('descriptor:concept:concept-block', 'concept changed');
    runtime.updateTargetValue('descriptor:descriptor:descriptor-block', 'descriptor changed');
    await runtime.confirm();

    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('concept-block');
    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('descriptor-block');
    expect(reviewService.getBlockKramdown).not.toHaveBeenCalled();
    expect(runtime.entries.value).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ blockId: 'concept-block' }),
        value: 'concept changed',
        originalValue: 'concept changed',
      }),
      expect.objectContaining({
        target: expect.objectContaining({ blockId: 'descriptor-block' }),
        value: 'descriptor changed',
        originalValue: 'descriptor changed',
      }),
    ]);
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledTimes(2);
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('concept-block', 'concept changed');
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('descriptor-block', 'descriptor changed');
    expect(suppress).toHaveBeenCalledTimes(2);
    expect(suppress).toHaveBeenCalledWith('concept-block');
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

  it('keeps the draft dirty when any dirty field write fails', async () => {
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
    runtime.updateTargetValue('descriptor:concept:concept-block', 'concept changed');
    runtime.updateTargetValue('descriptor:descriptor:descriptor-block', 'descriptor changed');
    await runtime.confirm();

    expect(runtime.open.value).toBe(true);
    expect(runtime.entries.value).toEqual([
      expect.objectContaining({
        value: 'concept changed',
        originalValue: 'concept-block original',
        saveError: undefined,
      }),
      expect.objectContaining({
        value: 'descriptor changed',
        originalValue: 'descriptor-block original',
        saveError: 'save failed',
      }),
    ]);
    expect(refresh).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenLastCalledWith('保存当前内容失败：save failed', 5000, 'error');
  });

  it('keeps the draft open when save validation reports an external field conflict', async () => {
    const target = createTarget('quick:current-content:block-1', 'block-1', 'Current');
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => 'old markdown'),
      getBlockKramdown: vi.fn(async () => 'old markdown'),
      updateBlockMarkdown: vi.fn(async () => undefined),
    };
    const validatePendingWrites = vi.fn(async () => ({
      conflicts: [{
        targetId: target.id,
        message: 'external field changed',
      }],
    }));
    const showMessage = vi.fn();
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage,
      logger: {},
      getReviewService: () => reviewService as never,
      resolveEditableTargets: () => [target],
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: vi.fn(),
      validatePendingWrites,
    });

    await runtime.openEditor();
    runtime.updateTargetValue(target.id, 'local draft');
    const saved = await runtime.confirm();

    expect(saved).toBe(false);
    expect(validatePendingWrites).toHaveBeenCalledWith([
      expect.objectContaining({
        blockId: 'block-1',
        value: 'local draft',
        entry: expect.objectContaining({ target }),
      }),
    ]);
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalled();
    expect(runtime.open.value).toBe(true);
    expect(runtime.entries.value[0]).toEqual(expect.objectContaining({
      value: 'local draft',
      originalValue: 'old markdown',
      saveError: 'external field changed',
    }));
    expect(showMessage).toHaveBeenLastCalledWith('保存当前内容失败：external field changed', 5000, 'error');
  });

  it('previews relation changes before writing and cancels without source writes', async () => {
    const target = createTarget('definition:definition:block-1', 'block-1', 'Definition', 'definition');
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => '((concept-a)) :> old'),
      getBlockKramdown: vi.fn(async () => '((concept-a)) :> old'),
      updateBlockMarkdown: vi.fn(async () => undefined),
    };
    const validatePendingWrites = vi.fn(async () => ({
      relationPreview: {
        title: 'Live relation changes',
        message: 'Will create 1 relation',
      },
    }));
    const confirmRelationPreview = vi.fn(async () => false);
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage: vi.fn(),
      logger: {},
      getReviewService: () => reviewService as never,
      resolveEditableTargets: () => [target],
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: vi.fn(),
      validatePendingWrites,
      confirmRelationPreview,
    });

    await runtime.openEditor();
    runtime.updateTargetValue(target.id, '((concept-b)) :> new');
    const saved = await runtime.confirm();

    expect(saved).toBe(false);
    expect(confirmRelationPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Live relation changes',
        message: 'Will create 1 relation',
      }),
      [expect.objectContaining({
        blockId: 'block-1',
        value: '((concept-b)) :> new',
      })],
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalled();
    expect(runtime.open.value).toBe(true);
  });

  it('writes after relation preview confirmation and then runs the reconcile hook', async () => {
    const target = createTarget('definition:definition:block-1', 'block-1', 'Definition', 'definition');
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => '((concept-a)) :> old'),
      getBlockKramdown: vi.fn(async () => '((concept-a)) :> old'),
      updateBlockMarkdown: vi.fn(async () => undefined),
    };
    const relationPreview = {
      title: 'Live relation changes',
      message: 'Will create 1 relation',
    };
    const validatePendingWrites = vi.fn(async () => ({ relationPreview }));
    const confirmRelationPreview = vi.fn(async () => true);
    const afterSuccessfulWrites = vi.fn(async () => undefined);
    const runtime = createReviewCurrentContentEditorRuntime({
      t,
      showMessage: vi.fn(),
      logger: {},
      getReviewService: () => reviewService as never,
      resolveEditableTargets: () => [target],
      suppressSourceBlockRefresh: vi.fn(),
      refreshVisibleContent: vi.fn(async () => true),
      validatePendingWrites,
      confirmRelationPreview,
      afterSuccessfulWrites,
    });

    await runtime.openEditor();
    runtime.updateTargetValue(target.id, '((concept-b)) :> new');
    const saved = await runtime.confirm();

    expect(saved).toBe(true);
    expect(confirmRelationPreview).toHaveBeenCalledWith(expect.objectContaining(relationPreview), expect.any(Array));
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('block-1', '((concept-b)) :> new');
    expect(afterSuccessfulWrites).toHaveBeenCalledWith(
      [expect.objectContaining({
        blockId: 'block-1',
        value: '((concept-b)) :> new',
      })],
      expect.objectContaining({ relationPreview }),
    );
    expect(runtime.open.value).toBe(false);
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
