import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reviewViewSource = readFileSync(
  resolve(process.cwd(), 'src/ui/review/v2/ReviewView.vue'),
  'utf8',
);

describe('ReviewView fullscreen header styles', () => {
  it('does not compress block icons or assume the old direct-child filler selector', () => {
    expect(reviewViewSource).toContain('.b3-dialog__container.siyuanmemo-review-dialog-container.fullscreen');
    expect(reviewViewSource).not.toContain('height: 32px;');
    expect(reviewViewSource).not.toContain('min-height: 32px;');
    expect(reviewViewSource).not.toContain('.block__icons > .fn__flex-1');
  });
});
