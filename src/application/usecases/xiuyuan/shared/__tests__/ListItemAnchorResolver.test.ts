import { describe, expect, it, vi } from 'vitest';

import { resolveListItemAnchorBlockId } from '../ListItemAnchorResolver';

describe('resolveListItemAnchorBlockId', () => {
  it('returns the selected block when it is already a list item', async () => {
    const sql = vi.fn().mockResolvedValueOnce([
      { id: 'list-item-1', type: 'i', parent_id: 'list-1' },
    ]);

    await expect(resolveListItemAnchorBlockId('list-item-1', { sql })).resolves.toBe('list-item-1');
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('resolves a paragraph block to its parent list item', async () => {
    const sql = vi.fn()
      .mockResolvedValueOnce([{ id: 'paragraph-1', type: 'p', parent_id: 'list-item-1' }])
      .mockResolvedValueOnce([{ id: 'list-item-1', type: 'i' }]);

    await expect(resolveListItemAnchorBlockId('paragraph-1', { sql })).resolves.toBe('list-item-1');
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('returns null for unsupported block types', async () => {
    const sql = vi.fn().mockResolvedValueOnce([
      { id: 'heading-1', type: 'h', parent_id: 'doc-1' },
    ]);

    await expect(resolveListItemAnchorBlockId('heading-1', { sql })).resolves.toBeNull();
  });
});
