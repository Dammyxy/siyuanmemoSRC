import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getBlockBreadcrumb: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/core/siyuan/api', () => ({
  getBlockBreadcrumb: apiMocks.getBlockBreadcrumb,
  sql: apiMocks.sql,
}));

vi.mock('@/infrastructure/siyuan/api', () => ({
  getBlockBreadcrumb: apiMocks.getBlockBreadcrumb,
  sql: apiMocks.sql,
}));

import { BaseCardRenderService } from '../BaseCardRenderService';

class TestCardRenderService extends BaseCardRenderService {
  public load(blockId: string, excludeLast: number = 1) {
    return this.loadBreadcrumbs(blockId, excludeLast);
  }
}

describe('BaseCardRenderService', () => {
  beforeEach(() => {
    apiMocks.getBlockBreadcrumb.mockReset();
    apiMocks.sql.mockReset();
    apiMocks.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes("WHERE id = 'doc-1'") || stmt.includes("WHERE id = 'doc-2'")) {
        return [{ type: 'd', content: '', markdown: '' }];
      }

      return [{ type: 'p', content: '', markdown: '' }];
    });
  });

  it('keeps same-name document ancestors with different ids', async () => {
    apiMocks.getBlockBreadcrumb.mockResolvedValue([
      { id: 'doc-1', name: '1. Intro', type: 'NodeDocument' },
      { id: 'doc-2', name: '1. Intro', type: 'NodeDocument' },
      { id: 'block-1', name: 'Current Block', type: 'NodeParagraph' },
    ]);

    const service = new TestCardRenderService();

    await expect(service.load('block-1')).resolves.toEqual([
      { id: 'doc-1', name: 'Intro', type: 'NodeDocument' },
      { id: 'doc-2', name: 'Intro', type: 'NodeDocument' },
    ]);
  });
});
