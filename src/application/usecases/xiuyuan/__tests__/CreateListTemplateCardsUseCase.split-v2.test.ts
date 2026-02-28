import { describe, it, expect, vi } from 'vitest';
import { ok } from '@/types/result';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import type { XiuyuanBlockAttrs, XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { CreateListTemplateCardsUseCase } from '../CreateListTemplateCardsUseCase';

const PARENT_BLOCK_ID = '20260101000000-parent1';
const PARENT_PARAGRAPH_ID = '20260101000001-paragr1';
const CHILD_BLOCK_IDS = [
  '20260101000003-child02',
  '20260101000002-child01',
  '20260101000004-child03',
];

const CHILD_ROWS = [
  { id: '20260101000002-child01', content: '提示A→答案A' },
  { id: '20260101000004-child03', content: '提示C->答案C' },
  { id: '20260101000003-child02', content: '提示B→答案B' },
];

const LIST_TEMPLATE: ICardTemplate = {
  id: 'builtin-list-item',
  name: 'List Item',
  category: 'list',
  fields: [
    { name: 'question' },
    { name: 'answer' },
  ],
  cardRules: [
    {
      typeMarker: 'default',
      frontFields: ['question'],
      backFields: ['answer'],
    },
  ],
};

function createRepositoryMock() {
  const saveMock = vi.fn().mockResolvedValue(ok(undefined));
  const repo = {
    save: saveMock,
    findById: vi.fn(),
    findByBlockId: vi.fn(),
    findAll: vi.fn().mockResolvedValue(ok([])),
    delete: vi.fn(),
    saveMany: vi.fn(),
    deleteMany: vi.fn(),
    getXiuyuanIdByCardId: vi.fn(),
  } as unknown as IXiuyuanRepository;
  return { repo, saveMock };
}

function createSiyuanApiMock(options?: {
  parentAttrs?: XiuyuanBlockAttrs;
  childAttrsById?: Record<string, XiuyuanBlockAttrs>;
}) {
  const parentAttrs = options?.parentAttrs ?? {};
  const childAttrsById = options?.childAttrsById ?? {};

  const sqlMock = vi.fn(async (stmt: string): Promise<unknown[]> => {
    if (stmt.includes('AND type = \'p\'')) {
      return [{ id: PARENT_PARAGRAPH_ID }];
    }
    if (stmt.includes('SELECT id, content FROM blocks')) {
      return CHILD_ROWS;
    }
    return [];
  });

  const getBlockAttrsMock = vi.fn(async (blockId: string) => {
    if (blockId === PARENT_BLOCK_ID) {
      return parentAttrs;
    }
    return childAttrsById[blockId] ?? {};
  });

  const addRiffCardsMock = vi.fn().mockResolvedValue({ name: 'deck', size: 1 });

  const siyuanApi: XiuyuanSiyuanPort = {
    BUILTIN_DECK_ID: 'builtin-deck',
    sql: sqlMock,
    getBlockAttrs: getBlockAttrsMock,
    getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    getBlockText: vi.fn().mockResolvedValue(''),
    addRiffCards: addRiffCardsMock,
  };

  return {
    siyuanApi,
    sqlMock,
    getBlockAttrsMock,
    addRiffCardsMock,
  };
}

describe('CreateListTemplateCardsUseCase (split-v2)', () => {
  it('creates one independent Xiuyuan per child with child as representative block', async () => {
    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi, addRiffCardsMock } = createSiyuanApiMock();
    const useCase = new CreateListTemplateCardsUseCase(
      repo,
      new Map([[LIST_TEMPLATE.id, LIST_TEMPLATE]]),
      { siyuanApi }
    );

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      childBlockIds: CHILD_BLOCK_IDS,
      templateId: 'builtin-list-item',
      deckId: 'deck-1',
      priority: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.mode).toBe('split-v2');
    expect(result.value.parentBlockId).toBe(PARENT_BLOCK_ID);
    expect(result.value.parentParagraphId).toBe(PARENT_PARAGRAPH_ID);
    expect(result.value.totalChildren).toBe(3);
    expect(result.value.created.map((item) => item.childBlockId)).toEqual(CHILD_BLOCK_IDS);
    expect(result.value.created.every((item) => item.cardIds.length === 1)).toBe(true);
    expect(result.value.skippedChildBlockIds).toEqual([]);

    expect(saveMock).toHaveBeenCalledTimes(3);
    expect(addRiffCardsMock).toHaveBeenCalledTimes(3);
    expect(addRiffCardsMock).toHaveBeenNthCalledWith(1, 'deck-1', [CHILD_BLOCK_IDS[0]]);
    expect(addRiffCardsMock).toHaveBeenNthCalledWith(2, 'deck-1', [CHILD_BLOCK_IDS[1]]);
    expect(addRiffCardsMock).toHaveBeenNthCalledWith(3, 'deck-1', [CHILD_BLOCK_IDS[2]]);

    const savedXiuyuans = saveMock.mock.calls.map((call) => call[0]);
    savedXiuyuans.forEach((xiuyuan, index) => {
      const blockIds = xiuyuan.getBlockIDs().map((blockId: { getValue: () => string }) => blockId.getValue());
      expect(blockIds).toEqual([CHILD_BLOCK_IDS[index], PARENT_PARAGRAPH_ID]);
      expect(xiuyuan.getFaces()).toHaveLength(1);
      expect(xiuyuan.getFaces()[0].questionBlockId).toBe(PARENT_PARAGRAPH_ID);
      expect(xiuyuan.getFaces()[0].answerBlockId).toBe(CHILD_BLOCK_IDS[index]);

      const listMeta = (xiuyuan.getMeta().listTemplate as {
        mode: string;
        currentIndex: number;
        childrenData: Array<unknown>;
      });
      expect(listMeta.mode).toBe('split-v2');
      expect(listMeta.currentIndex).toBe(index);
      expect(listMeta.childrenData).toHaveLength(3);
    });
  });

  it('skips children that already have xiuyuan binding and creates missing ones', async () => {
    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi, addRiffCardsMock } = createSiyuanApiMock({
      childAttrsById: {
        [CHILD_BLOCK_IDS[1]]: { 'custom-xiuyuan-id': 'xy_existing' },
      },
    });
    const useCase = new CreateListTemplateCardsUseCase(
      repo,
      new Map([[LIST_TEMPLATE.id, LIST_TEMPLATE]]),
      { siyuanApi }
    );

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      childBlockIds: CHILD_BLOCK_IDS,
      templateId: 'builtin-list-item',
      deckId: 'deck-1',
      priority: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.created.map((item) => item.childBlockId)).toEqual([
      CHILD_BLOCK_IDS[0],
      CHILD_BLOCK_IDS[2],
    ]);
    expect(result.value.skippedChildBlockIds).toEqual([CHILD_BLOCK_IDS[1]]);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(addRiffCardsMock).toHaveBeenCalledTimes(2);
  });

  it('aborts when parent block already has legacy xiuyuan binding', async () => {
    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi, getBlockAttrsMock } = createSiyuanApiMock({
      parentAttrs: { 'custom-xiuyuan-id': 'xy_legacy_parent' },
    });
    const useCase = new CreateListTemplateCardsUseCase(
      repo,
      new Map([[LIST_TEMPLATE.id, LIST_TEMPLATE]]),
      { siyuanApi }
    );

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      childBlockIds: CHILD_BLOCK_IDS,
      templateId: 'builtin-list-item',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('Legacy list-template card already exists on parent block');
    expect(saveMock).not.toHaveBeenCalled();
    expect(getBlockAttrsMock).toHaveBeenCalledTimes(1);
  });

  it('returns error when template is missing', async () => {
    const { repo } = createRepositoryMock();
    const { siyuanApi } = createSiyuanApiMock();
    const useCase = new CreateListTemplateCardsUseCase(repo, new Map(), { siyuanApi });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      childBlockIds: CHILD_BLOCK_IDS,
      templateId: 'not-found',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toBe('Template not found: not-found');
  });
});
