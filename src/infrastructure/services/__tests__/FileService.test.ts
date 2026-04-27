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
    loadData,
    saveData: vi.fn(),
    removeData: vi.fn(),
  } as never;
}

describe('FileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
