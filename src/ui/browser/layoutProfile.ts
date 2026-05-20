import type { BrowserMode, BrowserViewMode } from './types';

export type BrowserLayoutProfile = 'dialog' | 'tab-wide' | 'tab-narrow' | 'dock';
export type BrowserChromePreferenceKey = 'viewMode' | 'showPreview' | 'navigatorOpen' | 'narrowRoamPane';
export type BrowserNarrowRoamPane = 'history' | 'wake';

export const TAB_NARROW_LAYOUT_BREAKPOINT = 1280;
export const LEGACY_BROWSER_VIEW_MODE_KEY = 'fsrs-card-browser:viewMode';

export function resolveBrowserLayoutProfile(options: {
  mode: BrowserMode;
  width: number;
  isMobile?: boolean;
}): BrowserLayoutProfile {
  if (options.isMobile) {
    return 'dialog';
  }

  if (options.mode === 'dialog') {
    return 'dialog';
  }

  if (options.mode === 'dock') {
    return 'dock';
  }

  return options.width >= TAB_NARROW_LAYOUT_BREAKPOINT ? 'tab-wide' : 'tab-narrow';
}

export function resolveDefaultBrowserViewMode(_profile: BrowserLayoutProfile): BrowserViewMode {
  return 'hierarchy';
}

export function resolveDefaultBrowserShowPreview(profile: BrowserLayoutProfile): boolean {
  return profile === 'dialog';
}

export function resolveDefaultBrowserNavigatorOpen(profile: BrowserLayoutProfile): boolean {
  return profile === 'tab-wide';
}

export function resolveDefaultBrowserNarrowRoamPane(): BrowserNarrowRoamPane {
  return 'history';
}

export function buildBrowserPreferenceKey(
  key: BrowserChromePreferenceKey,
  profile: BrowserLayoutProfile,
): string {
  return `fsrs-card-browser:${profile}:${key}`;
}
