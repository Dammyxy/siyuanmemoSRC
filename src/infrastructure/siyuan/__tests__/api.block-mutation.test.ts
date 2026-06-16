import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateBlock } from '../api';

const fetchMock = vi.fn();

function mockApiResponse(data: unknown, options?: { code?: number; msg?: string }): void {
  fetchMock.mockResolvedValue({
    json: async () => ({
      code: options?.code ?? 0,
      msg: options?.msg,
      data,
    }),
  } as Response);
}

describe('siyuan api block mutation normalization', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the requested block id when Siyuan 3.6.5 updateBlock succeeds without doOperations ids', async () => {
    mockApiResponse([{ doOperations: [] }]);

    await expect(updateBlock({
      dataType: 'dom',
      data: '<div data-node-id="block-1"></div>',
      id: 'block-1',
    })).resolves.toBe('block-1');
  });

  it('returns the inserted content block id when document update deletes the empty placeholder first', async () => {
    mockApiResponse([{
      doOperations: [
        { action: 'delete', id: 'empty-placeholder-1' },
        { action: 'insert', id: 'excerpt-content-1', parentID: 'excerpt-doc-1' },
      ],
    }]);

    await expect(updateBlock({
      dataType: 'dom',
      data: '<div data-type="NodeParagraph" data-node-id="excerpt-content-1"></div>',
      id: 'excerpt-doc-1',
    })).resolves.toBe('excerpt-content-1');
  });

  it('preserves the original Siyuan API error when updateBlock fails', async () => {
    mockApiResponse(null, {
      code: -1,
      msg: 'kernel rejected update',
    });

    await expect(updateBlock({
      dataType: 'markdown',
      data: 'Updated body',
      id: 'block-1',
    })).rejects.toThrow('Siyuan API Error: kernel rejected update');
  });
});
