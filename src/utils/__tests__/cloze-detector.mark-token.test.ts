import { describe, expect, it } from 'vitest';
import { ClozeDetector } from '../cloze-detector';

describe('ClozeDetector mark token handling', () => {
  it('extracts clozes from tokenized mark spans', () => {
    const content = 'Alpha <span data-type="text mark">Beta</span> Gamma';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(1);
    expect(clozes[0]).toMatchObject({
      text: 'Beta',
      type: 'mark',
      start: content.indexOf('<span data-type="text mark">'),
      end: content.indexOf('</span>') + '</span>'.length,
    });
  });

  it('extracts block-ref backed mark spans without losing the mark type', () => {
    const content = '<span data-type="block-ref mark" data-id="20240101010101-abcdefg">*</span>';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(1);
    expect(clozes[0]).toMatchObject({
      text: '*',
      type: 'mark',
    });
  });
});
