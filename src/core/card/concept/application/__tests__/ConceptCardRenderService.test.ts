import { beforeEach, describe, expect, it, vi } from 'vitest';

const conceptCardApiMocks = vi.hoisted(() => ({
  getBlockKramdown: vi.fn(),
  sql: vi.fn(),
}));

const conceptCardRuntimeMocks = vi.hoisted(() => ({
  resolveLuteRenderer: vi.fn(() => ({
    Md2BlockDOM: (kramdown: string) => `<rich>${kramdown}</rich>`,
  })),
  resolveSiyuanMemoPlugin: vi.fn(),
}));

vi.mock('@/core/siyuan/api', () => ({
  getBlockKramdown: conceptCardApiMocks.getBlockKramdown,
  sql: conceptCardApiMocks.sql,
}));

vi.mock('@/core/card/concept-definition/application/runtime', () => ({
  resolveLuteRenderer: conceptCardRuntimeMocks.resolveLuteRenderer,
  resolveSiyuanMemoPlugin: conceptCardRuntimeMocks.resolveSiyuanMemoPlugin,
}));

import { ConceptCardRenderService } from '../ConceptCardRenderService';

class TestableConceptCardRenderService extends ConceptCardRenderService {
  protected async loadBreadcrumbs(): Promise<Array<{ id: string; name: string; type: string }>> {
    return [
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
    ];
  }
}

describe('ConceptCardRenderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conceptCardApiMocks.getBlockKramdown.mockResolvedValue({
      kramdown: '学习 :: 社会性参与',
    });
    conceptCardApiMocks.sql.mockResolvedValue([
      { content: '学习 :: 社会性参与' },
    ]);
    conceptCardRuntimeMocks.resolveSiyuanMemoPlugin.mockReturnValue({
      getContext: async () => ({
        getXiuyuanApplicationService: async () => ({
          getXiuyuan: async () => ({
            xiuyuan: {
              fieldMapping: {
                concept: 'concept-block',
              },
            },
          }),
        }),
      }),
    });
  });

  it('includes concept and breadcrumb blocks in dependencyBlockIds', async () => {
    const service = new TestableConceptCardRenderService();

    const viewModel = await service.prepareViewModel('ignored-block', {
      xiuyuanID: 'xy-1',
      meta: {
        xiuyuanID: 'xy-1',
      },
    });

    expect(viewModel.conceptBlockId).toBe('concept-block');
    expect(viewModel.dependencyBlockIds).toEqual(expect.arrayContaining([
      'concept-block',
      'doc-1',
    ]));
  });
});
