import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reviewHeaderSource = readFileSync(
  resolve(process.cwd(), 'src/ui/review/v2/ReviewHeader.vue'),
  'utf8',
);

describe('ReviewHeader drag surface styles', () => {
  it('adds a native-dialog secondary row that hides repeated brand text and keeps controls above content chrome', () => {
    expect(reviewHeaderSource).toContain('.block__icons.siyuanmemo-review-header.siyuanmemo-review-header--native-dialog {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__brand-text {');
    expect(reviewHeaderSource).toContain('display: none;');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__summary {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__toolbar {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__summary-wrap,');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__mobile-close {');
  });
});
