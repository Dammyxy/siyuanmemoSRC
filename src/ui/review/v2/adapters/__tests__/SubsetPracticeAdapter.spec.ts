import { describe, expect, it } from 'vitest';
import { SubsetPracticeAdapter } from '../SubsetPracticeAdapter';
import type { AdapterContext } from '../../types';

function createContext(): AdapterContext {
  return {
    showAnswer: false,
    session: {
      startTime: Date.now(),
      resumed: false,
      initialTotal: 5,
      answeredCount: 0,
      correctCount: 0,
      baselineVersion: 0,
      reviewHistory: [],
    },
  };
}

function createQueue(size: number) {
  return {
    getStats: async () => ({ size, label: `${size} due` }),
    getUIConfig: () => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    }),
  };
}

describe('SubsetPracticeAdapter', () => {
  it('emits remaining badge without compact summary and sets priority aria label', async () => {
    const adapter = new SubsetPracticeAdapter();
    const ui = await adapter.toUIState(
      createQueue(3),
      {
        id: 'card-1',
        cardID: 'card-1',
        blockID: 'block-1',
        priority: 12,
        type: 'item',
      },
      createContext(),
    );

    expect(ui.header.counterSummary).toBeNull();
    expect(ui.header.counterBadges).toEqual([
      {
        id: 'remaining',
        label: '\u5269\u4f59',
        kind: 'ratio',
        tone: 'neutral',
        text: '3/5',
        remaining: 3,
        total: 5,
        ariaLabel: '\u5269\u4f59 3/5',
      },
    ]);
    expect(ui.header.priorityBadge).toEqual({
      label: 'P',
      value: '12',
      priority: 12,
      ariaLabel: 'Priority 12',
    });
  });

  it('falls back to same-block answer panes for native builtin-riff-sync subset cards', async () => {
    const adapter = new SubsetPracticeAdapter();
    const ui = await adapter.toUIState(
      createQueue(2),
      {
        id: 'card-riff',
        cardID: 'card-riff',
        blockID: 'block-riff',
        priority: 10,
        type: 'item',
        meta: {
          templateID: 'builtin-riff-sync',
          answerBlockID: 'child-answer-block',
        },
      },
      createContext(),
    );

    expect(ui.content.answerBlockID).toBe('block-riff');
  });
});
