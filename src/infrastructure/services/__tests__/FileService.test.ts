import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileService } from '../FileService';

const fileServiceLogger = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => fileServiceLogger,
}));

function createPlugin(loadData: ReturnType<typeof vi.fn>) {
  return {
    name: 'siyuan-plugin-siyuanmemo',
    loadData,
    saveData: vi.fn(),
    removeData: vi.fn(),
  } as never;
}

describe('FileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('reads object JSON without logging full successful reads at info level', async () => {
    const service = new FileService(createPlugin(vi.fn(async () => ({ sessions: [{ id: 'session-1' }] }))));

    await expect(service.readJSON('ai-workbench/sessions/index.json')).resolves.toEqual({
      sessions: [{ id: 'session-1' }],
    });

    expect(fileServiceLogger.info).not.toHaveBeenCalled();
    expect(fileServiceLogger.trace).toHaveBeenCalledWith(
      '[FileService] readJSON loaded "ai-workbench/sessions/index.json"',
      { type: 'object', keys: ['sessions'] },
    );
  });

  it('parses string JSON without info-level success logs', async () => {
    const service = new FileService(createPlugin(vi.fn(async () => '{"ok":true}')));

    await expect(service.readJSON('settings.json')).resolves.toEqual({ ok: true });

    expect(fileServiceLogger.info).not.toHaveBeenCalled();
  });

  it('keeps invalid JSON warnings and errors', async () => {
    const service = new FileService(createPlugin(vi.fn(async () => '{"bad"')));

    await expect(service.readJSON('broken.json')).resolves.toBeNull();

    expect(fileServiceLogger.error).toHaveBeenCalled();
    expect(fileServiceLogger.warn).toHaveBeenCalledWith(
      '[FileService] Treating invalid JSON as missing file, returning null',
    );
  });

  it('reads SiYuan sync conflict database copies from temp repo paths', async () => {
    const dbBytes = new Uint8Array([
      ...Array.from(new TextEncoder().encode('SQLite format 3')),
      0,
      1,
      2,
      3,
    ]);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: string };
      if (body.path === '/temp/repo/sync/conflicts') {
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: [{ name: '2026-05-19-231329', isDir: true }],
          }),
        } as Response;
      }
      if (
        body.path
          === '/temp/repo/sync/conflicts/2026-05-19-231329/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db'
      ) {
        return {
          ok: true,
          arrayBuffer: async () => dbBytes.buffer.slice(0),
        } as Response;
      }
      return {
        ok: false,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new FileService(createPlugin(vi.fn()));

    const sources = await service.readSyncConflictDatabaseSources();

    expect(sources).toHaveLength(1);
    expect(sources[0].sourceId).toBe(
      'siyuan-sync-conflict:2026-05-19-231329:/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
    );
    expect(Array.from(sources[0].bytes)).toEqual(Array.from(dbBytes));
    expect(fetchMock).toHaveBeenCalledWith('/api/file/getFile', expect.objectContaining({
      body: JSON.stringify({
        path: '/temp/repo/sync/conflicts/2026-05-19-231329/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      }),
    }));
  });

  it('ignores SiYuan getFile JSON error bodies for missing sync conflict databases', async () => {
    const errorBytes = new TextEncoder().encode('{"code":404,"msg":"file does not exist","data":null}');
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: string };
      if (body.path === '/temp/repo/sync/conflicts') {
        return {
          ok: true,
          json: async () => ({
            code: 0,
            data: [{ name: '2026-05-21-044935', isDir: true }],
          }),
        } as Response;
      }
      if (
        body.path
          === '/temp/repo/sync/conflicts/2026-05-21-044935/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db'
      ) {
        return {
          ok: true,
          status: 202,
          headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
          arrayBuffer: async () => errorBytes.buffer.slice(0),
        } as Response;
      }
      return {
        ok: false,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new FileService(createPlugin(vi.fn()));

    const sources = await service.readSyncConflictDatabaseSources();

    expect(sources).toEqual([]);
  });

  it('treats missing SiYuan sync conflict root as no conflict sources', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: string };
      if (body.path === '/temp/repo/sync/conflicts') {
        return {
          ok: false,
          status: 404,
          json: async () => ({ code: 404, msg: 'file does not exist', data: null }),
        } as Response;
      }
      return {
        ok: false,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new FileService(createPlugin(vi.fn()));

    await expect(service.readSyncConflictDatabaseSources()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/api/file/readDir', expect.objectContaining({
      body: JSON.stringify({ path: '/temp/repo/sync/conflicts' }),
    }));
  });

  it('reads the sqlite projection database from workspace temp instead of plugin petal storage', async () => {
    const dbBytes = new Uint8Array([
      ...Array.from(new TextEncoder().encode('SQLite format 3')),
      0,
      8,
      9,
      10,
    ]);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: string };
      if (body.path === '/temp/siyuan-plugin-siyuanmemo/siyuanmemo.db') {
        return {
          ok: true,
          arrayBuffer: async () => dbBytes.buffer.slice(0),
        } as Response;
      }
      return {
        ok: false,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new FileService(createPlugin(vi.fn()));

    await expect(service.readTempProjectionBinary('siyuanmemo.db')).resolves.toEqual(dbBytes);

    expect(fetchMock).toHaveBeenCalledWith('/api/file/getFile', expect.objectContaining({
      body: JSON.stringify({
        path: '/temp/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      }),
    }));
  });

  it('writes the sqlite projection database to workspace temp instead of plugin petal storage', async () => {
    const dbBytes = new Uint8Array([
      ...Array.from(new TextEncoder().encode('SQLite format 3')),
      0,
      11,
      12,
      13,
    ]);
    const writes: Array<{ path: string; bytes: number[] }> = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const formData = init?.body as FormData;
      const file = formData.get('file') as Blob;
      writes.push({
        path: String(formData.get('path')),
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      });
      return {
        json: async () => ({ code: 0, data: null }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new FileService(createPlugin(vi.fn()));

    await service.writeTempProjectionBinary('siyuanmemo.db', dbBytes);

    expect(writes).toEqual([{
      path: '/temp/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      bytes: Array.from(dbBytes),
    }]);
  });

  it('reads temp-local JSON from workspace temp instead of plugin petal storage', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: string };
      if (body.path === '/temp/siyuan-plugin-siyuanmemo/local/truth-device-id.v1.json') {
        return {
          ok: true,
          text: async () => '{"deviceId":"device-stable"}',
        } as Response;
      }
      return {
        ok: false,
        text: async () => '',
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new FileService(createPlugin(vi.fn()));

    await expect(service.readTempLocalJSON('truth-device-id.v1.json')).resolves.toEqual({
      deviceId: 'device-stable',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/file/getFile', expect.objectContaining({
      body: JSON.stringify({
        path: '/temp/siyuan-plugin-siyuanmemo/local/truth-device-id.v1.json',
      }),
    }));
  });

  it('writes temp-local JSON to workspace temp instead of plugin petal storage', async () => {
    const writes: Array<{ path: string; text: string }> = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const formData = init?.body as FormData;
      const file = formData.get('file') as Blob;
      writes.push({
        path: String(formData.get('path')),
        text: new TextDecoder().decode(await file.arrayBuffer()),
      });
      return {
        json: async () => ({ code: 0, data: null }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new FileService(createPlugin(vi.fn()));

    await service.writeTempLocalJSON('truth-device-id.v1.json', { deviceId: 'device-stable' });

    expect(writes).toEqual([{
      path: '/temp/siyuan-plugin-siyuanmemo/local/truth-device-id.v1.json',
      text: JSON.stringify({ deviceId: 'device-stable' }, null, 2),
    }]);
  });

  it('backs up the current sqlite database before replacement', async () => {
    const current = new Uint8Array([5, 6, 7]);
    const plugin = createPlugin(vi.fn());
    const writes: Array<{ path: string; bytes: Uint8Array }> = [];
    vi.stubGlobal('Blob', class {
      constructor(public readonly parts: BlobPart[]) {}
    });
    const putFile = vi.fn(async (path: string, blob: { parts: BlobPart[] }) => {
      writes.push({ path, bytes: new Uint8Array(blob.parts[0] as ArrayBuffer) });
    });
    vi.doMock('@/api', () => ({ putFile }));
    const service = new FileService(plugin);
    vi.spyOn(service, 'readBinary').mockResolvedValue(current);
    vi.spyOn(service, 'writeBinary').mockImplementation(async (path, bytes) => {
      writes.push({ path, bytes });
    });

    const result = await service.backupCurrentSqliteDatabase({
      sourceId: 'siyuan-sync-conflict:abc',
      now: Date.UTC(2026, 4, 20, 1, 2, 3),
    });

    expect(result.backupPath).toContain('manual-sync-backups/siyuanmemo.db.2026-05-20T01-02-03-000Z');
    expect(result.backupPath).toContain('siyuan-sync-conflict-abc');
    expect(Array.from(result.bytes)).toEqual([5, 6, 7]);
    expect(writes[0]).toEqual({ path: result.backupPath, bytes: current });
  });

  it('replaces the current sqlite database with selected bytes', async () => {
    const service = new FileService(createPlugin(vi.fn()));
    const writeBinary = vi.spyOn(service, 'writeBinary').mockResolvedValue(undefined);
    const selected = new Uint8Array([1, 2, 3]);

    await service.replaceCurrentSqliteDatabase(selected);

    expect(writeBinary).toHaveBeenCalledWith('siyuanmemo.db', selected);
  });
});
