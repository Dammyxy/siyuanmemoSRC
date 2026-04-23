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
      '.b3-dialog__container.siyuanmemo-dialog-shell .b3-button:not(.card__action-button):not(.skip-menu-button__main):not(.skip-menu-button__trigger)',
    );
    expect(adminSkinSource).toContain(
      '.b3-dialog__container.siyuanmemo-dialog-shell .b3-button--cancel:not(.card__action-button):not(.skip-menu-button__main):not(.skip-menu-button__trigger)',
    );
  });
});
