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
    const dbBytes = new Uint8Array([1, 2, 3]);
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
    expect(Array.from(sources[0].bytes)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledWith('/api/file/getFile', expect.objectContaining({
      body: JSON.stringify({
        path: '/temp/repo/sync/conflicts/2026-05-19-231329/storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db',
      }),
    }));
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
