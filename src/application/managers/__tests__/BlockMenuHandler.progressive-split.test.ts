import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockMenuHandler } from '@/application/managers/BlockMenuHandler';

function createHandler() {
  const splitDocument = vi.fn();
  const dialogManager = {
    openProgressiveSplitDialog: vi.fn().mockResolvedValue(undefined),
  };

  const handler = new BlockMenuHandler({
    app: {} as any,
    i18n: {
      progressiveSplitLinear: '渐进 Split（线性）',
      progressiveSplitNonlinear: '渐进 Split（非线性）',
    },
    dialogManager: dialogManager as any,
    openCreateTemplateCardDialog: vi.fn().mockResolvedValue(undefined),
    openNeuralReviewDialog: vi.fn().mockResolvedValue(undefined),
    applicationContext: {
      getProgressiveReadingService: vi.fn().mockReturnValue({ splitDocument }),
    } as any,
    cardCreationHelper: {} as any,
    siyuanApi: {
      pushMsg: vi.fn().mockResolvedValue(undefined),
      pushErrMsg: vi.fn().mockResolvedValue(undefined),
    } as any,
  });

  return {
    handler,
    dialogManager,
    splitDocument,
  };
}

describe('BlockMenuHandler progressive split actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps both doc split actions and routes them through DialogManager', async () => {
    const { handler, dialogManager, splitDocument } = createHandler();

    const actions = (handler as any).buildProgressiveDocActions('doc-1') as Array<{
      label?: string;
      click?: () => Promise<void>;
    }>;

    expect(actions.map((action) => action.label)).toEqual([
      '渐进 Split（线性）',
      '渐进 Split（非线性）',
    ]);

    await actions[0].click?.();
    await actions[1].click?.();

    expect(dialogManager.openProgressiveSplitDialog).toHaveBeenNthCalledWith(1, 'doc-1', 'linear');
    expect(dialogManager.openProgressiveSplitDialog).toHaveBeenNthCalledWith(2, 'doc-1', 'nonlinear');
    expect(splitDocument).not.toHaveBeenCalled();
  });
});
