import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IFileService } from '@/infrastructure/services/FileService';
import { DEFAULT_SETTINGS } from '@/types/settings';
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

describe('SettingsService quickCard flashcard seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { siyuan?: unknown }).siyuan;
  });

  it('seeds quickCard.flashcard from Siyuan config on first init', async () => {
    const loadedSettings = cloneDefaultSettings();
    delete loadedSettings.quickCard.flashcard;
    loadedSettings.quickCard.flashcardSeededFromSiyuan = false;

    (window as Window & { siyuan?: unknown }).siyuan = {
      config: {
        flashcard: {
          mark: false,
          list: true,
          heading: false,
          superBlock: true,
        },
      },
    };

    const writeJSON = vi.fn(async () => undefined);
    const service = new SettingsService(createFileServiceMock({
      readJSON: vi.fn(async () => loadedSettings),
      writeJSON,
    }));

    await service.init();

    expect(service.getSettings().quickCard.flashcard).toEqual({
      mark: false,
      list: true,
      heading: false,
      superBlock: true,
    });
    expect(service.getSettings().quickCard.flashcardSeededFromSiyuan).toBe(true);
    expect(writeJSON).toHaveBeenCalledTimes(1);
  });

  it('does not override seeded quickCard.flashcard values on later init', async () => {
    const loadedSettings = cloneDefaultSettings();
    loadedSettings.quickCard.flashcard = {
      mark: false,
      list: false,
      heading: true,
      superBlock: false,
    };
    loadedSettings.quickCard.flashcardSeededFromSiyuan = true;

    (window as Window & { siyuan?: unknown }).siyuan = {
      config: {
        flashcard: {
          mark: true,
          list: true,
          heading: true,
          superBlock: true,
        },
      },
    };

    const writeJSON = vi.fn(async () => undefined);
    const service = new SettingsService(createFileServiceMock({
      readJSON: vi.fn(async () => loadedSettings),
      writeJSON,
    }));

    await service.init();

    expect(service.getSettings().quickCard.flashcard).toEqual({
      mark: false,
      list: false,
      heading: true,
      superBlock: false,
    });
    expect(writeJSON).not.toHaveBeenCalled();
  });

  it('falls back to all-enabled defaults when Siyuan flashcard config is unavailable', async () => {
    const loadedSettings = cloneDefaultSettings();
    delete loadedSettings.quickCard.flashcard;
    loadedSettings.quickCard.flashcardSeededFromSiyuan = false;

    const writeJSON = vi.fn(async () => undefined);
    const service = new SettingsService(createFileServiceMock({
      readJSON: vi.fn(async () => loadedSettings),
      writeJSON,
    }));

    await service.init();

    expect(service.getSettings().quickCard.flashcard).toEqual({
      mark: true,
      list: true,
      heading: true,
      superBlock: true,
    });
    expect(service.getSettings().quickCard.flashcardSeededFromSiyuan).toBe(true);
    expect(writeJSON).toHaveBeenCalledTimes(1);
  });
});
