import type { ConfiguredCaptureStorageMode } from '@/types';
import { formatTodayRange, getTodayRange } from '@/utils/dateUtils';

export interface SettingsCaptureStorageNotebookInput {
  id: string;
  name: string;
  icon?: string;
}

export interface SettingsCaptureStorageNotebookOption {
  id: string;
  name: string;
}

export function buildSettingsParamsPreview(params: number[]): string {
  return params.map((param) => param.toFixed(4)).join(', ');
}

export function buildSettingsTodayRangeText(dayStartHour: number): string {
  return formatTodayRange(getTodayRange(dayStartHour));
}

export function buildSettingsCaptureStorageNotebookOptions(
  notebooks: SettingsCaptureStorageNotebookInput[] | undefined,
): SettingsCaptureStorageNotebookOption[] {
  return (notebooks || [])
    .map((notebook) => ({
      id: String(notebook.id || '').trim(),
      name: String(notebook.name || '').trim() || String(notebook.id || '').trim(),
    }))
    .filter((notebook) => notebook.id.length > 0);
}

export function isSettingsSourceChildStorage(mode: ConfiguredCaptureStorageMode): boolean {
  return mode === 'source-child';
}

export function isSettingsLibraryStorage(mode: ConfiguredCaptureStorageMode): boolean {
  return mode === 'library';
}

export function clampSettingsDayStartHour(value: unknown): number {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) {
    return 4;
  }
  return Math.max(0, Math.min(23, numeric));
}
