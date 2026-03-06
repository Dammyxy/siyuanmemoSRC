import { describe, expect, it } from 'vitest';
import { resolveTopicItemCardType } from '../topicItemPolicy';

const allDisabled = {
  mark: false,
  list: false,
  heading: false,
  superBlock: false,
} as const;

describe('topicItemPolicy', () => {
  it('keeps document blocks as topic even when native flashcard signals exist', () => {
    const result = resolveTopicItemCardType({
      blockType: 'd',
      matchedFlashcardKinds: ['mark', 'heading'],
      flashcardConfig: {
        mark: true,
        list: true,
        heading: true,
        superBlock: true,
      },
    });

    expect(result.cardType).toBe('topic');
  });

  it('keeps plugin semantic cards as item regardless of native toggle settings', () => {
    const brace = resolveTopicItemCardType({
      syntaxReasons: ['cloze-double-brace'],
      flashcardConfig: allDisabled,
    });
    const latex = resolveTopicItemCardType({
      syntaxReasons: ['cloze-latex-numbered'],
      flashcardConfig: allDisabled,
    });
    const direction = resolveTopicItemCardType({
      syntaxReasons: ['direction-symbol'],
      flashcardConfig: allDisabled,
    });

    expect(brace.cardType).toBe('item');
    expect(latex.cardType).toBe('item');
    expect(direction.cardType).toBe('item');
  });

  it('lets native mark detection follow the mark toggle', () => {
    const disabled = resolveTopicItemCardType({
      syntaxReasons: ['mark-equals'],
      matchedFlashcardKinds: ['mark'],
      flashcardConfig: allDisabled,
    });
    const enabled = resolveTopicItemCardType({
      syntaxReasons: ['siyuan-mark-span'],
      matchedFlashcardKinds: ['mark'],
      flashcardConfig: {
        ...allDisabled,
        mark: true,
      },
    });

    expect(disabled.cardType).toBe('topic');
    expect(enabled.cardType).toBe('item');
  });

  it('treats any enabled matched native kind as item', () => {
    const result = resolveTopicItemCardType({
      matchedFlashcardKinds: ['heading', 'list'],
      flashcardConfig: {
        ...allDisabled,
        list: true,
      },
    });

    expect(result.cardType).toBe('item');
    expect(result.matchedFlashcardKinds).toEqual(['heading', 'list']);
  });

  it('falls back to topic when all matched native kinds are disabled', () => {
    const result = resolveTopicItemCardType({
      matchedFlashcardKinds: ['heading', 'superBlock'],
      flashcardConfig: allDisabled,
    });

    expect(result.cardType).toBe('topic');
  });
});
