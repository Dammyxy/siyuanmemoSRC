import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { resolveConceptCard } from '../ConceptCardResolver';

const { createXiuyuanFromBlocksUseCaseMock, executeMock } = vi.hoisted(() => ({
  createXiuyuanFromBlocksUseCaseMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock('../../CreateXiuyuanFromBlocksUseCase', () => ({
  CreateXiuyuanFromBlocksUseCase: createXiuyuanFromBlocksUseCaseMock,
}));

const CONCEPT_ID = '20260101000000-concept';

function createSiyuanApi(attrs: Record<string, string>) {
  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    sql: vi.fn(async () => [{ content: '概念名' }]),
    getBlockAttrs: vi.fn(async () => attrs),
  };
}

describe('ConceptCardResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMock.mockResolvedValue(ok({
      xiuyuan: { id: 'xy_concept' },
      cards: [{ id: 'card_concept' }],
    }));
    createXiuyuanFromBlocksUseCaseMock.mockImplementation(() => ({
      execute: executeMock,
    }));
  });

  it('reuses an existing concept card when attrs are missing', async () => {
    const siyuanApi = createSiyuanApi({});

    const result = await resolveConceptCard({
      conceptId: CONCEPT_ID,
      deckId: 'deck-1',
      xiuyuanRepository: {} as never,
      templateRegistry: new Map(),
      siyuanApi: siyuanApi as never,
    });

    expect(result).toEqual({
      conceptName: '概念名',
      conceptCardId: 'xy_concept',
      createdConceptCard: true,
    });
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: [CONCEPT_ID],
      templateId: 'builtin-concept-simple',
      fieldMapping: { concept: CONCEPT_ID },
      deckId: 'deck-1',
      cardType: 'concept',
      duplicatePolicy: 'reuse-existing',
    }));
  });

  it('returns existing attr binding without creating a concept card', async () => {
    const siyuanApi = createSiyuanApi({ 'custom-xiuyuan-id': 'xy_attr' });

    const result = await resolveConceptCard({
      conceptId: CONCEPT_ID,
      xiuyuanRepository: {} as never,
      templateRegistry: new Map(),
      siyuanApi: siyuanApi as never,
    });

    expect(result).toEqual({
      conceptName: '概念名',
      conceptCardId: 'xy_attr',
      createdConceptCard: false,
    });
    expect(executeMock).not.toHaveBeenCalled();
  });
});
