import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { DEFAULT_SETTINGS } from '@/types/settings';

const loggerMocks = vi.hoisted(() => ({
  setGlobalLogLevel: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  applyDebugLogPreference: (enabled: boolean) => {
    loggerMocks.setGlobalLogLevel(enabled ? 'debug' : 'warn');
  },
}));

import { SettingsService } from '../SettingsService';

function createFileServiceMock(overrides: {
  readJSON?: ReturnType<typeof vi.fn>;
  writeJSON?: ReturnType<typeof vi.fn>;
} = {}): IFileService {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readJSON: overrides.readJSON || vi.fn(async () => null),
    writeJSON: overrides.writeJSON || vi.fn(async () => undefined),
    readMsgpack: vi.fn(),
    writeMsgpack: vi.fn(),
  };
}

function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

describe('SettingsService logging runtime wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies debug log preference from persisted settings during init', async () => {
    const loadedSettings = cloneDefaultSettings();
    loadedSettings.ui.enableDebugLogs = true;

    const service = new SettingsService(createFileServiceMock({
      readJSON: vi.fn(async () => loadedSettings),
    }));

    await service.init();

    expect(loggerMocks.setGlobalLogLevel).toHaveBeenCalledWith('debug');
  });

  it('updates the runtime log level immediately when ui.enableDebugLogs changes', async () => {
    const service = new SettingsService(createFileServiceMock());
    await service.init();

    loggerMocks.setGlobalLogLevel.mockClear();

    await service.updateSettings({
      ui: {
        enableDebugLogs: true,
      } as typeof DEFAULT_SETTINGS.ui,
    });

    expect(loggerMocks.setGlobalLogLevel).toHaveBeenCalledWith('debug');

    await service.dispose();
  });
});
