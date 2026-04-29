import { describe, expect, it } from 'vitest';
import {
  buildSettingsCaptureStorageNotebookOptions,
  buildSettingsParamsPreview,
  buildSettingsTodayRangeText,
  clampSettingsDayStartHour,
  isSettingsLibraryStorage,
  isSettingsSourceChildStorage,
} from '../settingsFormViewModel';

describe('settingsFormViewModel', () => {
  it('projects params preview and today range text', () => {
    expect(buildSettingsParamsPreview([0.1, 1, 2.34567])).toBe('0.1000, 1.0000, 2.3457');
    expect(buildSettingsTodayRangeText(4)).toContain('04:00');
  });

  it('projects capture storage notebook options', () => {
    expect(buildSettingsCaptureStorageNotebookOptions([
      { id: ' notebook-a ', name: ' Notebook A ' },
      { id: 'notebook-b', name: '   ' },
      { id: '   ', name: 'Missing' },
    ])).toEqual([
      { id: 'notebook-a', name: 'Notebook A' },
      { id: 'notebook-b', name: 'notebook-b' },
    ]);
  });

  it('projects storage mode flags and clamps day start hour', () => {
    expect(isSettingsSourceChildStorage('source-child')).toBe(true);
    expect(isSettingsSourceChildStorage('library')).toBe(false);
    expect(isSettingsLibraryStorage('library')).toBe(true);
    expect(isSettingsLibraryStorage('daily-note')).toBe(false);
    expect(clampSettingsDayStartHour(-1)).toBe(0);
    expect(clampSettingsDayStartHour(99)).toBe(23);
    expect(clampSettingsDayStartHour('bad')).toBe(4);
    expect(clampSettingsDayStartHour(6.9)).toBe(6);
  });
});
