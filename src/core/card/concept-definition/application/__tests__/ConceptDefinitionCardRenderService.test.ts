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
    expect(viewModel.directScene?.frontMask).toEqual({
      rowKey: 'concept-definition',
      segment: 'right',
    });
    expect(viewModel.directScene?.rows).toEqual([
      expect.objectContaining({
        kind: 'relation',
        key: 'concept-definition',
        arrow: '↔',
      }),
    ]);
    expect(viewModel.dependencyBlockIds).toEqual(expect.arrayContaining([
      'definition-1',
      'concept-missing',
    ]));
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

  it('builds a reverse direct scene that masks the concept side', async () => {
    conceptDefinitionApiMocks.getBlockKramdown.mockImplementation(async (blockId: string) => {
      if (blockId === 'concept-missing') {
        return { kramdown: '概念问题块' };
      }
      return { kramdown: "((20260421015111-tnu7f1e '学习')):<学习是学习者在共同体中逐渐增加参与度的社会过程。" };
    });
    conceptDefinitionApiMocks.sql.mockResolvedValue([]);

    const service = new TestableConceptDefinitionCardRenderService({}, {
      getXiuyuan: async () => createXiuyuanPort() as never,
      renderMarkdown: (kramdown) => `<rich>${kramdown}</rich>`,
    });

    const viewModel = await service.prepareViewModel('definition-1', {
      ...createCardInput(),
      meta: {
        ...createCardInput().meta,
        typeMarker: 'concept-definition-reverse',
      },
    });

    expect(viewModel.isReverse).toBe(true);
    expect(viewModel.directScene?.frontMask).toEqual({
      rowKey: 'concept-definition',
      segment: 'left',
    });
  });

  it('uses faceKey face index and rule direction before stale legacy meta', async () => {
    conceptDefinitionApiMocks.getBlockKramdown.mockImplementation(async (blockId: string) => {
      if (blockId === 'concept-0') {
        return { kramdown: '旧概念' };
      }
      if (blockId === 'definition-0') {
        return { kramdown: "((old '旧概念'))::旧定义" };
      }
      if (blockId === 'concept-1') {
        return { kramdown: '目标概念' };
      }
      return { kramdown: "((target '目标概念'))::目标定义" };
    });
    conceptDefinitionApiMocks.sql.mockResolvedValue([]);

    const service = new TestableConceptDefinitionCardRenderService({}, {
      getXiuyuan: async () => ({
        xiuyuan: {
          getFaces: () => [
            {
              questionBlockId: 'concept-0',
              answerBlockId: 'definition-0',
            },
            {
              questionBlockId: 'concept-1',
              answerBlockId: 'definition-1',
            },
          ],
        },
      }) as never,
      renderMarkdown: (kramdown) => `<rich>${kramdown}</rich>`,
    });

    const viewModel = await service.prepareViewModel('definition-1', {
      xiuyuanID: 'xy-1',
      faceKey: { ruleId: 'concept-definition-reverse', faceIndex: 1 },
      meta: {
        xiuyuanID: 'xy-1',
        faceIndex: 0,
        typeMarker: 'concept-definition-forward',
      },
    });

    expect(viewModel.conceptBlockId).toBe('concept-1');
    expect(viewModel.conceptName).toBe('目标概念');
    expect(viewModel.isReverse).toBe(true);
    expect(viewModel.directScene?.frontMask).toEqual({
      rowKey: 'concept-definition',
      segment: 'left',
    });
  });

  it('keeps complex definitions in block-flow direct content and strips trailing attribute artifacts', async () => {
    conceptDefinitionApiMocks.getBlockKramdown.mockImplementation(async (blockId: string) => {
      if (blockId === 'concept-missing') {
        return { kramdown: '概念问题块' };
      }
      return {
        kramdown: "((20260421015111-tnu7f1e '学习'))::第一段\n\n> 引用说明\n{: id=\"2026042409\" updated=\"2026042410\"}",
      };
    });
    conceptDefinitionApiMocks.sql.mockResolvedValue([]);

    const service = new TestableConceptDefinitionCardRenderService({}, {
      getXiuyuan: async () => createXiuyuanPort() as never,
      renderMarkdown: (kramdown, options) => ({
        html: `<rendered>${kramdown}</rendered>`,
        renderKind: options?.forceRenderKind ?? (/\n/u.test(kramdown) ? 'block-flow' : 'fragment'),
        normalizedKramdown: kramdown,
      }),
    });

    const viewModel = await service.prepareViewModel('definition-1', createCardInput());
    const relationRow = viewModel.directScene?.rows[0];

    expect(relationRow).toEqual(expect.objectContaining({
      kind: 'relation',
      key: 'concept-definition',
    }));
    if (!relationRow || relationRow.kind !== 'relation') {
      throw new Error('Expected concept-definition relation row');
    }
    expect(relationRow.right.renderKind).toBe('block-flow');
    expect(relationRow.right.html).not.toContain('{:');
  });
});
