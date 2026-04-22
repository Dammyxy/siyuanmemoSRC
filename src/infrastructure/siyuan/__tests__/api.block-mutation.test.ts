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
