import { describe, expect, it } from 'vitest';
import { CardState } from '@/types/card';
import type { RiffBlock } from '@/core/siyuan/riff';
import { RiffMapper } from '../RiffMapper';

describe('RiffMapper FSRS schedule repair', () => {
  it('repairs Review riff cards with zero stability before they enter local storage', () => {
    const card = RiffMapper.toDomain({
      id: '20260426233833-riffmap',
      box: 'box',
      path: '/docs/test.sy',
      hPath: '/test',
      content: 'malformed review card',
      created: '2026-02-15T15:38:33.000Z',
      updated: '2026-04-26T15:38:33.000Z',
      type: 'p',
      subType: '',
      ial: {
        'custom-card-type': 'item',
      },
      riffCard: {
        id: 'riff-card-1',
        blockID: '20260426233833-riffmap',
        deckID: 'deck',
        due: '2026-04-26T15:38:33.000Z',
        lastReview: '2026-02-15T15:38:33.000Z',
        stability: 0,
        difficulty: 0,
        reps: 4,
        lapses: 0,
        state: CardState.Review,
        elapsedDays: 0,
        scheduledDays: 0,
      },
    } as RiffBlock);

    expect(card.stability).toBe(70);
    expect(card.scheduledDays).toBe(70);
    expect(card.difficulty).toBe(5);
  });

  it('imports Riff topic cards onto the a-factor scheduler boundary', () => {
    const card = RiffMapper.toDomain({
      id: '20260426233833-rifftopic',
      box: 'box',
      path: '/docs/test.sy',
      hPath: '/test',
      content: 'topic card',
      created: '2026-02-15T15:38:33.000Z',
      updated: '2026-04-26T15:38:33.000Z',
      type: 'p',
      subType: '',
      ial: {
        'custom-card-type': 'topic',
      },
    } as RiffBlock);

    expect(card.schedulerType).toBe('a-factor-v2');
    expect(card.aFactor).toBe(2.5);
    expect(card.schedulerMeta).toEqual({
      topic: {
        afs: [2.5],
        of: 2.5,
        optimalInterval: 1,
      },
    });
  });
});
