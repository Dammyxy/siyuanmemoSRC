import { describe, expect, it } from 'vitest';
import { applyKnownSourceExistenceToRows } from '../MissingBlockMarker';

describe('MissingBlockMarker', () => {
  it('marks rows missing and clears stale missing marks from source-existence status', () => {
    const activeRow = {
      id: 'card-1',
      blockId: 'block-1',
      content: 'active row',
      meta: { rootId: 'doc-1' },
    };
    const missingRow = {
      id: 'card-2',
      blockId: 'block-2',
      content: 'missing row',
      blockType: 'missing',
      meta: { rootId: 'doc-1', blockType: 'missing' },
    };

    const rows = applyKnownSourceExistenceToRows([activeRow, missingRow], [
      ['block-1', false],
      ['block-2', true],
    ]);

    expect(rows[0]).toMatchObject({
      blockId: 'block-1',
      blockType: 'missing',
      meta: expect.objectContaining({ blockType: 'missing' }),
    });
    expect(rows[1]).not.toHaveProperty('blockType');
    expect(rows[1].meta).toEqual({ rootId: 'doc-1' });
  });

  it('keeps row references when no source-existence status changes apply', () => {
    const row = {
      id: 'card-1',
      blockId: 'block-1',
      content: 'active row',
      meta: { rootId: 'doc-1' },
    };

    const rows = [row];
    expect(applyKnownSourceExistenceToRows(rows, [['block-2', false]])).toBe(rows);
    expect(applyKnownSourceExistenceToRows(rows, [['block-1', null]])).toBe(rows);
  });
});
