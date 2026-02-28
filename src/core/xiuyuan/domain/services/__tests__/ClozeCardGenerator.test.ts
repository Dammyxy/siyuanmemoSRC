import { describe, expect, it } from 'vitest';
import { ClozeCardGenerator } from '../ClozeCardGenerator';
import { ClozeDetector } from '@/utils/cloze-detector';

describe('ClozeCardGenerator', () => {
  const blockId = '20260215000000-abcdefg';

  it('generates math-safe placeholder and math answer for latex cloze', () => {
    const content = '$$E=\\cloze{c1}{MC^2}$$';
    const clozes = ClozeDetector.extractClozes(content);

    const result = ClozeCardGenerator.generateFaces(content, clozes, blockId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const face = result.value[0];
    expect(face.question).toContain('\\boxed{\\text{[...]}}');
    expect(face.question).not.toContain('<mark>');
    expect(face.answer).toBe('$$MC^2$$');
  });

  it('keeps mark placeholder behavior for non-latex cloze', () => {
    const content = '会泽==百家==，至公天下';
    const clozes = ClozeDetector.extractClozes(content);

    const result = ClozeCardGenerator.generateFaces(content, clozes, blockId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const face = result.value[0];
    expect(face.question).toContain('<mark>[...]</mark>');
    expect(face.answer).toBe('百家');
  });
});
