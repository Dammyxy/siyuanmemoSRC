import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { CreateConceptDescriptorCardsUseCase } from '../CreateConceptDescriptorCardsUseCase';
import { resolveConceptCard } from '../shared/ConceptCardResolver';

const conceptDescriptorMocks = vi.hoisted(() => ({
  executeXiuyuan: vi.fn(),
}));

vi.mock('../shared/ConceptCardResolver', () => ({
  resolveConceptCard: vi.fn(),
}));

vi.mock('../CreateXiuyuanFromBlocksUseCase', () => ({
  CreateXiuyuanFromBlocksUseCase: class {
    execute(command: unknown) {
      return conceptDescriptorMocks.executeXiuyuan(command);
    }
  },
}));

const SELECTED_LIST_ITEM_ID = '20260101000000-list001';
const PARENT_PARAGRAPH_ID = '20260101000000-parent1';
const LIST_CONTAINER_ID = '20260101000000-listcon';
const CHILD_LIST_ITEM_ID = '20260101000000-child01';
const CHILD_DESCRIPTOR_ID = '20260101000000-childp1';
const CONCEPT_DOC_ID = '20260101000000-docref1';

function createSiyuanApiMock() {
  const sql = vi.fn(async (stmt: string) => {
    if (stmt.includes(`WHERE id = '${SELECTED_LIST_ITEM_ID}'`) && stmt.includes('SELECT id, type, parent_id')) {
      return [{ id: SELECTED_LIST_ITEM_ID, type: 'i', parent_id: '20260101000000-parenti' }];
    }

    if (stmt.includes(`WHERE parent_id = '${SELECTED_LIST_ITEM_ID}'`) && stmt.includes("AND type = 'p'")) {
      return [{
        id: PARENT_PARAGRAPH_ID,
        content: `((${CONCEPT_DOC_ID}))`,
        markdown: `((${CONCEPT_DOC_ID}))`,
      }];
    }

    if (stmt.includes(`WHERE id = '${CONCEPT_DOC_ID}'`) && stmt.includes('SELECT type FROM blocks')) {
      return [{ type: 'd' }];
    }

    if (stmt.includes(`WHERE parent_id = '${SELECTED_LIST_ITEM_ID}'`) && stmt.includes("AND type = 'l'")) {
      return [{ id: LIST_CONTAINER_ID }];
    }

    if (stmt.includes(`WHERE parent_id = '${LIST_CONTAINER_ID}'`) && stmt.includes("AND type = 'i'")) {
      return [{ id: CHILD_LIST_ITEM_ID }];
    }

    if (stmt.includes(`WHERE parent_id = '${CHILD_LIST_ITEM_ID}'`) && stmt.includes("AND type = 'p'")) {
      return [{
        id: CHILD_DESCRIPTOR_ID,
        content: '记忆 ;; 回忆',
        markdown: '记忆 ;; 回忆',
      }];
    }

    return [];
  });

  return {
    sql,
    getBlockKramdown: vi.fn(async (blockId: string) => {
      if (blockId === SELECTED_LIST_ITEM_ID) {
        return {
          kramdown: `((${CONCEPT_DOC_ID}))\n* 记忆 ;; 回忆`,
        };
      }
      return { kramdown: '' };
    }),
    getBlockAttrs: vi.fn(async () => ({})),
    BUILTIN_DECK_ID: 'builtin-deck',
  };
}

describe('CreateConceptDescriptorCardsUseCase', () => {
  const mockedResolveConceptCard = vi.mocked(resolveConceptCard);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveConceptCard.mockResolvedValue({
      conceptName: '记忆',
      conceptCardId: 'concept-card-1',
      createdConceptCard: false,
    });
    conceptDescriptorMocks.executeXiuyuan.mockResolvedValue(ok({
      xiuyuan: { id: 'xy-1' },
      cards: [{ id: 'card-1', faceIndex: 0 }],
    }));
  });

  it('does not treat the concept reference paragraph as a descriptor when only descendants carry ;; markers', async () => {
    const siyuanApi = createSiyuanApiMock();
    const useCase = new CreateConceptDescriptorCardsUseCase(
      {} as never,
      new Map(),
      { siyuanApi: siyuanApi as never },
    );

    const result = await useCase.execute({
      parentBlockId: SELECTED_LIST_ITEM_ID,
      deckId: 'builtin-deck',
    });

    expect(result.ok).toBe(true);
    expect(conceptDescriptorMocks.executeXiuyuan).toHaveBeenCalledTimes(1);
    expect(conceptDescriptorMocks.executeXiuyuan).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: [CONCEPT_DOC_ID, CHILD_DESCRIPTOR_ID],
      fieldMapping: {
        concept: CONCEPT_DOC_ID,
        descriptor: CHILD_DESCRIPTOR_ID,
      },
      templateId: 'builtin-concept-descriptor',
    }));

    if (result.ok) {
      expect(result.value.descriptorCards).toHaveLength(1);
      expect(result.value.descriptorCards[0]?.descriptorBlockId).toBe(CHILD_DESCRIPTOR_ID);
      expect(result.value.skipped).toEqual([]);
    }
  });
});
