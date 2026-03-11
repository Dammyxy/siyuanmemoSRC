import { describe, expect, it } from 'vitest';
import {
  buildBrowserPreferenceKey,
  resolveBrowserLayoutProfile,
  resolveDefaultBrowserNavigatorOpen,
  resolveDefaultBrowserShowPreview,
  resolveDefaultBrowserViewMode,
} from '../layoutProfile';

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
});
