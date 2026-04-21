import { beforeEach, describe, expect, it, vi } from 'vitest';

const conceptDefinitionApiMocks = vi.hoisted(() => ({
  getBlockBreadcrumb: vi.fn(async () => []),
  getBlockKramdown: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/core/siyuan/api', () => ({
  getBlockBreadcrumb: conceptDefinitionApiMocks.getBlockBreadcrumb,
  getBlockKramdown: conceptDefinitionApiMocks.getBlockKramdown,
  sql: conceptDefinitionApiMocks.sql,
}));

import {
  ConceptDefinitionCardRenderService,
  type ConceptDefinitionCardInput,
} from '../ConceptDefinitionCardRenderService';

class TestableConceptDefinitionCardRenderService extends ConceptDefinitionCardRenderService {
  protected async loadBreadcrumbs(): Promise<[]> {
    return [];
  }
}

function createCardInput(): ConceptDefinitionCardInput {
  return {
    xiuyuanID: 'xy-1',
    meta: {
      xiuyuanID: 'xy-1',
      faceIndex: 0,
      typeMarker: 'concept-definition-forward',
    },
  };
}

function createXiuyuanPort() {
  return {
    xiuyuan: {
      getFaces: () => [
        {
          questionBlockId: 'concept-missing',
          answerBlockId: 'definition-1',
        },
      ],
    },
  };
}

describe('ConceptDefinitionCardRenderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recovers the concept name from definition kramdown when the concept block is missing', async () => {
    conceptDefinitionApiMocks.getBlockKramdown.mockImplementation(async (blockId: string) => {
      if (blockId === 'concept-missing') {
        return { kramdown: '概念问题块' };
      }
      return { kramdown: "((20260421015111-tnu7f1e '学习'))::学习是学习者在共同体中逐渐增加参与度的社会过程。" };
    });
    conceptDefinitionApiMocks.sql.mockResolvedValue([]);

    const service = new TestableConceptDefinitionCardRenderService({}, {
      getXiuyuan: async () => createXiuyuanPort() as never,
      renderMarkdown: (kramdown) => `<rich>${kramdown}</rich>`,
    });

    const viewModel = await service.prepareViewModel('definition-1', createCardInput());

    expect(viewModel.conceptName).toBe('学习');
    expect(viewModel.frontHtml).toContain('学习');
    expect(viewModel.backHtml).toContain('<rich>学习是学习者在共同体中逐渐增加参与度的社会过程。</rich>');
  });

  it('keeps throwing a stable missing-concept error when the definition content cannot recover the concept name', async () => {
    conceptDefinitionApiMocks.getBlockKramdown.mockImplementation(async (blockId: string) => {
      if (blockId === 'concept-missing') {
        return { kramdown: '概念问题块' };
      }
      return { kramdown: '((20260421015111-tnu7f1e))::学习是学习者在共同体中逐渐增加参与度的社会过程。' };
    });
    conceptDefinitionApiMocks.sql.mockResolvedValue([]);

    const service = new TestableConceptDefinitionCardRenderService({}, {
      getXiuyuan: async () => createXiuyuanPort() as never,
      renderMarkdown: (kramdown) => `<rich>${kramdown}</rich>`,
    });

    await expect(service.prepareViewModel('definition-1', createCardInput())).rejects.toThrow(
      'Concept block not found: concept-missing',
    );
  });
});
