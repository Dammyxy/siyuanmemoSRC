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
    expect(face.answer).toContain('$$E=');
    expect(face.answer).toContain('{\\color{#166534}MC^2}');
    expect(face.answer).toContain('$$');
  });

  it('keeps mark placeholder behavior for non-latex cloze', () => {
    const content = 'alpha ==beta== gamma';
    const clozes = ClozeDetector.extractClozes(content);

    const result = ClozeCardGenerator.generateFaces(content, clozes, blockId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const face = result.value[0];
    expect(face.question).toContain('<mark>[...]</mark>');
    expect(face.answer).toBe('beta');
  });

  it('produces equivalent faces for single and double escaped latex cloze commands', () => {
    const singleSlashContent = '$$E=\\cloze{c1}{MC^2}$$';
    const doubleSlashContent = '$$E=\\\\cloze{c1}{MC^2}$$';

    const singleResult = ClozeCardGenerator.generateFaces(
      singleSlashContent,
      ClozeDetector.extractClozes(singleSlashContent),
      blockId
    );
    const doubleResult = ClozeCardGenerator.generateFaces(
      doubleSlashContent,
      ClozeDetector.extractClozes(doubleSlashContent),
      blockId
    );

    expect(singleResult.ok).toBe(true);
    expect(doubleResult.ok).toBe(true);
    if (!singleResult.ok || !doubleResult.ok) return;

    expect(doubleResult.value).toHaveLength(1);
    expect(doubleResult.value[0].question).toBe(singleResult.value[0].question);
    expect(doubleResult.value[0].answer).toBe(singleResult.value[0].answer);
    expect(doubleResult.value[0].question).not.toContain('\\\\boxed');
    expect(doubleResult.value[0].answer).not.toContain('\\MC^2');
    expect(doubleResult.value[0].answer).toContain('{\\color{#166534}MC^2}');
  });

  it('adds display math delimiters when latex cloze source has none', () => {
    const content = 'P(A|B)=\\cloze{c1}{P(B|A)}*P(A)/P(B)';
    const clozes = ClozeDetector.extractClozes(content);

    const result = ClozeCardGenerator.generateFaces(content, clozes, blockId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const face = result.value[0];
    expect(face.question.startsWith('$$')).toBe(true);
    expect(face.question.endsWith('$$')).toBe(true);
    expect(face.answer.startsWith('$$')).toBe(true);
    expect(face.answer.endsWith('$$')).toBe(true);
  });

  it('generates one intact face when latex cloze body uses double braces', () => {
    const content = 'P(A|B)=\\frac{P(B|A)\\cdot P(A)}{\\cloze{c1}{{P(B)}}}';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(1);
    const result = ClozeCardGenerator.generateFaces(content, clozes, blockId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const face = result.value[0];
    expect(face.question).toContain('\\boxed{\\text{[...]}}');
    expect(face.question).not.toContain('<mark>');
    expect(face.question.startsWith('$$')).toBe(true);
    expect(face.question.endsWith('$$')).toBe(true);
    expect(face.answer).toContain('{\\color{#166534}{P(B)}}');
    expect(face.answer.startsWith('$$')).toBe(true);
    expect(face.answer.endsWith('$$')).toBe(true);
  });
});
