import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { DialogManager } from '../DialogManager';
import { findConceptByUpwardSearch } from '@/application/usecases/xiuyuan/shared/ConceptLocator';
import { resolveCdfMultilineScan } from '@/application/usecases/xiuyuan/shared/CdfMultilineScanner';
import type { CdfScanResult } from '@/application/usecases/xiuyuan/shared/CdfMultilineScanner';

vi.mock('@/utils/dialog', () => ({
  createVueDialog: vi.fn(),
}));

vi.mock('@/ui/settings', () => ({
  SettingsPanel: {},
}));

vi.mock('@/ui/browser/SRSBrowser.vue', () => ({
  default: {},
}));

vi.mock('@/ui/mobile/MobileReviewLauncher.vue', () => ({
  default: {},
}));

vi.mock('@/ui/xiuyuan', () => ({
  TemplateSelectDialog: {},
}));

vi.mock('@/application/factories/createUnifiedReviewDialog', () => ({
  createUnifiedReviewDialog: vi.fn(),
}));

vi.mock('@/ui/review/v2', () => ({
  ReviewView: {},
}));

vi.mock('@/application/usecases/xiuyuan/shared/ConceptLocator', () => ({
  findConceptByUpwardSearch: vi.fn(),
}));

vi.mock('@/application/usecases/xiuyuan/shared/CdfMultilineScanner', () => ({
  resolveCdfMultilineScan: vi.fn(),
}));

const PARENT_I = '20260101000000-abcdeff';
const PARENT_P = '20260101000001-abcdeff';
const CHILD_P = '20260101000009-abcdeff';
const CONCEPT_DOC = '20260101000002-abcdeff';

function createSiyuanApiMock() {
  const sql = vi.fn().mockImplementation(async (stmt: string) => {
    if (stmt.includes('SELECT id, type, parent_id') && stmt.includes(`WHERE id = '${PARENT_I}'`)) {
      return [{ id: PARENT_I, type: 'i' }];
    }
    if (stmt.includes('SELECT id, type, parent_id') && stmt.includes(`WHERE id = '${CHILD_P}'`)) {
      return [{ id: CHILD_P, type: 'p', parent_id: PARENT_I }];
    }
    if (stmt.includes('SELECT id, type') && stmt.includes(`WHERE id = '${PARENT_I}'`) && !stmt.includes('parent_id')) {
      return [{ id: PARENT_I, type: 'i' }];
    }
    return [];
  });

  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    CARD_ID_ATTR: 'custom-fsrs-card-id',
    pushMsg: vi.fn().mockResolvedValue(undefined),
    pushErrMsg: vi.fn().mockResolvedValue(undefined),
    sql,
    getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    getBlockText: vi.fn().mockResolvedValue(''),
    setBlockAttrs: vi.fn().mockResolvedValue(undefined),
    markBlockAsCard: vi.fn().mockResolvedValue(undefined),
    getCardBlockIds: vi.fn().mockResolvedValue([]),
    addRiffCards: vi.fn().mockResolvedValue({ name: 'builtin-deck', size: 0 }),
  };
}

function createXiuyuanAppServiceMock() {
  return {
    createFromBlocks: vi.fn().mockResolvedValue(ok({ xiuyuan: { id: 'xy_card' }, cards: [{ id: 'card_1' }] })),
    createListTemplateCards: vi.fn().mockResolvedValue(
      ok({
        mode: 'split-v2',
        parentBlockId: 'parent',
        parentParagraphId: 'parent-p',
        totalChildren: 2,
        created: [{ childBlockId: 'child-1', xiuyuanId: 'xy_1', cardIds: ['c1'] }],
        skippedChildBlockIds: [],
      })
    ),
  };
}

function createDialogManager() {
  const siyuanApi = createSiyuanApiMock();
  const xiuyuanAppService = createXiuyuanAppServiceMock();
  const context = {
    getXiuyuanApplicationService: vi.fn().mockResolvedValue(xiuyuanAppService),
    getI18n: vi.fn().mockReturnValue({}),
  } as any;
  const plugin = {} as any;
  const dialogManager = new DialogManager(context, plugin, { siyuanApi });
  return { dialogManager, siyuanApi, xiuyuanAppService };
}

function createScanResult(overrides?: Partial<CdfScanResult>): CdfScanResult {
  return {
    parentBlockId: PARENT_I,
    parentParagraphId: PARENT_P,
    parentParagraphText: `Parent ((${CONCEPT_DOC})) :::`,
    parentParagraphKramdown: `Parent ((${CONCEPT_DOC})) :::`,
    parentKramdown: `Parent ((${CONCEPT_DOC})) :::`,
    nodes: [
      {
        id: '20260101000003-abcdeff',
        subtype: 'u',
        firstParagraphId: '20260101000004-abcdeff',
        firstParagraphText: 'SRS',
        firstParagraphKramdown: 'SRS',
        markerKind: 'none',
        explicitMarkerKind: 'none',
        recursiveMarkerKind: 'none',
        hasDocumentReference: false,
        orderedChildListItemIds: [],
        unorderedChildListItemIds: [],
      },
    ],
    stoppedByDocumentReference: false,
    ...overrides,
  };
}

describe('DialogManager CDF multiline routing', () => {
  const mockedFindConceptByUpwardSearch = vi.mocked(findConceptByUpwardSearch);
  const mockedResolveCdfMultilineScan = vi.mocked(resolveCdfMultilineScan);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows symbol confirmation and cancels creation when user rejects', async () => {
    const { dialogManager, xiuyuanAppService, siyuanApi } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(
      createScanResult({
        parentParagraphText: `Parent ((${CONCEPT_DOC}))`,
        parentParagraphKramdown: `Parent ((${CONCEPT_DOC}))`,
        parentKramdown: `Parent ((${CONCEPT_DOC}))`,
      })
    );
    vi.spyOn(dialogManager as any, 'confirmProceedWhenSymbolMissing').mockResolvedValue(false);

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-concept-multiline');

    expect((dialogManager as any).confirmProceedWhenSymbolMissing).toHaveBeenCalledTimes(1);
    expect(xiuyuanAppService.createFromBlocks).not.toHaveBeenCalled();
    expect(xiuyuanAppService.createListTemplateCards).not.toHaveBeenCalled();
    expect(siyuanApi.pushMsg).toHaveBeenCalledWith('已取消创建');
  });

  it('uses parent paragraph text marker before fallback source', async () => {
    const { dialogManager, xiuyuanAppService } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(
      createScanResult({
        parentParagraphText: `Parent ((${CONCEPT_DOC})) :::`,
        parentParagraphKramdown: '',
        parentKramdown: '',
      })
    );
    vi.spyOn(dialogManager as any, 'confirmProceedWhenSymbolMissing').mockResolvedValue(false);
    vi.spyOn(dialogManager as any, 'resolveConceptDocumentIdFromReference').mockResolvedValue(CONCEPT_DOC);
    vi.spyOn(dialogManager as any, 'ensureConceptCardById').mockResolvedValue(undefined);

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-concept-multiline');

    expect((dialogManager as any).confirmProceedWhenSymbolMissing).not.toHaveBeenCalled();
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(1);
  });

  it('fails for ::: when concept document reference cannot be resolved', async () => {
    const { dialogManager, xiuyuanAppService, siyuanApi } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(createScanResult());
    vi.spyOn(dialogManager as any, 'resolveConceptDocumentIdFromReference').mockResolvedValue(null);

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-concept-multiline');

    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith('::: 模板要求父块中包含文档块引用概念');
    expect(xiuyuanAppService.createFromBlocks).not.toHaveBeenCalled();
  });

  it('fails for ;;; when upward concept search fails', async () => {
    const { dialogManager, xiuyuanAppService, siyuanApi } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(
      createScanResult({
        parentParagraphText: 'Parent ;;;',
        parentParagraphKramdown: 'Parent ;;;',
        parentKramdown: 'Parent ;;;',
      })
    );
    mockedFindConceptByUpwardSearch.mockResolvedValue(null);

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-descriptor-multiline');

    expect(siyuanApi.pushErrMsg).toHaveBeenCalledWith(';;; 模板未找到可用概念块（向上探路失败）');
    expect(xiuyuanAppService.createFromBlocks).not.toHaveBeenCalled();
  });

  it('maps ::: unmarked child to concept-definition template', async () => {
    const { dialogManager, xiuyuanAppService } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(createScanResult());
    vi.spyOn(dialogManager as any, 'resolveConceptDocumentIdFromReference').mockResolvedValue(CONCEPT_DOC);
    vi.spyOn(dialogManager as any, 'ensureConceptCardById').mockResolvedValue(undefined);

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-concept-multiline');

    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'builtin-concept-definition',
        blockIds: ['20260101000004-abcdeff', CONCEPT_DOC],
        fieldMapping: {
          concept: CONCEPT_DOC,
          definition: '20260101000004-abcdeff',
        },
      })
    );
  });

  it('creates descriptor cards for ;;; descendants and injects cdf fusion metadata', async () => {
    const { dialogManager, xiuyuanAppService, siyuanApi } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(
      createScanResult({
        parentParagraphText: 'Parent ;;;',
        parentParagraphKramdown: 'Parent ;;;',
        parentKramdown: 'Parent ;;;',
        nodes: [
          {
            id: '20260101000003-abcdeff',
            subtype: 'u',
            firstParagraphId: '20260101000004-abcdeff',
            firstParagraphText: '起源;;;',
            firstParagraphKramdown: '起源;;;',
            markerKind: 'descriptor-multiline',
            explicitMarkerKind: 'descriptor-multiline',
            recursiveMarkerKind: 'descriptor-multiline',
            hasDocumentReference: false,
            orderedChildListItemIds: [],
            unorderedChildListItemIds: ['20260101000005-abcdeff', '20260101000006-abcdeff'],
          },
        ],
      })
    );
    mockedFindConceptByUpwardSearch.mockResolvedValue({
      conceptId: CONCEPT_DOC,
      conceptType: 'document',
    });
    vi.spyOn(dialogManager as any, 'ensureConceptCardById').mockResolvedValue(undefined);

    vi.mocked(siyuanApi.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes('SELECT id, type, parent_id') && stmt.includes(`WHERE id = '${PARENT_I}'`)) {
        return [{ id: PARENT_I, type: 'i' }];
      }
      if (stmt.includes("parent_id = '20260101000005-abcdeff'")) {
        return [{ id: '20260101000007-abcdeff', content: '作者→woz', markdown: '作者→woz' }];
      }
      if (stmt.includes("parent_id = '20260101000006-abcdeff'")) {
        return [{ id: '20260101000008-abcdeff', content: '学校学习', markdown: '学校学习' }];
      }
      return [];
    });

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-descriptor-multiline');

    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(2);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        templateId: 'builtin-concept-descriptor',
        fieldMapping: expect.objectContaining({
          concept: CONCEPT_DOC,
          descriptor: '20260101000007-abcdeff',
          cdf_group_hint: '起源',
          cdf_child_cue: '作者',
          cdf_child_answer: 'woz',
        }),
      })
    );
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        templateId: 'builtin-concept-descriptor',
        fieldMapping: expect.objectContaining({
          cdf_group_hint: '起源',
          cdf_child_cue: '',
          cdf_child_answer: '学校学习',
        }),
      })
    );
  });

  it('keeps ordered ;;; descendants on semantic descriptor path', async () => {
    const { dialogManager, xiuyuanAppService, siyuanApi } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(
      createScanResult({
        parentParagraphText: 'Parent ;;;',
        parentParagraphKramdown: 'Parent ;;;',
        parentKramdown: 'Parent ;;;',
        nodes: [
          {
            id: '20260101000003-abcdeff',
            subtype: 'u',
            firstParagraphId: '20260101000004-abcdeff',
            firstParagraphText: '起源;;;',
            firstParagraphKramdown: '起源;;;',
            markerKind: 'descriptor-multiline',
            explicitMarkerKind: 'descriptor-multiline',
            recursiveMarkerKind: 'descriptor-multiline',
            hasDocumentReference: false,
            orderedChildListItemIds: ['20260101000005-abcdeff'],
            unorderedChildListItemIds: [],
          },
        ],
      })
    );
    mockedFindConceptByUpwardSearch.mockResolvedValue({
      conceptId: CONCEPT_DOC,
      conceptType: 'document',
    });
    vi.spyOn(dialogManager as any, 'ensureConceptCardById').mockResolvedValue(undefined);

    vi.mocked(siyuanApi.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes('SELECT id, type, parent_id') && stmt.includes(`WHERE id = '${PARENT_I}'`)) {
        return [{ id: PARENT_I, type: 'i' }];
      }
      if (stmt.includes("parent_id = '20260101000005-abcdeff'")) {
        return [{ id: '20260101000007-abcdeff', content: '时间;<1987', markdown: '时间;<1987' }];
      }
      return [];
    });

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-descriptor-multiline');

    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(1);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'builtin-concept-descriptor-reverse',
        fieldMapping: expect.objectContaining({
          cdf_group_hint: '起源',
        }),
      })
    );
    expect(xiuyuanAppService.createListTemplateCards).not.toHaveBeenCalled();
  });

  it('checks both paragraph and list-item binding to avoid duplicate descriptor cards', async () => {
    const { dialogManager, xiuyuanAppService, siyuanApi } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(
      createScanResult({
        parentParagraphText: 'Parent ;;;',
        parentParagraphKramdown: 'Parent ;;;',
        parentKramdown: 'Parent ;;;',
        nodes: [
          {
            id: '20260101000003-abcdeff',
            subtype: 'u',
            firstParagraphId: '20260101000004-abcdeff',
            firstParagraphText: '起源;;;',
            firstParagraphKramdown: '起源;;;',
            markerKind: 'descriptor-multiline',
            explicitMarkerKind: 'descriptor-multiline',
            recursiveMarkerKind: 'descriptor-multiline',
            hasDocumentReference: false,
            orderedChildListItemIds: ['20260101000005-abcdeff', '20260101000006-abcdeff'],
            unorderedChildListItemIds: [],
          },
        ],
      })
    );
    mockedFindConceptByUpwardSearch.mockResolvedValue({
      conceptId: CONCEPT_DOC,
      conceptType: 'document',
    });
    vi.spyOn(dialogManager as any, 'ensureConceptCardById').mockResolvedValue(undefined);

    vi.mocked(siyuanApi.sql).mockImplementation(async (stmt: string) => {
      if (stmt.includes('SELECT id, type, parent_id') && stmt.includes(`WHERE id = '${PARENT_I}'`)) {
        return [{ id: PARENT_I, type: 'i' }];
      }
      if (stmt.includes("parent_id = '20260101000005-abcdeff'")) {
        return [{ id: '20260101000007-abcdeff', content: '作者→woz', markdown: '作者→woz' }];
      }
      if (stmt.includes("parent_id = '20260101000006-abcdeff'")) {
        return [{ id: '20260101000008-abcdeff', content: '背景→学校学习', markdown: '背景→学校学习' }];
      }
      return [];
    });
    vi.spyOn(dialogManager as any, 'hasXiuyuanBindingOnBlock').mockImplementation(async (blockId: string) => {
      return blockId === '20260101000005-abcdeff';
    });

    await dialogManager.createCdfMultilineTemplateCards([PARENT_I], 'builtin-list-descriptor-multiline');

    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(1);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMapping: expect.objectContaining({
          descriptor: '20260101000008-abcdeff',
        }),
      })
    );
  });

  it('normalizes selected paragraph p to parent list item i before scanning', async () => {
    const { dialogManager } = createDialogManager();
    mockedResolveCdfMultilineScan.mockResolvedValue(createScanResult());
    vi.spyOn(dialogManager as any, 'resolveConceptDocumentIdFromReference').mockResolvedValue(CONCEPT_DOC);
    vi.spyOn(dialogManager as any, 'ensureConceptCardById').mockResolvedValue(undefined);

    await dialogManager.createCdfMultilineTemplateCards([CHILD_P], 'builtin-list-concept-multiline');

    expect(mockedResolveCdfMultilineScan).toHaveBeenCalledWith(PARENT_I, expect.anything());
  });
});
