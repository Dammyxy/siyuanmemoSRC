// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Rating } from '@/types/card';
import type { SrsArenaRecommendation } from '@/types/arena';
import SrsArenaConflictDialog from '../SrsArenaConflictDialog.vue';

function buildRecommendation(): SrsArenaRecommendation {
  const now = 1_777_777_777_000;
  return {
    poolKey: 'srs::item',
    targetKind: 'item',
    leadingContestantId: 'fsrs-v6',
    ratingBasis: Rating.Hard,
    schedulingContextLabel: '队列上下文',
    weightedIntervalDays: 4.3,
    weightedDue: now + 4.3 * 86_400_000,
    currentSchedulerIntervalDays: 2,
    discrepancyRatio: 1.15,
    shouldHighlight: true,
    summary: 'Arena conflict',
    contestants: [
      {
        contestantId: 'fsrs-v6',
        label: 'FSRS v6',
        score: 0,
        weight: 1,
        confidence: 0.8,
        retrievability: 0.7,
        predictedPassProbability: 0.7,
        intervalDays: 6,
        due: now + 6 * 86_400_000,
        choices: [
          {
            rating: Rating.Good,
            due: now + 13 * 86_400_000,
            intervalDays: 13,
            state: 2,
            stability: 13,
            difficulty: 4,
          },
          {
            rating: Rating.Hard,
            due: now + 6 * 86_400_000,
            intervalDays: 6,
            state: 2,
            stability: 6,
            difficulty: 5,
          },
        ],
      },
    ],
  };
}

describe('SrsArenaConflictDialog', () => {
  it('emits weighted and contestant adopt payloads with selected rating schedules', async () => {
    const recommendation = buildRecommendation();
    const wrapper = mount(SrsArenaConflictDialog, {
      props: {
        recommendation,
        i18n: {},
      },
    });

    const weightedButton = wrapper.findAll('button').find((button) => button.text() === '采用 Arena 综合排期');
    await weightedButton?.trigger('click');

    expect(wrapper.emitted('adopt')?.[0]?.[0]).toMatchObject({
      kind: 'weighted',
      dueTimestamp: recommendation.weightedDue,
      scheduledDays: recommendation.weightedIntervalDays,
    });

    const contestantButton = wrapper.findAll('button').find((button) => button.text() === '采用');
    await contestantButton?.trigger('click');

    const hardChoice = recommendation.contestants[0]!.choices.find((choice) => choice.rating === Rating.Hard)!;
    expect(wrapper.emitted('adopt')?.[1]?.[0]).toMatchObject({
      kind: 'contestant',
      contestantId: 'fsrs-v6',
      dueTimestamp: hardChoice.due,
      scheduledDays: hardChoice.intervalDays,
    });
  });
});
