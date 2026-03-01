import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { resolveListChildrenBySubtype } from '@/application/usecases/xiuyuan/shared/ListChildrenResolver';
import { BlockMenuHandler } from '../BlockMenuHandler';

vi.mock('@/application/usecases/xiuyuan/shared/ListChildrenResolver', () => ({
  resolveListChildrenBySubtype: vi.fn(),
}));

type ListCreateCommand = {
  parentBlockId: string;
  childBlockIds: string[];
  templateId: string;
  creationMode?: 'split-v2' | 'summary-v1';
  listKind?: 'default' | 'concept-multiline' | 'descriptor-multiline';
};

function buildCreateResult(command: ListCreateCommand) {
  const mode = command.creationMode ?? 'split-v2';
  const created =
    mode === 'summary-v1'
      ? [
          {
            childBlockId: command.childBlockIds[0],
            xiuyuanId: 'xy_summary',
            cardIds: ['card_summary'],
          },
        ]
      : command.childBlockIds.map((childBlockId, index) => ({
          childBlockId,
          xiuyuanId: `xy_${index}`,
          cardIds: [`card_${index}`],
        }));

  return ok({
    mode,
    parentBlockId: command.parentBlockId,
    parentParagraphId: '20260101000000-parent-p',
    totalChildren: command.childBlockIds.length,
    created,
    skippedChildBlockIds: [],
  });
}

function createFixture() {
  const createListTemplateCards = vi.fn(async (command: ListCreateCommand) => buildCreateResult(command));
  const xiuyuanAppService = { createListTemplateCards };

  const siyuanApi = {
    BUILTIN_DECK_ID: 'builtin-deck',
    sql: vi.fn().mockResolvedValue([{ type: 'i', content: 'Parent content' }]),
    pushMsg: vi.fn().mockResolvedValue(undefined),
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
  } as any;

  const handler = new BlockMenuHandler({
    app: {} as any,
    i18n: {},
    dialogManager: {} as any,
    openCreateTemplateCardDialog: vi.fn(),
    openNeuralReviewDialog: vi.fn(),
    applicationContext: {
      getXiuyuanApplicationService: vi.fn().mockResolvedValue(xiuyuanAppService),
    } as any,
    cardCreationHelper: {} as any,
    siyuanApi,
  });

  return {
    handler,
    siyuanApi,
    createListTemplateCards,
  };
}

describe('BlockMenuHandler createListTemplateCards (default list flow)', () => {
  const mockedResolveListChildren = vi.mocked(resolveListChildrenBySubtype);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates summary-v1 only when unordered children are 2+', async () => {
    const { handler, createListTemplateCards, siyuanApi } = createFixture();
    mockedResolveListChildren.mockResolvedValue({
      parentParagraphId: '20260101000000-parent-p',
      parentKramdown: 'Parent',
      orderedChildren: [{ id: 'o1', content: 'O1', subtype: 'o' }],
      unorderedChildren: [
        { id: 'u1', content: 'U1', subtype: 'u' },
        { id: 'u2', content: 'U2', subtype: 'u' },
      ],
      source: 'direct',
    });

    await (handler as any).createListTemplateCards(['20260101000000-parent']);

    expect(createListTemplateCards).toHaveBeenCalledTimes(1);
    expect(createListTemplateCards).toHaveBeenCalledWith(
      expect.objectContaining({
        creationMode: 'summary-v1',
        templateId: 'builtin-list-item',
        listKind: 'default',
        childBlockIds: ['u1', 'u2'],
      })
    );
    expect(siyuanApi.pushErrMsg).not.toHaveBeenCalled();
  });

  it('creates split-v2 only when ordered children are 2+', async () => {
    const { handler, createListTemplateCards, siyuanApi } = createFixture();
    mockedResolveListChildren.mockResolvedValue({
      parentParagraphId: '20260101000000-parent-p',
      parentKramdown: 'Parent',
      orderedChildren: [
        { id: 'o1', content: 'O1', subtype: 'o' },
        { id: 'o2', content: 'O2', subtype: 'o' },
      ],
      unorderedChildren: [{ id: 'u1', content: 'U1', subtype: 'u' }],
      source: 'direct',
    });

    await (handler as any).createListTemplateCards(['20260101000000-parent']);

    expect(createListTemplateCards).toHaveBeenCalledTimes(1);
    expect(createListTemplateCards).toHaveBeenCalledWith(
      expect.objectContaining({
        creationMode: 'split-v2',
        templateId: 'builtin-list-item',
        listKind: 'default',
        childBlockIds: ['o1', 'o2'],
      })
    );
    expect(siyuanApi.pushErrMsg).not.toHaveBeenCalled();
  });

  it('creates split-v2 and summary-v1 together for mixed children', async () => {
    const { handler, createListTemplateCards } = createFixture();
    mockedResolveListChildren.mockResolvedValue({
      parentParagraphId: '20260101000000-parent-p',
      parentKramdown: 'Parent',
      orderedChildren: [
        { id: 'o1', content: 'O1', subtype: 'o' },
        { id: 'o2', content: 'O2', subtype: 'o' },
      ],
      unorderedChildren: [
        { id: 'u1', content: 'U1', subtype: 'u' },
        { id: 'u2', content: 'U2', subtype: 'u' },
      ],
      source: 'direct',
    });

    await (handler as any).createListTemplateCards(['20260101000000-parent']);

    expect(createListTemplateCards).toHaveBeenCalledTimes(2);
    expect(createListTemplateCards).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        creationMode: 'split-v2',
        childBlockIds: ['o1', 'o2'],
      })
    );
    expect(createListTemplateCards).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        creationMode: 'summary-v1',
        childBlockIds: ['u1', 'u2'],
      })
    );
  });

  it('returns error and does not create cards when both subtypes are below threshold', async () => {
    const { handler, createListTemplateCards, siyuanApi } = createFixture();
    mockedResolveListChildren.mockResolvedValue({
      parentParagraphId: '20260101000000-parent-p',
      parentKramdown: 'Parent',
      orderedChildren: [{ id: 'o1', content: 'O1', subtype: 'o' }],
      unorderedChildren: [{ id: 'u1', content: 'U1', subtype: 'u' }],
      source: 'direct',
    });

    await (handler as any).createListTemplateCards(['20260101000000-parent']);

    expect(createListTemplateCards).not.toHaveBeenCalled();
    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith('至少需要2个同类型子列表项（有序或无序）');
  });

  it('reports segmented counts in success message', async () => {
    const { handler, createListTemplateCards, siyuanApi } = createFixture();
    mockedResolveListChildren.mockResolvedValue({
      parentParagraphId: '20260101000000-parent-p',
      parentKramdown: 'Parent',
      orderedChildren: [
        { id: 'o1', content: 'O1', subtype: 'o' },
        { id: 'o2', content: 'O2', subtype: 'o' },
      ],
      unorderedChildren: [
        { id: 'u1', content: 'U1', subtype: 'u' },
        { id: 'u2', content: 'U2', subtype: 'u' },
      ],
      source: 'direct',
    });

    createListTemplateCards
      .mockResolvedValueOnce(
        ok({
          mode: 'split-v2',
          parentBlockId: '20260101000000-parent',
          parentParagraphId: '20260101000000-parent-p',
          totalChildren: 2,
          created: [{ childBlockId: 'o1', xiuyuanId: 'xy_o1', cardIds: ['c1'] }],
          skippedChildBlockIds: ['o2'],
        })
      )
      .mockResolvedValueOnce(
        ok({
          mode: 'summary-v1',
          parentBlockId: '20260101000000-parent',
          parentParagraphId: '20260101000000-parent-p',
          totalChildren: 2,
          created: [{ childBlockId: 'u1', xiuyuanId: 'xy_u1', cardIds: ['c2'] }],
          skippedChildBlockIds: ['u2'],
        })
      );

    await (handler as any).createListTemplateCards(['20260101000000-parent']);

    expect(siyuanApi.pushMsg).toHaveBeenCalledWith(
      '✅ 列表卡创建完成：有序创建：1 / 无序汇总：1 / 跳过：2'
    );
  });
});
