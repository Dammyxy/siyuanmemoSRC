import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const adminSkinSource = readFileSync(
  resolve(process.cwd(), 'src/ui/shared/siyuanmemo-admin-skin.scss'),
  'utf8',
);

describe('siyuanmemo admin skin review dialog exemptions', () => {
  it('keeps review action buttons out of the dialog-shell button reset', () => {
    expect(adminSkinSource).toContain(
      '.b3-dialog__container.siyuanmemo-dialog-shell .b3-button:not(.card__action-button):not(.skip-menu-button__main):not(.skip-menu-button__trigger):not(.toolbar__action)',
    );
    expect(adminSkinSource).toContain(
      '.b3-dialog__container.siyuanmemo-dialog-shell .b3-button--cancel:not(.card__action-button):not(.skip-menu-button__main):not(.skip-menu-button__trigger):not(.toolbar__action)',
    );
    expect(adminSkinSource).toContain(
      '.b3-dialog__container.siyuanmemo-dialog-shell .b3-button--outline:not(.card__action-button):not(.toolbar__action)',
    );
  });

  it('keeps the native review dialog titlebar visible and pulls the close icon back into the header lane', () => {
    expect(adminSkinSource).toContain(
      '.b3-dialog__container.siyuanmemo-review-dialog-container .b3-dialog__header',
    );
    expect(adminSkinSource).toContain('min-height: 46px;');
    expect(adminSkinSource).toContain('padding: 0 48px 0 12px;');
    expect(adminSkinSource).toContain(
      '.b3-dialog__container.siyuanmemo-review-dialog-container .b3-dialog__close',
    );
    expect(adminSkinSource).toContain('right: 12px;');
  });
});
