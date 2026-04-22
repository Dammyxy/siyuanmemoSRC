import { describe, expect, it } from 'vitest';
import { detectAnswerSyntax } from '../detectionRules';

describe('detectionRules', () => {
  it('detects numbered latex cloze syntax as item answer syntax', () => {
    const reason = detectAnswerSyntax('\\cloze{c1}{x+y}', '', 'basic');
    expect(reason).toBe('cloze-latex-numbered');
  });

  it('does not detect one-argument latex cloze syntax', () => {
    const reason = detectAnswerSyntax('\\cloze{x+y}', '', 'extended');
    expect(reason).toBeNull();
  });

  it('does not treat plain formula text as answer syntax', () => {
    const reason = detectAnswerSyntax('E = mc^2', 'E = mc^2', 'extended');
    expect(reason).toBeNull();
  });

  it('detects tokenized Siyuan mark spans as answer syntax', () => {
    const reason = detectAnswerSyntax(
      '<span data-type="text mark">重点</span>',
      '<span data-type="block-ref mark" data-id="20240101010101-abcdefg">*</span>',
      'extended',
    );
    expect(reason).toBe('siyuan-mark-span');
  });
});
