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

const BROWSER_CHROME_PREFERENCES_VERSION_KEY = 'fsrs-card-browser:chromePreferencesVersion';
const BROWSER_CHROME_PREFERENCES_VERSION = '2';

function resolveBrowserPreferenceStorage(): BrowserPreferenceStorage | null {
  const candidate = (globalThis as { localStorage?: BrowserPreferenceStorage }).localStorage;
  return candidate || null;
}

function readStoredViewMode(
  profile: BrowserLayoutProfile,
  storage: BrowserPreferenceStorage | null,
  migrateLegacyFlatDefault: boolean,
): BrowserViewMode {
  if (!storage) {
    return resolveDefaultBrowserViewMode(profile);
  }

  const key = buildBrowserPreferenceKey('viewMode', profile);
  try {
    const stored = storage.getItem(key);
    if (stored === 'flat' || stored === 'hierarchy') {
      if (stored === 'flat' && migrateLegacyFlatDefault) {
        const migrated = resolveDefaultBrowserViewMode(profile);
        storage.setItem(key, migrated);
        return migrated;
      }
      return stored;
    }

    if (profile === 'dialog') {
      const legacy = storage.getItem(LEGACY_BROWSER_VIEW_MODE_KEY);
      if (legacy === 'flat' || legacy === 'hierarchy') {
        const migrated = legacy === 'flat' && migrateLegacyFlatDefault
          ? resolveDefaultBrowserViewMode(profile)
          : legacy;
        storage.setItem(key, migrated);
        return migrated;
      }
    }
  } catch {}

  return resolveDefaultBrowserViewMode(profile);
}

function shouldMigrateLegacyFlatDefault(storage: BrowserPreferenceStorage | null): boolean {
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(BROWSER_CHROME_PREFERENCES_VERSION_KEY) !== BROWSER_CHROME_PREFERENCES_VERSION;
  } catch {
    return false;
  }
}

function markBrowserChromePreferencesCurrent(storage: BrowserPreferenceStorage | null): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(BROWSER_CHROME_PREFERENCES_VERSION_KEY, BROWSER_CHROME_PREFERENCES_VERSION);
  } catch {}
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
  const migrateLegacyFlatDefault = shouldMigrateLegacyFlatDefault(storage);
  const preferences = {
    viewMode: readStoredViewMode(profile, storage, migrateLegacyFlatDefault),
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
  markBrowserChromePreferencesCurrent(storage);
  return preferences;
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
