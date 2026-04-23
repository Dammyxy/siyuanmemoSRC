import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const browserToolbarStyles = readFileSync(
  resolve(process.cwd(), 'src/ui/browser/SRSBrowser.scss'),
  'utf8',
);

describe('BrowserToolbar style palette', () => {
  it('keeps the semantic primary action selectors for the brighter toolbar palette', () => {
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__action--page-select');
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__action--global-select.toolbar__action--active');
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__action--practice');
    expect(browserToolbarStyles).toContain('.card-browser__toolbar .toolbar__action--open-in-tab');
    expect(browserToolbarStyles).toContain('.b3-dialog__container.siyuanmemo-browser-shell-dialog .card-browser__toolbar .toolbar__action--page-select');
    expect(browserToolbarStyles).toContain('.b3-dialog__container.siyuanmemo-browser-shell-dialog .card-browser__toolbar .toolbar__action--open-in-tab');
  });
});
