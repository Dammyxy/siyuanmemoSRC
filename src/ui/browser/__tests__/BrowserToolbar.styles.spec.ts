import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const browserToolbarStyles = readFileSync(
  resolve(process.cwd(), 'src/ui/browser/SRSBrowser.scss'),
  'utf8',
);

describe('BrowserToolbar style palette', () => {
  it('keeps AI and practice highlighted while leaving view-toggle and open neutral', () => {
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__action--ai');
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__action--practice');
    expect(browserToolbarStyles).toContain('background: color-mix(in srgb, var(--toolbar-global-accent) 66%, var(--b3-theme-background)) !important;');
    expect(browserToolbarStyles).toContain('background: color-mix(in srgb, var(--toolbar-practice-accent) 70%, var(--b3-theme-background)) !important;');
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__center');
    expect(browserToolbarStyles).toContain('background: color-mix(in srgb, var(--toolbar-page-accent) 6%, var(--b3-theme-background));');
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__left .filter-button.filter-button--active');
    expect(browserToolbarStyles).not.toContain('.card-browser__toolbar .toolbar__action--view-toggle,');
    expect(browserToolbarStyles).not.toContain('.card-browser__toolbar .toolbar__action--open-in-tab,');
    expect(browserToolbarStyles).not.toContain('.b3-dialog__container.siyuanmemo-browser-shell-dialog .card-browser__toolbar .toolbar__action--view-toggle');
    expect(browserToolbarStyles).not.toContain('.b3-dialog__container.siyuanmemo-browser-shell-dialog .card-browser__toolbar .toolbar__action--open-in-tab');
  });
});
