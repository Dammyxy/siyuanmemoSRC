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
});
