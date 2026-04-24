import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reviewHeaderSource = readFileSync(
  resolve(process.cwd(), 'src/ui/review/v2/ReviewHeader.vue'),
  'utf8',
);

describe('ReviewHeader native-dialog centering styles', () => {
  it('keeps the native-dialog secondary row brand-free while absolutely centering the summary chip', () => {
    expect(reviewHeaderSource).toContain('.block__icons.siyuanmemo-review-header.siyuanmemo-review-header--native-dialog {');
    expect(reviewHeaderSource).toContain('justify-content: flex-end;');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header__queue-switch {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header__queue-switch-text {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__summary-wrap {');
    expect(reviewHeaderSource).toContain('left: 50%;');
    expect(reviewHeaderSource).toContain('top: 50%;');
    expect(reviewHeaderSource).toContain('transform: translate(-50%, -50%);');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__summary {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__toolbar {');
    expect(reviewHeaderSource).toContain('margin-left: auto;');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header--native-dialog .siyuanmemo-review-header__mobile-close {');
    expect(reviewHeaderSource).not.toContain('siyuanmemo-review-header__brand');
  });
});
