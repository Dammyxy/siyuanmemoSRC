import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiyuanExternalSrsAlgorithmFileHost } from '@/infrastructure/services/ExternalSrsAlgorithmFileHost';

describe('SiyuanExternalSrsAlgorithmFileHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('discovers manifest files from a local plugin data directory without remote URLs', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: string };
      if (url === '/api/file/readDir') {
        expect(body.path).toBe('/data/storage/petal/siyuanmemo/external-srs');
        return new Response(JSON.stringify({
          code: 0,
          data: [
            { name: 'demo', isDir: true },
            { name: 'notes.txt', isDir: false },
          ],
        }), { status: 200 });
      }
      if (url === '/api/file/getFile' && body.path === '/data/storage/petal/siyuanmemo/external-srs/demo/manifest.json') {
        return new Response('{}', { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const host = new SiyuanExternalSrsAlgorithmFileHost('siyuanmemo');

    await expect(host.listManifestFiles('external-srs')).resolves.toEqual([
      'external-srs/demo/manifest.json',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/file/readDir',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('http'))).toBe(false);
  });
});
