import { describe, expect, it } from 'vitest';
import {
  extractSafeCardSourceGrammarFields,
  parseCardSourceGrammar,
  replaceDefinitionInCardSourceGrammar,
  replaceDescriptorInCardSourceGrammar,
  replaceItemInCardSourceGrammar,
  tokenizeCardSourceOperators,
} from '../sourceGrammar';

describe('Card Source Grammar', () => {
  it('matches longest operators before shorter prefixes', () => {
    const tokens = tokenizeCardSourceOperators('cue ;<> answer');

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual(expect.objectContaining({
      canonical: ';<>',
      raw: ';<>',
      relationKinds: ['descriptor-forward', 'descriptor-reverse'],
    }));
  });

  it('recognizes fullwidth, Chinese-angle, and mixed-width operator variants', () => {
    expect(tokenizeCardSourceOperators(`concept \uFF1A\u300B definition`)[0]?.canonical).toBe(':>');
    expect(tokenizeCardSourceOperators(`cue \uFF1B\u300A answer`)[0]?.canonical).toBe(';<');
    expect(tokenizeCardSourceOperators(`cue \uFF1B<\u300B answer`)[0]?.canonical).toBe(';<>');
    expect(tokenizeCardSourceOperators(`question \uFF1E\uFF1E answer`)[0]?.canonical).toBe('>>');
  });

  it('ignores operator-like text inside fenced code, inline code, and math', () => {
    const source = [
      '```',
      'code :: ignored',
      '```',
      '`inline ;; ignored`',
      '$math :< ignored$',
      'concept :> definition',
    ].join('\n');

    const tokens = tokenizeCardSourceOperators(source);

    expect(tokens.map((token) => token.canonical)).toEqual([':>']);
  });

  it('emits blocking invalid-source-grammar for more than one main operator', () => {
    const parsed = parseCardSourceGrammar('concept :: definition ;; descriptor');

    expect(parsed.operators.map((operator) => operator.canonical)).toEqual(['::', ';;']);
    expect(parsed.issues).toEqual([
      expect.objectContaining({
        code: 'invalid-source-grammar',
        severity: 'blocking',
      }),
    ]);
  });

  it('extracts safe item, definition, and descriptor fields from one source operator', () => {
    expect(extractSafeCardSourceGrammarFields({
      source: 'Question >> Answer',
      family: 'item',
    })).toEqual(expect.objectContaining({
      ok: true,
      family: 'item',
      fields: [
        { role: 'question', value: 'Question' },
        { role: 'answer', value: 'Answer' },
      ],
      contentShape: 'item',
    }));

    expect(extractSafeCardSourceGrammarFields({
      source: 'Answer << Question',
      family: 'item',
    })).toEqual(expect.objectContaining({
      ok: true,
      fields: [
        { role: 'question', value: 'Question' },
        { role: 'answer', value: 'Answer' },
      ],
    }));

    expect(extractSafeCardSourceGrammarFields({
      source: '((20240101010101-abcdefg)) :> Definition',
      family: 'definition',
    })).toEqual(expect.objectContaining({
      ok: true,
      family: 'definition',
      fields: [
        { role: 'definition', value: 'Definition' },
      ],
      contentShape: 'definition',
    }));

    expect(extractSafeCardSourceGrammarFields({
      source: 'Cue ;<> Answer',
      family: 'descriptor',
    })).toEqual(expect.objectContaining({
      ok: true,
      family: 'descriptor',
      fields: [
        { role: 'cue', value: 'Cue' },
        { role: 'answer', value: 'Answer' },
      ],
      contentShape: 'descriptor-explicit',
    }));
  });

  it('extracts descriptor group leaves only when caller proves leaf context', () => {
    expect(extractSafeCardSourceGrammarFields({
      source: 'Cue -> Answer',
      family: 'descriptor',
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'unsafe-field-identity',
    }));

    expect(extractSafeCardSourceGrammarFields({
      source: 'Cue -> Answer',
      family: 'descriptor',
      descriptorGroupLeaf: true,
    })).toEqual(expect.objectContaining({
      ok: true,
      fields: [
        { role: 'cue', value: 'Cue' },
        { role: 'answer', value: 'Answer' },
      ],
      contentShape: 'descriptor-group-arrow',
    }));

    expect(extractSafeCardSourceGrammarFields({
      source: 'Answer only',
      family: 'descriptor',
      descriptorGroupLeaf: true,
    })).toEqual(expect.objectContaining({
      ok: true,
      fields: [
        { role: 'answer', value: 'Answer only' },
      ],
      contentShape: 'descriptor-group-plain',
    }));
  });

  it('falls back when grammar is invalid or source operator family mismatches', () => {
    expect(extractSafeCardSourceGrammarFields({
      source: 'Question >> Answer ;; Extra',
      family: 'item',
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'invalid-source-grammar',
      issues: [
        expect.objectContaining({
          code: 'invalid-source-grammar',
          severity: 'blocking',
        }),
      ],
    }));

    expect(extractSafeCardSourceGrammarFields({
      source: 'Cue ;; Answer',
      family: 'item',
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'unsafe-field-identity',
    }));
  });

  it('rewrites only definition content while preserving concept refs and operator spacing', () => {
    expect(replaceDefinitionInCardSourceGrammar({
      source: '((20240101010101-abcdefg "TCP")) :< Reliable transport protocol.',
      definition: 'Connection-oriented transport.',
    })).toEqual({
      ok: true,
      source: '((20240101010101-abcdefg "TCP")) :< Connection-oriented transport.',
    });

    expect(replaceDefinitionInCardSourceGrammar({
      source: '((20240101010101-abcdefg))\uFF1A\u300B  旧定义  {: id="block-1"}',
      definition: '新定义',
    })).toEqual({
      ok: true,
      source: '((20240101010101-abcdefg))\uFF1A\u300B  新定义  {: id="block-1"}',
    });
  });

  it('rewrites descriptor cue and answer while preserving operator and leaf style', () => {
    expect(replaceDescriptorInCardSourceGrammar({
      source: 'Kernel role ;<> Controls hardware access',
      cue: 'Kernel responsibility',
      answer: 'Coordinates hardware access',
    })).toEqual({
      ok: true,
      source: 'Kernel responsibility ;<> Coordinates hardware access',
    });

    expect(replaceDescriptorInCardSourceGrammar({
      source: 'Cue  ->  Answer  {: id="leaf-1"}',
      cue: 'Signal',
      answer: 'Meaning',
      descriptorGroupLeaf: true,
    })).toEqual({
      ok: true,
      source: 'Signal  ->  Meaning  {: id="leaf-1"}',
    });

    expect(replaceDescriptorInCardSourceGrammar({
      source: '  Answer only  {: id="leaf-2"}',
      answer: 'Updated answer',
      descriptorGroupLeaf: true,
    })).toEqual({
      ok: true,
      source: '  Updated answer  {: id="leaf-2"}',
    });
  });

  it('rewrites item question and answer while preserving operator direction, spacing, and attrs', () => {
    expect(replaceItemInCardSourceGrammar({
      source: 'Question >> Answer',
      question: 'Updated question',
      answer: 'Updated answer',
    })).toEqual({
      ok: true,
      source: 'Updated question >> Updated answer',
    });

    expect(replaceItemInCardSourceGrammar({
      source: '  Answer  <<  Question  {: id="item-1"}',
      question: 'Updated question',
      answer: 'Updated answer',
    })).toEqual({
      ok: true,
      source: '  Updated answer  <<  Updated question  {: id="item-1"}',
    });

    expect(replaceItemInCardSourceGrammar({
      source: 'Question <> Answer',
      question: 'Both question',
      answer: 'Both answer',
    })).toEqual({
      ok: true,
      source: 'Both question <> Both answer',
    });
  });

  it('rejects unsafe item rewrites instead of guessing a source shape', () => {
    expect(replaceItemInCardSourceGrammar({
      source: 'Question >> Answer << Extra',
      question: 'Updated question',
      answer: 'Updated answer',
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'invalid-source-grammar',
      issues: [
        expect.objectContaining({
          code: 'invalid-source-grammar',
          severity: 'blocking',
        }),
      ],
    }));

    expect(replaceItemInCardSourceGrammar({
      source: 'Question without operator',
      question: 'Updated question',
      answer: 'Updated answer',
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'unsafe-field-identity',
    }));
  });
});
