import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBreadcrumbTrail } from '../loadBreadcrumbTrail';

const getBlockBreadcrumbMock = vi.fn();

vi.mock('@/infrastructure/siyuan/api', () => ({
  getBlockBreadcrumb: (...args: unknown[]) => getBlockBreadcrumbMock(...args),
}));

describe('loadBreadcrumbTrail', () => {
  beforeEach(() => {
    getBlockBreadcrumbMock.mockReset();
  });

  it('excludes the current block with trimTrailingCount 1', async () => {
    getBlockBreadcrumbMock.mockResolvedValue([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Intro', type: 'NodeHeading' },
      { id: 'block-1', name: 'Current Block', type: 'NodeParagraph' },
    ]);

    await expect(loadBreadcrumbTrail('block-1', {
      trimTrailingCount: 1,
    })).resolves.toEqual([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Intro', type: 'NodeHeading' },
    ]);
  });

  it('clips breadcrumbs at the last document when requested', async () => {
    getBlockBreadcrumbMock.mockResolvedValue([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Intro', type: 'NodeHeading' },
      { id: 'doc-2', name: 'Nested Doc', type: 'NodeDocument' },
      { id: 'heading-2', name: 'Nested Heading', type: 'NodeHeading' },
      { id: 'block-1', name: 'Current Block', type: 'NodeParagraph' },
    ]);

    await expect(loadBreadcrumbTrail('block-1', {
      trimTrailingCount: 1,
      clipAtLastDocument: true,
    })).resolves.toEqual([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Intro', type: 'NodeHeading' },
      { id: 'doc-2', name: 'Nested Doc', type: 'NodeDocument' },
    ]);
  });

  it('keeps Xiuyuan list-template trimTrailingCount 2 behavior', async () => {
    getBlockBreadcrumbMock.mockResolvedValue([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: '1. Intro', type: 'NodeHeading' },
      { id: 'heading-2', name: '1. Intro', type: 'NodeHeading' },
      { id: 'list-item-1', name: 'Question Container', type: 'NodeListItem' },
      { id: 'q_1', name: 'Question Paragraph', type: 'NodeParagraph' },
    ]);

    await expect(loadBreadcrumbTrail('q_1', {
      trimTrailingCount: 2,
    })).resolves.toEqual([
      { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
      { id: 'heading-1', name: 'Intro', type: 'NodeHeading' },
      { id: 'heading-2', name: 'Intro', type: 'NodeHeading' },
    ]);
  });
});
