import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const reviewContentSource = readFileSync(
  resolve(process.cwd(), 'src/ui/review/v2/ReviewContent.vue'),
  'utf8',
);

function getStyleBlock(selector: string): string {
  const pattern = new RegExp(`${selector}\\s*\\{[\\s\\S]*?\\n\\}`, 'm');
  return reviewContentSource.match(pattern)?.[0] || '';
}

describe('ReviewContent layout styles', () => {
  it('keeps the outer review content shell clipped and pushes scrolling into child panes', () => {
    const innerBlock = getStyleBlock('\\.fsrs-review-v2-content__inner');

    expect(innerBlock).toContain('overflow: hidden;');
    expect(innerBlock).toContain('overflow-x: hidden;');
    expect(innerBlock).not.toContain('overflow: auto;');
    expect(reviewContentSource).toContain('.fsrs-review-v2-content__multi-cloze');
    expect(reviewContentSource).toContain('.fsrs-review-v2-content__concept-definition-card');
    expect(reviewContentSource).toContain('.fsrs-review-v2-content__concept-card');
    expect(reviewContentSource).toContain('overflow-y: auto;');
  });
});
