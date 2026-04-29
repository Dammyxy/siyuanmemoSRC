import { describe, expect, it } from 'vitest';
import {
  buildBrowserPreferenceKey,
  LEGACY_BROWSER_VIEW_MODE_KEY,
  resolveBrowserLayoutProfile,
  resolveDefaultBrowserNavigatorOpen,
  resolveDefaultBrowserShowPreview,
  resolveDefaultBrowserViewMode,
} from '../layoutProfile';
import {
  readBrowserChromePreferences,
  writeBrowserChromePreference,
  type BrowserPreferenceStorage,
} from '../browserChromePreferences';

function createMemoryStorage(initial: Record<string, string> = {}): BrowserPreferenceStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('SRSBrowser tab layout profile helpers', () => {
  it('resolves tab-wide when the tab surface is wide enough', () => {
    expect(resolveBrowserLayoutProfile({
      mode: 'tab',
      width: 1440,
      isMobile: false,
    })).toBe('tab-wide');
  });

  it('resolves tab-narrow when the tab surface is split-screen sized', () => {
    expect(resolveBrowserLayoutProfile({
      mode: 'tab',
      width: 1100,
      isMobile: false,
    })).toBe('tab-narrow');
  });

  it('keeps dock on its own layout profile', () => {
    expect(resolveBrowserLayoutProfile({
      mode: 'dock',
      width: 900,
      isMobile: false,
    })).toBe('dock');
  });

  it('uses separated defaults for wide and narrow tab workspaces', () => {
    expect(resolveDefaultBrowserViewMode('tab-wide')).toBe('hierarchy');
    expect(resolveDefaultBrowserViewMode('tab-narrow')).toBe('flat');
    expect(resolveDefaultBrowserShowPreview('tab-wide')).toBe(false);
    expect(resolveDefaultBrowserShowPreview('tab-narrow')).toBe(false);
    expect(resolveDefaultBrowserNavigatorOpen('tab-wide')).toBe(true);
    expect(resolveDefaultBrowserNavigatorOpen('tab-narrow')).toBe(false);
  });

  it('builds profile-specific preference keys', () => {
    expect(buildBrowserPreferenceKey('viewMode', 'dialog')).toBe('fsrs-card-browser:dialog:viewMode');
    expect(buildBrowserPreferenceKey('viewMode', 'tab-wide')).toBe('fsrs-card-browser:tab-wide:viewMode');
    expect(buildBrowserPreferenceKey('viewMode', 'tab-narrow')).toBe('fsrs-card-browser:tab-narrow:viewMode');
  });

  it('reads profile defaults when no chrome preferences exist', () => {
    expect(readBrowserChromePreferences('tab-wide', createMemoryStorage())).toEqual({
      viewMode: 'hierarchy',
      showPreview: false,
      navigatorOpen: true,
      narrowRoamPane: 'history',
    });
  });

  it('writes and reads profile-scoped chrome preferences', () => {
    const storage = createMemoryStorage();

    writeBrowserChromePreference('viewMode', 'tab-narrow', 'hierarchy', storage);
    writeBrowserChromePreference('showPreview', 'tab-narrow', true, storage);
    writeBrowserChromePreference('navigatorOpen', 'tab-narrow', false, storage);
    writeBrowserChromePreference('narrowRoamPane', 'tab-narrow', 'wake', storage);

    expect(storage.getItem(buildBrowserPreferenceKey('showPreview', 'tab-narrow'))).toBe('1');
    expect(storage.getItem(buildBrowserPreferenceKey('navigatorOpen', 'tab-narrow'))).toBe('0');
    expect(readBrowserChromePreferences('tab-narrow', storage)).toEqual({
      viewMode: 'hierarchy',
      showPreview: true,
      navigatorOpen: false,
      narrowRoamPane: 'wake',
    });
  });

  it('migrates legacy dialog view mode into the profile-scoped key', () => {
    const storage = createMemoryStorage({
      [LEGACY_BROWSER_VIEW_MODE_KEY]: 'hierarchy',
    });

    expect(readBrowserChromePreferences('dialog', storage).viewMode).toBe('hierarchy');
    expect(storage.getItem(buildBrowserPreferenceKey('viewMode', 'dialog'))).toBe('hierarchy');
  });

  it('falls back to defaults when preference storage throws', () => {
    const storage: BrowserPreferenceStorage = {
      getItem: () => {
        throw new Error('blocked storage');
      },
      setItem: () => {
        throw new Error('blocked storage');
      },
    };

    expect(readBrowserChromePreferences('dialog', storage)).toEqual({
      viewMode: 'flat',
      showPreview: true,
      navigatorOpen: false,
      narrowRoamPane: 'history',
    });
    expect(() => writeBrowserChromePreference('viewMode', 'dialog', 'hierarchy', storage)).not.toThrow();
  });
});
