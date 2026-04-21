import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { CreateCdfMultilineCardsUseCase } from '../CreateCdfMultilineCardsUseCase';
import { resolveCdfMultilineScan, type CdfScanResult } from '../shared/CdfMultilineScanner';
import { findConceptByUpwardSearch } from '../shared/ConceptLocator';

vi.mock('../shared/CdfMultilineScanner', () => ({
  resolveCdfMultilineScan: vi.fn(),
}));

vi.mock('../shared/ConceptLocator', () => ({
  findConceptByUpwardSearch: vi.fn(),
}));

const PARENT_BLOCK_ID = '20260101000000-parent';
const CONCEPT_BLOCK_ID = '20260101000000-concept';
const GROUP_ITEM_ID = '20260101000000-group-item';
const CHILD_ITEM_ID = '20260101000000-child-item';
const CHILD_PARAGRAPH_ID = '20260101000000-child-p';

function createDescriptorMultilineScanResult(overrides?: Partial<CdfScanResult>): CdfScanResult {
  return {
    parentBlockId: PARENT_BLOCK_ID,
    parentParagraphId: '20260101000000-parent-p',
    parentParagraphText: 'Parent',
    parentParagraphKramdown: 'Parent',
    parentKramdown: 'Parent',
    nodes: [
      {
        id: GROUP_ITEM_ID,
        subtype: 'u',
        firstParagraphId: '20260101000000-group-p',
        firstParagraphText: 'Essence;;;',
        firstParagraphKramdown: 'Essence;;;',
        markerKind: 'descriptor-multiline',
        explicitMarkerKind: 'descriptor-multiline',
        recursiveMarkerKind: 'descriptor-multiline',
        hasDocumentReference: false,
        orderedChildListItemIds: [],
        unorderedChildListItemIds: [CHILD_ITEM_ID],
      },
    ],
    stoppedByDocumentReference: false,
    ...overrides,
  };
}

function createParentDescriptorGroupScanResult(): CdfScanResult {
  return {
    parentBlockId: PARENT_BLOCK_ID,
    parentParagraphId: '20260101000000-parent-p',
    parentParagraphText: 'Essence;;;',
    // Intentionally no useful kramdown text to validate fallback-to-text extraction.
    parentParagraphKramdown: '{: id="kramdown-only-attrs"}',
    parentKramdown: '{: id="kramdown-only-attrs"}',
    nodes: [
      {
        id: '20260101000000-child-li-1',
        subtype: 'u',
        firstParagraphId: '20260101000000-child-p-1',
        firstParagraphText: 'focus',
        firstParagraphKramdown: 'focus',
        markerKind: 'none',
        explicitMarkerKind: 'none',
        recursiveMarkerKind: 'none',
        hasDocumentReference: false,
        orderedChildListItemIds: [],
        unorderedChildListItemIds: [],
      },
      {
        id: '20260101000000-child-li-2',
        subtype: 'u',
        firstParagraphId: '20260101000000-child-p-2',
        firstParagraphText: 'requirement -> same bulb',
        firstParagraphKramdown: 'requirement -> same bulb',
        markerKind: 'none',
        explicitMarkerKind: 'none',
        recursiveMarkerKind: 'none',
        hasDocumentReference: false,
        orderedChildListItemIds: [],
        unorderedChildListItemIds: [],
      },
    ],
    stoppedByDocumentReference: false,
  };
}

function createParentDescriptorGroupScanResultMarkerOnlyInParentBlock(): CdfScanResult {
  return {
    parentBlockId: PARENT_BLOCK_ID,
    parentParagraphId: '20260101000000-parent-p',
    parentParagraphText: 'Essence',
    parentParagraphKramdown: 'Essence',
    // Parent block kramdown keeps the multiline marker in some Siyuan structures.
    parentKramdown: '* Essence;;;\n  * focus\n  * requirement -> same bulb',
    nodes: [
      {
        id: '20260101000000-child-li-1',
        subtype: 'u',
        firstParagraphId: '20260101000000-child-p-1',
        firstParagraphText: 'focus',
        firstParagraphKramdown: 'focus',
        markerKind: 'none',
        explicitMarkerKind: 'none',
        recursiveMarkerKind: 'none',
        hasDocumentReference: false,
        orderedChildListItemIds: [],
        unorderedChildListItemIds: [],
      },
      {
        id: '20260101000000-child-li-2',
        subtype: 'u',
        firstParagraphId: '20260101000000-child-p-2',
        firstParagraphText: 'requirement -> same bulb',
        firstParagraphKramdown: 'requirement -> same bulb',
        markerKind: 'none',
        explicitMarkerKind: 'none',
        recursiveMarkerKind: 'none',
        hasDocumentReference: false,
        orderedChildListItemIds: [],
        unorderedChildListItemIds: [],
      },
    ],
    stoppedByDocumentReference: false,
  };
}

function createConceptDefinitionOnlyScanResult(): CdfScanResult {
  return {
    parentBlockId: PARENT_BLOCK_ID,
    parentParagraphId: '20260101000000-parent-p',
    parentParagraphText: '((20260101000000-concept))::定义文本',
    parentParagraphKramdown: '((20260101000000-concept))::定义文本',
    parentKramdown: '* ((20260101000000-concept))::定义文本',
    nodes: [],
    stoppedByDocumentReference: false,
  };
}

function createXiuyuanAppServiceMock() {
  return {
    createFromBlocks: vi.fn().mockResolvedValue(
      ok({
        xiuyuan: { id: 'xy_1' },
        cards: [{ id: 'card_1' }],
      })
    ),
  };
}

function createSqlMockForNestedSingle(paragraphContent: string) {
  return vi.fn().mockImplementation(async (stmt: string) => {
    if (stmt.includes(`parent_id = '${CHILD_ITEM_ID}'`) && stmt.includes("AND type = 'p'")) {
      return [{ id: CHILD_PARAGRAPH_ID }];
    }
    if (stmt.includes(`WHERE id = '${CHILD_PARAGRAPH_ID}'`) && stmt.includes('SELECT markdown, content')) {
      return [{ content: paragraphContent, markdown: paragraphContent }];
    }
    return [];
  });
}

describe('CreateCdfMultilineCardsUseCase', () => {
  const mockedResolveCdfMultilineScan = vi.mocked(resolveCdfMultilineScan);
  const mockedFindConceptByUpwardSearch = vi.mocked(findConceptByUpwardSearch);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindConceptByUpwardSearch.mockResolvedValue({
      conceptId: CONCEPT_BLOCK_ID,
      conceptType: 'document',
    });
  });

  it('creates a root definition card even when the CDF tree has no child descriptors', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(createConceptDefinitionOnlyScanResult());

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql: vi.fn().mockImplementation(async (stmt: string) => {
        if (stmt.includes(`WHERE id = '${CONCEPT_BLOCK_ID}'`) && stmt.includes('SELECT type')) {
          return [{ type: 'd' }];
        }
        return [];
      }),
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === CONCEPT_BLOCK_ID) {
          return { 'custom-xiuyuan-id': 'xy_concept' };
        }
        return {};
      }),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-concept-multiline',
    });

    expect(result.ok).toBe(true);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(1);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: ['20260101000000-parent-p', CONCEPT_BLOCK_ID],
      templateId: 'builtin-concept-definition',
      fieldMapping: {
        concept: CONCEPT_BLOCK_ID,
        definition: '20260101000000-parent-p',
      },
    }));
    if (result.ok) {
      expect(result.value.createdDefinition).toBe(1);
      expect(result.value.createdDescriptor).toBe(0);
    }
  });

  it('injects CDF fusion metadata for ;;; descriptor-multiline children', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(createDescriptorMultilineScanResult());

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const sql = createSqlMockForNestedSingle('hint->answer');

    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql,
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === CONCEPT_BLOCK_ID) {
          return { 'custom-xiuyuan-id': 'xy_concept' };
        }
        return {};
      }),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-descriptor-multiline',
    });

    expect(result.ok).toBe(true);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(1);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMapping: expect.objectContaining({
          concept: CONCEPT_BLOCK_ID,
          descriptor: CHILD_PARAGRAPH_ID,
          cdf_group_hint: 'Essence',
          cdf_child_cue: 'hint',
          cdf_child_answer: 'answer',
        }),
      })
    );
  });

  it('stores empty cue and full sentence answer when child has no arrow separator', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(createDescriptorMultilineScanResult());

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const sql = createSqlMockForNestedSingle('focus');

    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql,
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === CONCEPT_BLOCK_ID) {
          return { 'custom-xiuyuan-id': 'xy_concept' };
        }
        return {};
      }),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-descriptor-multiline',
    });

    expect(result.ok).toBe(true);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMapping: expect.objectContaining({
          cdf_group_hint: 'Essence',
          cdf_child_cue: '',
          cdf_child_answer: 'focus',
        }),
      })
    );
  });

  it('supports selecting the ;;; group itself as parent block', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(createParentDescriptorGroupScanResult());

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const sql = vi.fn().mockImplementation(async (stmt: string) => {
      if (stmt.includes(`WHERE id = '20260101000000-child-p-1'`) && stmt.includes('SELECT markdown, content')) {
        return [{ content: 'focus', markdown: 'focus' }];
      }
      if (stmt.includes(`WHERE id = '20260101000000-child-p-2'`) && stmt.includes('SELECT markdown, content')) {
        return [{ content: 'requirement -> same bulb', markdown: 'requirement -> same bulb' }];
      }
      return [];
    });

    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql,
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === CONCEPT_BLOCK_ID) {
          return { 'custom-xiuyuan-id': 'xy_concept' };
        }
        return {};
      }),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-descriptor-multiline',
    });

    expect(result.ok).toBe(true);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(2);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fieldMapping: expect.objectContaining({
          concept: CONCEPT_BLOCK_ID,
          descriptor: '20260101000000-child-p-1',
          cdf_group_hint: 'Essence',
          cdf_child_cue: '',
          cdf_child_answer: 'focus',
        }),
      })
    );
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fieldMapping: expect.objectContaining({
          concept: CONCEPT_BLOCK_ID,
          descriptor: '20260101000000-child-p-2',
          cdf_group_hint: 'Essence',
          cdf_child_cue: 'requirement',
          cdf_child_answer: 'same bulb',
        }),
      })
    );
    if (result.ok) {
      expect(result.value.createdDescriptor).toBe(2);
    }
  });

  it('uses parent block kramdown marker when parent paragraph has no ;;; marker', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(createParentDescriptorGroupScanResultMarkerOnlyInParentBlock());

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const sql = vi.fn().mockImplementation(async (stmt: string) => {
      if (stmt.includes(`WHERE id = '20260101000000-child-p-1'`) && stmt.includes('SELECT markdown, content')) {
        return [{ content: 'focus', markdown: 'focus' }];
      }
      if (stmt.includes(`WHERE id = '20260101000000-child-p-2'`) && stmt.includes('SELECT markdown, content')) {
        return [{ content: 'requirement -> same bulb', markdown: 'requirement -> same bulb' }];
      }
      return [];
    });

    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql,
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === CONCEPT_BLOCK_ID) {
          return { 'custom-xiuyuan-id': 'xy_concept' };
        }
        return {};
      }),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-descriptor-multiline',
    });

    expect(result.ok).toBe(true);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(2);
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fieldMapping: expect.objectContaining({
          cdf_group_hint: 'Essence',
          cdf_child_cue: '',
          cdf_child_answer: 'focus',
        }),
      })
    );
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fieldMapping: expect.objectContaining({
          cdf_group_hint: 'Essence',
          cdf_child_cue: 'requirement',
          cdf_child_answer: 'same bulb',
        }),
      })
    );
  });

  it('falls back to SQL attributes lookup when getBlockAttrs is unavailable', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(
      createDescriptorMultilineScanResult({
        nodes: [
          {
            id: CHILD_ITEM_ID,
            subtype: 'u',
            firstParagraphId: CHILD_PARAGRAPH_ID,
            firstParagraphText: 'plain child',
            firstParagraphKramdown: 'plain child',
            markerKind: 'none',
            explicitMarkerKind: 'none',
            recursiveMarkerKind: 'none',
            hasDocumentReference: false,
            orderedChildListItemIds: [],
            unorderedChildListItemIds: [],
          },
        ],
      })
    );

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const sql = vi.fn().mockImplementation(async (stmt: string) => {
      if (stmt.includes('FROM attributes') && stmt.includes(`block_id = '${CONCEPT_BLOCK_ID}'`)) {
        return [{ name: 'custom-xiuyuan-id', value: 'xy_concept' }];
      }
      if (stmt.includes('FROM attributes') && stmt.includes(`block_id = '${CHILD_PARAGRAPH_ID}'`)) {
        return [];
      }
      if (stmt.includes('FROM attributes') && stmt.includes(`block_id = '${CHILD_ITEM_ID}'`)) {
        return [];
      }
      return [];
    });

    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql,
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-descriptor-multiline',
    });

    expect(result.ok).toBe(true);
    expect(sql).toHaveBeenCalledWith(expect.stringContaining('FROM attributes'));
    expect(xiuyuanAppService.createFromBlocks).toHaveBeenCalledTimes(1);
  });

  it('counts skippedExistingBinding when paragraph or list-item already has xiuyuan binding', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(createDescriptorMultilineScanResult());

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const sql = createSqlMockForNestedSingle('hint->answer');

    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql,
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === CONCEPT_BLOCK_ID) {
          return { 'custom-xiuyuan-id': 'xy_concept' };
        }
        if (blockId === CHILD_ITEM_ID) {
          return { 'custom-xiuyuan-id': 'xy_existing' };
        }
        return {};
      }),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-descriptor-multiline',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(1);
      expect(result.value.skippedExistingBinding).toBe(1);
      expect(result.value.skippedNoTemplate).toBe(0);
    }
    expect(xiuyuanAppService.createFromBlocks).not.toHaveBeenCalled();
  });

  it('counts skippedNoTemplate when marker kind cannot be mapped to a template', async () => {
    mockedResolveCdfMultilineScan.mockResolvedValue(createDescriptorMultilineScanResult());

    const xiuyuanAppService = createXiuyuanAppServiceMock();
    const sql = createSqlMockForNestedSingle('child ;;;');

    const useCase = new CreateCdfMultilineCardsUseCase(xiuyuanAppService as never, {
      BUILTIN_DECK_ID: 'builtin-deck',
      sql,
      getBlockAttrs: vi.fn(async (blockId: string) => {
        if (blockId === CONCEPT_BLOCK_ID) {
          return { 'custom-xiuyuan-id': 'xy_concept' };
        }
        return {};
      }),
      getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: '' }),
    });

    const result = await useCase.execute({
      parentBlockId: PARENT_BLOCK_ID,
      templateId: 'builtin-list-descriptor-multiline',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(1);
      expect(result.value.skippedExistingBinding).toBe(0);
      expect(result.value.skippedNoTemplate).toBe(1);
    }
    expect(xiuyuanAppService.createFromBlocks).not.toHaveBeenCalled();
  });
});
