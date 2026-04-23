import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reviewHeaderSource = readFileSync(
  resolve(process.cwd(), 'src/ui/review/v2/ReviewHeader.vue'),
  'utf8',
);

describe('ReviewHeader drag surface styles', () => {
  it('keeps the drag surface absolute and the interactive controls above it', () => {
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header__drag-surface {');
    expect(reviewHeaderSource).toContain('position: absolute;');
    expect(reviewHeaderSource).toContain('inset: 0;');
    expect(reviewHeaderSource).toContain('z-index: 1;');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header__summary-wrap {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header__toolbar {');
    expect(reviewHeaderSource).toContain('.siyuanmemo-review-header__mobile-close {');
    expect(reviewHeaderSource).toContain('z-index: 3;');
  });
});
