import { describe, expect, it } from 'vitest';
import { ClozeDetector } from '../cloze-detector';

describe('ClozeDetector latex escape handling', () => {
  it('extracts numbered latex cloze with a single backslash command', () => {
    const content = '$$E=\\cloze{c1}{x}$$';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(1);
    expect(clozes[0]).toMatchObject({
      text: 'x',
      type: 'latex',
      start: content.indexOf('\\cloze'),
      end: content.indexOf('\\cloze') + '\\cloze{c1}{x}'.length,
    });
  });

  it('extracts numbered latex cloze with double backslashes without leaving a leading slash', () => {
    const content = '$$E=\\\\cloze{c1}{x}$$';
    const clozes = ClozeDetector.extractClozes(content);
    const command = '\\\\cloze{c1}{x}';
    const expectedStart = content.indexOf(command);

    expect(clozes).toHaveLength(1);
    expect(clozes[0]).toMatchObject({
      text: 'x',
      type: 'latex',
      start: expectedStart,
      end: expectedStart + command.length,
    });
  });

  it('keeps ordering stable with mixed latex cloze command escapes', () => {
    const content = 'A \\cloze{c1}{x} B \\\\cloze{c2}{y} C \\cloze{z}';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(3);
    expect(clozes.map((item) => item.text)).toEqual(['x', 'y', 'z']);
    expect(clozes[0].start).toBeLessThan(clozes[1].start);
    expect(clozes[1].start).toBeLessThan(clozes[2].start);
  });

  it('keeps single-argument latex cloze parsing compatibility', () => {
    const content = '$$\\cloze{x+y}$$';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(1);
    expect(clozes[0]).toMatchObject({
      text: 'x+y',
      type: 'latex',
      start: content.indexOf('\\cloze'),
      end: content.indexOf('\\cloze') + '\\cloze{x+y}'.length,
    });
  });

  it('prefers latex cloze when numbered latex argument contains double braces', () => {
    const content = 'P(A|B)=\\frac{P(B|A)\\cdot P(A)}{\\cloze{c1}{{P(B)}}}';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(1);
    expect(clozes[0]).toMatchObject({
      text: '{P(B)}',
      type: 'latex',
      start: content.indexOf('\\cloze'),
      end: content.indexOf('\\cloze') + '\\cloze{c1}{{P(B)}}'.length,
    });
  });

  it('keeps mixed non-overlapping clozes', () => {
    const content = 'alpha {{A}} + \\cloze{c1}{x}';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(2);
    expect(clozes.map((item) => item.type)).toEqual(['brace', 'latex']);
    expect(clozes.map((item) => item.text)).toEqual(['A', 'x']);
  });

  it('does not extract cloze from superblock triple braces', () => {
    const content = '{{{row 超级块测试1\n3333}}}';
    const clozes = ClozeDetector.extractClozes(content);

    expect(clozes).toHaveLength(0);
  });
});
