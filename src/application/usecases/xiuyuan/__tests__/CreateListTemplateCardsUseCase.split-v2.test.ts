import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { EventBus } from '@/core/shared/domain/events/EventBus';
import type { IXiuyuanRepository } from '@/core/xiuyuan/domain/repositories/IXiuyuanRepository';
import type { ICardTemplate } from '@/core/xiuyuan/types';
import type { XiuyuanBlockAttrs, XiuyuanSiyuanPort } from '@/application/ports/XiuyuanSiyuanPort';
import { CreateListTemplateCardsUseCase } from '../CreateListTemplateCardsUseCase';

const PARENT_BLOCK_ID = '20260101000000-parent1';
const PARENT_PARAGRAPH_ID = '20260101000001-paragr1';
const SUMMARY_CONTAINER_ID = '20260101020000-listcon';
const CHILD_BLOCK_IDS = [
  '20260101000003-child02',
  '20260101000002-child01',
  '20260101000004-child03',
];

const CHILD_PARAGRAPH_ROWS = [
  { id: '20260101010003-parag02', parent_id: '20260101000003-child02', content: 'CueB->AnswerB' },
  { id: '20260101010002-parag01', parent_id: '20260101000002-child01', content: 'CueA->AnswerA' },
  { id: '20260101010004-parag03', parent_id: '20260101000004-child03', content: 'CueC->AnswerC' },
];

const CHILD_PARAGRAPH_IDS_BY_LIST_ITEM: Record<string, string> = {
  '20260101000003-child02': '20260101010003-parag02',
  '20260101000002-child01': '20260101010002-parag01',
  '20260101000004-child03': '20260101010004-parag03',
};

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
  childParagraphRows?: Array<{ id: string; parent_id: string; content: string }>;
  listItemParentById?: Record<string, string>;
  summaryContainerId?: string;
  kramdownById?: Record<string, string>;
}) {
  const parentAttrs = options?.parentAttrs ?? {};
  const childAttrsById = options?.childAttrsById ?? {};
  const childParagraphRows = options?.childParagraphRows ?? CHILD_PARAGRAPH_ROWS;
  const listItemParentById = options?.listItemParentById
    ?? Object.fromEntries(CHILD_BLOCK_IDS.map((id) => [id, SUMMARY_CONTAINER_ID]));
  const summaryContainerId = options?.summaryContainerId ?? SUMMARY_CONTAINER_ID;
  const kramdownById = options?.kramdownById ?? {};

  const sqlMock = vi.fn(async (stmt: string): Promise<unknown[]> => {
    if (stmt.includes('WHERE parent_id =') && stmt.includes(`'${PARENT_BLOCK_ID}'`) && stmt.includes('AND type = \'p\'')) {
      return [{ id: PARENT_PARAGRAPH_ID }];
    }
    if (stmt.includes('SELECT id, parent_id, content') && stmt.includes('WHERE parent_id IN') && stmt.includes('AND type = \'p\'')) {
      return childParagraphRows;
    }
    if (stmt.includes('SELECT id, parent_id') && stmt.includes('WHERE id IN') && stmt.includes('AND type = \'i\'')) {
      return Object.entries(listItemParentById).map(([id, parent_id]) => ({ id, parent_id }));
    }
    if (stmt.includes('AND type = \'l\'') && stmt.includes('WHERE parent_id =')) {
      return [{ id: summaryContainerId }];
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
    getBlockKramdown: vi.fn(async (blockId: string) => ({
      kramdown: kramdownById[blockId] || '',
    })),
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
  it('creates one independent Xiuyuan per child with child paragraph as representative block', async () => {
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
    expect(addRiffCardsMock).toHaveBeenNthCalledWith(1, 'deck-1', [CHILD_PARAGRAPH_IDS_BY_LIST_ITEM[CHILD_BLOCK_IDS[0]]]);
    expect(addRiffCardsMock).toHaveBeenNthCalledWith(2, 'deck-1', [CHILD_PARAGRAPH_IDS_BY_LIST_ITEM[CHILD_BLOCK_IDS[1]]]);
    expect(addRiffCardsMock).toHaveBeenNthCalledWith(3, 'deck-1', [CHILD_PARAGRAPH_IDS_BY_LIST_ITEM[CHILD_BLOCK_IDS[2]]]);

    const savedXiuyuans = saveMock.mock.calls.map((call) => call[0]);
    savedXiuyuans.forEach((xiuyuan, index) => {
      const childListItemId = CHILD_BLOCK_IDS[index];
      const childParagraphId = CHILD_PARAGRAPH_IDS_BY_LIST_ITEM[childListItemId];
      const blockIds = xiuyuan.getBlockIDs().map((blockId: { getValue: () => string }) => blockId.getValue());
      expect(blockIds).toEqual([childParagraphId, PARENT_PARAGRAPH_ID]);
      expect(xiuyuan.getFaces()).toHaveLength(1);
      expect(xiuyuan.getFaces()[0].questionBlockId).toBe(PARENT_PARAGRAPH_ID);
      expect(xiuyuan.getFaces()[0].answerBlockId).toBe(childParagraphId);

      const listMeta = xiuyuan.getMeta().listTemplate as {
        mode: string;
        currentIndex: number;
        childrenData: Array<{ id: string }>;
      };
      expect(listMeta.mode).toBe('split-v2');
      expect(listMeta.currentIndex).toBe(index);
      expect(listMeta.childrenData).toHaveLength(3);
      expect(listMeta.childrenData[index].id).toBe(childParagraphId);
    });
  });

  it('publishes CardCreated after each child Xiuyuan is saved', async () => {
    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi } = createSiyuanApiMock();
    const eventBus = new EventBus(false);
    const order: string[] = [];
    const createdCardIds: string[] = [];

    saveMock.mockImplementation(async (xiuyuan) => {
      order.push(`save:${xiuyuan.getId().getValue()}`);
      return ok(undefined);
    });

    eventBus.subscribe('CardCreated', (event) => {
      order.push(`event:${event.cardId}`);
      createdCardIds.push(event.cardId);
    });

    const useCase = new CreateListTemplateCardsUseCase(
      repo,
      new Map([[LIST_TEMPLATE.id, LIST_TEMPLATE]]),
      { siyuanApi, eventBus }
    );

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      childBlockIds: CHILD_BLOCK_IDS,
      templateId: 'builtin-list-item',
      deckId: 'deck-1',
      priority: 50,
    });

    expect(result.ok).toBe(true);
    expect(createdCardIds).toHaveLength(CHILD_BLOCK_IDS.length);
    expect(order).toHaveLength(CHILD_BLOCK_IDS.length * 2);
    for (let index = 0; index < order.length; index += 2) {
      expect(order[index]?.startsWith('save:')).toBe(true);
      expect(order[index + 1]?.startsWith('event:')).toBe(true);
    }
  });

  it('skips children that already have list-item xiuyuan binding and creates missing ones', async () => {
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
    expect(addRiffCardsMock).toHaveBeenCalledWith('deck-1', [CHILD_PARAGRAPH_IDS_BY_LIST_ITEM[CHILD_BLOCK_IDS[0]]]);
    expect(addRiffCardsMock).toHaveBeenCalledWith('deck-1', [CHILD_PARAGRAPH_IDS_BY_LIST_ITEM[CHILD_BLOCK_IDS[2]]]);
  });

  it('writes descriptor cardType into xiuyuan meta when cardType=descriptor', async () => {
    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi } = createSiyuanApiMock();
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
      cardType: 'descriptor',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.mode).toBe('split-v2');
    expect(saveMock).toHaveBeenCalledTimes(3);
    const savedXiuyuans = saveMock.mock.calls.map((call) => call[0]);
    savedXiuyuans.forEach((xiuyuan) => {
      const meta = xiuyuan.getMeta() as { cardType?: string };
      expect(meta.cardType).toBe('descriptor');
    });
  });

  it('writes direct-path metadata for descriptor-multiline split cards', async () => {
    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi } = createSiyuanApiMock({
      kramdownById: {
        'concept-paragraph-1': '[[基于识别的决策模型（RPD）]]',
        [PARENT_PARAGRAPH_ID]: '特征;;;',
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
      creationMode: 'split-v2',
      listKind: 'descriptor-multiline',
      conceptBlockId: 'concept-paragraph-1',
      cardType: 'descriptor',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const savedXiuyuan = saveMock.mock.calls[0]?.[0];
    const listMeta = savedXiuyuan.getMeta().listTemplate as {
      childrenData?: Array<{
        source?: string;
        directPath?: Array<{ kind?: string; label?: string }>;
      }>;
    };

    expect(listMeta.childrenData?.[0]?.source).toBe('CueB->AnswerB');
    expect(listMeta.childrenData?.[0]?.directPath).toEqual([
      { kind: 'concept', label: '[[基于识别的决策模型（RPD）]]', blockId: 'concept-paragraph-1' },
      { kind: 'group', label: '特征', blockId: PARENT_PARAGRAPH_ID },
    ]);
  });

  it('creates one summary card in summary-v1 mode with unordered container as answer block', async () => {
    const summaryChildIds = [
      '20260102000001-child01',
      '20260102000002-child02',
      '20260102000003-child03',
    ];
    const summaryRows = [
      { id: '20260102010001-parag01', parent_id: summaryChildIds[0], content: 'Cue1->Answer1' },
      { id: '20260102010002-parag02', parent_id: summaryChildIds[1], content: 'Cue2->Answer2' },
      { id: '20260102010003-parag03', parent_id: summaryChildIds[2], content: 'Answer3' },
    ];
    const summaryContainerId = '20260102020000-listcon';

    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi, addRiffCardsMock } = createSiyuanApiMock({
      childParagraphRows: summaryRows,
      listItemParentById: {
        [summaryChildIds[0]]: summaryContainerId,
        [summaryChildIds[1]]: summaryContainerId,
        [summaryChildIds[2]]: summaryContainerId,
      },
      summaryContainerId,
    });
    const useCase = new CreateListTemplateCardsUseCase(
      repo,
      new Map([[LIST_TEMPLATE.id, LIST_TEMPLATE]]),
      { siyuanApi }
    );

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      childBlockIds: summaryChildIds,
      templateId: 'builtin-list-item',
      creationMode: 'summary-v1',
      cardType: 'descriptor',
      deckId: 'deck-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.mode).toBe('summary-v1');
    expect(result.value.created).toHaveLength(1);
    expect(result.value.created[0].childBlockId).toBe(summaryChildIds[0]);
    expect(result.value.skippedChildBlockIds).toEqual([]);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(addRiffCardsMock).toHaveBeenCalledTimes(1);
    expect(addRiffCardsMock).toHaveBeenCalledWith('deck-1', [summaryContainerId]);

    const savedXiuyuan = saveMock.mock.calls[0][0];
    const faces = savedXiuyuan.getFaces();
    expect(faces).toHaveLength(1);
    expect(faces[0].questionBlockId).toBe(PARENT_PARAGRAPH_ID);
    expect(faces[0].answerBlockId).toBe(summaryContainerId);
    expect(faces[0].answer).toBe(['Answer1', 'Answer2', 'Answer3'].join('\n'));

    const meta = savedXiuyuan.getMeta() as {
      cardType?: string;
      listTemplate?: {
        mode?: string;
        childrenData?: Array<{ id?: string; cue?: string; answer?: string }>;
      };
    };
    expect(meta.cardType).toBe('descriptor');
    expect(meta.listTemplate?.mode).toBe('summary-v1');
    expect(meta.listTemplate?.childrenData?.[0]?.id).toBe(summaryContainerId);
    expect(meta.listTemplate?.childrenData?.[0]?.cue).toBe(['Cue1', 'Cue2'].join('，'));
    expect(meta.listTemplate?.childrenData?.[0]?.answer).toBe(['Answer1', 'Answer2', 'Answer3'].join('\n'));
  });

  it('skips summary-v1 creation when all legacy list-item bindings already exist', async () => {
    const summaryChildIds = [
      '20260103000001-child01',
      '20260103000002-child02',
    ];
    const summaryRows = [
      { id: '20260103010001-parag01', parent_id: summaryChildIds[0], content: 'Cue1->Answer1' },
      { id: '20260103010002-parag02', parent_id: summaryChildIds[1], content: 'Cue2->Answer2' },
    ];

    const { repo, saveMock } = createRepositoryMock();
    const { siyuanApi, addRiffCardsMock } = createSiyuanApiMock({
      childParagraphRows: summaryRows,
      childAttrsById: {
        [summaryChildIds[0]]: { 'custom-xiuyuan-id': 'xy_legacy_item' },
        [summaryChildIds[1]]: { 'custom-xiuyuan-id': 'xy_legacy_item_2' },
      },
      listItemParentById: {
        [summaryChildIds[0]]: '20260103020000-listcon',
        [summaryChildIds[1]]: '20260103020000-listcon',
      },
      summaryContainerId: '20260103020000-listcon',
    });
    const useCase = new CreateListTemplateCardsUseCase(
      repo,
      new Map([[LIST_TEMPLATE.id, LIST_TEMPLATE]]),
      { siyuanApi }
    );

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      childBlockIds: summaryChildIds,
      templateId: 'builtin-list-item',
      creationMode: 'summary-v1',
      deckId: 'deck-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.created).toHaveLength(0);
    expect(saveMock).not.toHaveBeenCalled();
    expect(addRiffCardsMock).not.toHaveBeenCalled();
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
