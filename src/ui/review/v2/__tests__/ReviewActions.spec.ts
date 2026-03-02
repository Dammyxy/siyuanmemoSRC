import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReviewActions from '../ReviewActions.vue';
import type { ReviewUIState } from '../types';

function createActions(overrides: Partial<ReviewUIState['actions']> = {}): ReviewUIState['actions'] {
  return {
    showAnswer: false,
    grades: [
      { label: 'Again', value: 1, color: 'red', kb: '1', emoji: 'A' },
      { label: 'Hard', value: 2, color: 'orange', kb: '2', emoji: 'H' },
      { label: 'Good', value: 3, color: 'blue', kb: '3', emoji: 'G' },
      { label: 'Easy', value: 4, color: 'green', kb: '4', emoji: 'E' },
    ],
    menu: [],
    cardMeta: {
      type: 'item',
      cardType: 'item',
      blockID: 'block-1',
      cardID: 'card-1',
    },
    ...overrides,
  };
}

function mountReviewActions(actions: ReviewUIState['actions']) {
  return mount(ReviewActions, {
    props: {
      actions,
      meta: { canBack: true, remainingSize: 3, transition: 'none' },
      isMobile: false,
      i18n: {
        space: 'Space',
        enterKey: 'Enter',
      },
    },
    global: {
      stubs: {
        SkipMenuButton: true,
        InsertPositionDialog: true,
        ScheduleDateDialog: true,
        teleport: true,
      },
    },
  });
}

describe('ReviewActions hotkey tooltips', () => {
  it('shows complete tooltip mappings for all rating buttons in item mode', () => {
    const wrapper = mountReviewActions(createActions());

    expect(wrapper.get('button[data-type="1"]').attributes('aria-label')).toBe('1 / j / a');
    expect(wrapper.get('button[data-type="2"]').attributes('aria-label')).toBe('2 / k / s');
    expect(wrapper.get('button[data-type="3"]').attributes('aria-label')).toBe('3 / l / d / Space / Enter');
    expect(wrapper.get('button[data-type="4"]').attributes('aria-label')).toBe('4 / ; / f');
  });

  it('uses Space/Enter tooltip for concept next-card mode', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
      cardMeta: {
        type: 'concept',
        cardType: 'concept',
        blockID: 'block-concept',
        cardID: 'card-concept',
      },
    }));

    expect(wrapper.find('button[data-type="-1"]').exists()).toBe(false);
    expect(wrapper.get('button[data-type="3"]').attributes('aria-label')).toBe('Space/Enter');
  });
});
