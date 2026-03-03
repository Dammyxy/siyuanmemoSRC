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

function mountReviewActions(actions: ReviewUIState['actions'], isMobile = false) {
  return mount(ReviewActions, {
    props: {
      actions,
      meta: { canBack: true, remainingSize: 3, transition: 'none' },
      isMobile,
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

describe('ReviewActions layout', () => {
  it('keeps skip in the right container and show-answer in center with rating-width strategy', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
    }));

    const root = wrapper.get('.card__action');
    const children = Array.from(root.element.children).map((node) => (node as HTMLElement).className);
    expect(children[0]).toContain('card__action-back');
    expect(children[1]).toContain('card__action-center');
    expect(children[2]).toContain('card__action-right');

    const center = wrapper.get('.card__action-center');
    expect(center.attributes('style')).toContain('--review-action-columns: 4');
    expect(center.get('button[data-type="-1"]').classes()).toContain('card__action-main--reveal');

    const right = wrapper.get('.card__action-right');
    expect(right.find('skip-menu-button-stub').exists()).toBe(true);
  });

  it('keeps skip in the right container during grading state', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
    }));

    const center = wrapper.get('.card__action-center');
    expect(center.find('button[data-type="-1"]').exists()).toBe(false);
    expect(center.findAll('.card__action-column')).toHaveLength(4);

    const right = wrapper.get('.card__action-right');
    expect(right.find('skip-menu-button-stub').exists()).toBe(true);
  });

  it('falls back to show-answer when grades are temporarily empty', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
      grades: [],
    }));

    expect(wrapper.get('.card__action-center').find('button[data-type="-1"]').exists()).toBe(true);
    expect(wrapper.get('.card__action-right').find('skip-menu-button-stub').exists()).toBe(true);
  });

  it('applies the same right-side skip layout on mobile', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
    }), true);

    expect(wrapper.get('.card__action').classes()).toContain('card__action--mobile');
    expect(wrapper.get('.card__action-right').find('skip-menu-button-stub').exists()).toBe(true);
  });
});
