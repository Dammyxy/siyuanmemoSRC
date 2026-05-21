import { describe, expect, it, vi } from 'vitest';
import { BlockMenuHandler } from '../BlockMenuHandler';

function createHandler(entryActionService: Record<string, ReturnType<typeof vi.fn>>) {
  const pushMsg = vi.fn(async () => undefined);
  const pushErrMsg = vi.fn(async () => undefined);
  const handler = new BlockMenuHandler({
    app: {} as never,
    i18n: {
      makeConceptAndAddToQueue: '制作为概念卡并加入队列',
      makeConceptAndStartRoam: '制作为概念卡并立即漫游',
    },
    dialogManager: {} as never,
    openCreateTemplateCardDialog: vi.fn(),
    openNeuralReviewDialog: vi.fn(),
    applicationContext: {
      getNeuralRoamEntryActionService: () => entryActionService,
      getUnifiedDataSourceManager: () => ({ getDayStartHour: () => 4 }),
    } as never,
    cardCreationHelper: {} as never,
    siyuanApi: {
      pushMsg,
      pushErrMsg,
    } as never,
  });
  return { handler, pushMsg, pushErrMsg };
}

describe('BlockMenuHandler NeuralRoam entry actions', () => {
  it('preserves concept action labels and routes them through the shared service', async () => {
    const entryActionService = {
      makeConceptAndAddToQueue: vi.fn(async () => ({ ok: true })),
      makeConceptAndStartRoam: vi.fn(async () => ({ ok: true })),
    };
    const { handler, pushMsg } = createHandler(entryActionService);

    const actions = (handler as unknown as {
      buildConceptActions(blockId: string): Array<{ label?: string; click?: () => Promise<void> }>;
    }).buildConceptActions('block-1');

    expect(actions.map((action) => action.label)).toEqual([
      '制作为概念卡并加入队列',
      '制作为概念卡并立即漫游',
    ]);

    await actions[0].click?.();
    await actions[1].click?.();

    expect(entryActionService.makeConceptAndAddToQueue).toHaveBeenCalledWith('block-1', { priority: 'normal' });
    expect(entryActionService.makeConceptAndStartRoam).toHaveBeenCalledWith('block-1');
    expect(pushMsg).toHaveBeenCalledWith('📍 已加入漫游队列');
    expect(pushMsg).toHaveBeenCalledWith('🚀 已加入漫游队列（高优先级），正在打开神经漫游...');
  });
});
