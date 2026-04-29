import type { BrowserViewMode } from './types';
import {
  buildBrowserPreferenceKey,
  LEGACY_BROWSER_VIEW_MODE_KEY,
  resolveDefaultBrowserNavigatorOpen,
  resolveDefaultBrowserNarrowRoamPane,
  resolveDefaultBrowserShowPreview,
  resolveDefaultBrowserViewMode,
  type BrowserChromePreferenceKey,
  type BrowserLayoutProfile,
  type BrowserNarrowRoamPane,
} from './layoutProfile';

export interface BrowserPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BrowserChromePreferences {
  viewMode: BrowserViewMode;
  showPreview: boolean;
  navigatorOpen: boolean;
  narrowRoamPane: BrowserNarrowRoamPane;
}

export type BrowserChromePreferenceValue = BrowserViewMode | BrowserNarrowRoamPane | boolean;

function resolveBrowserPreferenceStorage(): BrowserPreferenceStorage | null {
  const candidate = (globalThis as { localStorage?: BrowserPreferenceStorage }).localStorage;
  return candidate || null;
}

function readStoredViewMode(
  profile: BrowserLayoutProfile,
  storage: BrowserPreferenceStorage | null,
): BrowserViewMode {
  if (!storage) {
    return resolveDefaultBrowserViewMode(profile);
  }

  const key = buildBrowserPreferenceKey('viewMode', profile);
  try {
    const stored = storage.getItem(key);
    if (stored === 'flat' || stored === 'hierarchy') {
      return stored;
    }

    if (profile === 'dialog') {
      const legacy = storage.getItem(LEGACY_BROWSER_VIEW_MODE_KEY);
      if (legacy === 'flat' || legacy === 'hierarchy') {
        storage.setItem(key, legacy);
        return legacy;
      }
    }
  } catch {}

  return resolveDefaultBrowserViewMode(profile);
}

function readStoredBooleanPreference(
  key: 'showPreview' | 'navigatorOpen',
  profile: BrowserLayoutProfile,
  fallback: boolean,
  storage: BrowserPreferenceStorage | null,
): boolean {
  if (!storage) {
    return fallback;
  }

  try {
    const stored = storage.getItem(buildBrowserPreferenceKey(key, profile));
    if (stored === '1') {
      return true;
    }
    if (stored === '0') {
      return false;
    }
  } catch {}

  return fallback;
}

function readStoredNarrowRoamPane(
  profile: BrowserLayoutProfile,
  storage: BrowserPreferenceStorage | null,
): BrowserNarrowRoamPane {
  if (!storage) {
    return resolveDefaultBrowserNarrowRoamPane();
  }

  try {
    const stored = storage.getItem(buildBrowserPreferenceKey('narrowRoamPane', profile));
    if (stored === 'history' || stored === 'wake') {
      return stored;
    }
  } catch {}

  return resolveDefaultBrowserNarrowRoamPane();
}

export function readBrowserChromePreferences(
  profile: BrowserLayoutProfile,
  storage: BrowserPreferenceStorage | null = resolveBrowserPreferenceStorage(),
): BrowserChromePreferences {
  return {
    viewMode: readStoredViewMode(profile, storage),
    showPreview: readStoredBooleanPreference(
      'showPreview',
      profile,
      resolveDefaultBrowserShowPreview(profile),
      storage,
    ),
    navigatorOpen: readStoredBooleanPreference(
      'navigatorOpen',
      profile,
      resolveDefaultBrowserNavigatorOpen(profile),
      storage,
    ),
    narrowRoamPane: readStoredNarrowRoamPane(profile, storage),
  };
}

function encodeBrowserChromePreferenceValue(value: BrowserChromePreferenceValue): string {
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  return value;
}

export function writeBrowserChromePreference(
  key: BrowserChromePreferenceKey,
  profile: BrowserLayoutProfile,
  value: BrowserChromePreferenceValue,
  storage: BrowserPreferenceStorage | null = resolveBrowserPreferenceStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      buildBrowserPreferenceKey(key, profile),
      encodeBrowserChromePreferenceValue(value),
    );
  } catch {}
}
