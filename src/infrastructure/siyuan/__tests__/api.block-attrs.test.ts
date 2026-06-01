import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setBlockAttrs } from '../api';

const fetchMock = vi.fn();

describe('siyuan api block attr write guard', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      json: async () => ({ code: 0, data: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('allows only strict source metadata attrs and explicit legacy clears', async () => {
    await setBlockAttrs('block-1', {
      'custom-xiuyuan-id': 'xy_20260305010958-r26fpmd',
      'custom-fsrs-card-type': '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      id: 'block-1',
      attrs: {
        'custom-xiuyuan-id': 'xy_20260305010958-r26fpmd',
        'custom-fsrs-card-type': '',
      },
    });
  });

  it('fails explicitly when forbidden Review, AI, diagnostics, or large attrs are written', async () => {
    await expect(setBlockAttrs('block-1', {
      'custom-fsrs-due': '9999999999999',
    })).rejects.toThrow(/BLOCK_ATTR_WRITE_FORBIDDEN: custom-fsrs-due/);
    await expect(setBlockAttrs('block-1', {
      'custom-fsrs-ai-session-id': 'session-a',
    })).rejects.toThrow(/BLOCK_ATTR_WRITE_FORBIDDEN: custom-fsrs-ai-session-id/);
    await expect(setBlockAttrs('block-1', {
      'custom-fsrs-reading-source-lineage': 'x'.repeat(300),
    })).rejects.toThrow(/BLOCK_ATTR_WRITE_FORBIDDEN: custom-fsrs-reading-source-lineage/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
