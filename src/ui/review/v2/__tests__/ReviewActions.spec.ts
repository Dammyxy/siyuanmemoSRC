import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { HIDE_CURRENT_IN_SCOPE_COMMAND_ID } from '@/core/queue/abstraction/customActionIds';
import ReviewActions from '../ReviewActions.vue';
import type { ReviewUIState } from '../types';
import type { FSRSCard } from '@/types/card';

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

function mountReviewActions(
  actions: ReviewUIState['actions'],
  isMobile = false,
  currentCard: FSRSCard | null = null,
  extraProps: Record<string, unknown> = {},
) {
  return mount(ReviewActions, {
    props: {
      actions,
      meta: { canBack: true, remainingSize: 3, transition: 'none' },
      isMobile,
      currentCard,
      i18n: {
        space: 'Space',
        enterKey: 'Enter',
      },
      ...extraProps,
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

describe('ReviewActions topic next action', () => {
  it('emits hide-current-in-scope command for filter-group topic cards', async () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
      cardMeta: {
        type: 'topic',
        cardType: 'topic',
        blockID: 'block-topic',
        cardID: 'card-topic',
      },
    }), false, null, {
      queueType: 'filter-group',
    });

    await wrapper.get('button[data-type="3"]').trigger('click');

    expect(wrapper.emitted('command')).toEqual([[HIDE_CURRENT_IN_SCOPE_COMMAND_ID]]);
    expect(wrapper.emitted('grade')).toBeFalsy();
  });

  it('keeps Good(3) behavior for non-filter-group topic cards', async () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
      cardMeta: {
        type: 'topic',
        cardType: 'topic',
        blockID: 'block-topic',
        cardID: 'card-topic',
      },
    }));

    await wrapper.get('button[data-type="3"]').trigger('click');

    expect(wrapper.emitted('grade')).toEqual([[3]]);
    expect(wrapper.emitted('command')).toBeFalsy();
  });
});

describe('ReviewActions layout', () => {
  it('renders the desktop reveal stage with native back, spacer, and show-answer actions', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
    }));

    const root = wrapper.get('.card__action--reveal');
    const revealButton = root.get('button[data-type="-1"]');

    expect(root.classes()).toContain('card__action--desktop');
    expect(root.find('.card__action-back--desktop-reveal').exists()).toBe(true);
    expect(root.find('.card__action-spacer').exists()).toBe(true);
    expect(root.find('skip-menu-button-stub').exists()).toBe(false);
    expect(revealButton.find('.card__icon').exists()).toBe(false);
    expect(revealButton.text()).toContain('Space');
    expect(revealButton.text()).toContain('Enter');
    expect(revealButton.classes()).toContain('card__action-button');
    expect(revealButton.classes()).toContain('card__action-main--reveal');
    expect(root.find('button[data-type="1"]').exists()).toBe(false);
  });

  it('renders the desktop rating stage with native left stack and native rating variants', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
    }));

    const root = wrapper.get('.card__action--rating');
    const columns = root.findAll('.card__action-column');
    const inlineStyle = root.attributes('style') ?? '';

    expect(root.classes()).toContain('card__action--desktop');
    expect(inlineStyle).not.toContain('--review-rating-columns');
    expect(columns).toHaveLength(5);
    expect(columns[0]?.classes()).toContain('card__action-column--stack');
    expect(columns[0]?.find('skip-menu-button-stub').exists()).toBe(true);
    expect(columns[0]?.get('button').classes()).toContain('card__action-back--stacked');
    expect(root.get('button[data-type="1"]').classes()).toContain('b3-button--error');
    expect(root.get('button[data-type="2"]').classes()).toContain('b3-button--warning');
    expect(root.get('button[data-type="3"]').classes()).toContain('b3-button--info');
    expect(root.get('button[data-type="4"]').classes()).toContain('b3-button--success');
    expect(root.get('button[data-type="4"]').classes()).toContain('card__action-button');
  });

  it('falls back to show-answer when grades are temporarily empty', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
      grades: [],
    }));

    const root = wrapper.get('.card__action--reveal');
    expect(root.find('button[data-type="-1"]').exists()).toBe(true);
    expect(root.find('skip-menu-button-stub').exists()).toBe(false);
  });

  it('keeps the reveal stage sticky on mobile', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
    }), true);

    const root = wrapper.get('.card__action--reveal');
    expect(root.classes()).toContain('card__action--mobile');
    expect(root.find('skip-menu-button-stub').exists()).toBe(true);
  });

  it('uses a native flex desktop layout for topic next-card mode without the mobile grid variable', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
      cardMeta: {
        type: 'topic',
        cardType: 'topic',
        blockID: 'block-topic',
        cardID: 'card-topic',
      },
    }));

    const root = wrapper.get('.card__action--rating');
    const columns = root.findAll('.card__action-column');
    expect(root.attributes('style') ?? '').not.toContain('--review-rating-columns');
    expect(root.classes()).toContain('card__action--desktop');
    expect(columns).toHaveLength(2);
    expect(columns[0]?.classes()).toContain('card__action-column--stack');
    expect(columns[0]?.find('skip-menu-button-stub').exists()).toBe(true);
    expect(wrapper.get('button[data-type="3"]').attributes('aria-label')).toBe('Space/Enter');
  });

  it('keeps the mobile rating layout on the grid variable for compact screens', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
    }), true);

    const root = wrapper.get('.card__action--rating');
    expect(root.classes()).toContain('card__action--mobile');
    expect(root.attributes('style')).toContain('--review-rating-columns: 5');
  });

  it('blurs the topic next-card button after pointer clicks so the highlight does not stick', async () => {
    const attachTarget = document.createElement('div');
    document.body.appendChild(attachTarget);

    const wrapper = mount(ReviewActions, {
      attachTo: attachTarget,
      props: {
        actions: createActions({
          showAnswer: true,
          cardMeta: {
            type: 'topic',
            cardType: 'topic',
            blockID: 'block-topic',
            cardID: 'card-topic',
          },
        }),
        meta: { canBack: true, remainingSize: 3, transition: 'none' },
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

    try {
      const button = wrapper.get('button[data-type="3"]').element as HTMLButtonElement;
      button.focus();
      expect(document.activeElement).toBe(button);

      button.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        detail: 1,
      }));
      await flushPromises();

      expect(document.activeElement).not.toBe(button);
    } finally {
      wrapper.unmount();
      attachTarget.remove();
    }
  });

  it('opens schedule dialog for regular cards when skip menu emits schedule', async () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
    }));

    wrapper.getComponent({ name: 'SkipMenuButton' }).vm.$emit('schedule');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('schedule-date-dialog-stub').exists()).toBe(true);
  });

  it('blocks schedule dialog for neural roam virtual cards', async () => {
    const wrapper = mountReviewActions(
      createActions({ showAnswer: false }),
      false,
      {
        id: 'virtual-1',
        blockId: 'virtual-1',
        due: Date.now(),
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: Date.now(),
        priority: 50,
        type: 'topic',
        tags: [],
        leechCount: 0,
        isLeech: false,
        skipped: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: {
          neuralContext: {
            isFlashcard: false,
          },
        },
      } as FSRSCard,
    );

    wrapper.getComponent({ name: 'SkipMenuButton' }).vm.$emit('schedule');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('schedule-date-dialog-stub').exists()).toBe(false);
  });

  it('uses ReviewApplicationService for schedule confirmation', async () => {
    const rescheduleCard = vi.fn(async () => undefined);
    const removeCard = vi.fn(async () => undefined);
    const wrapper = mountReviewActions(
      createActions({ showAnswer: false }),
      false,
      null,
      {
        plugin: {
          getContext: () => ({
            getReviewService: () => ({ rescheduleCard }),
          }),
        },
        queue: { removeCard },
      },
    );

    wrapper.getComponent({ name: 'SkipMenuButton' }).vm.$emit('schedule');
    await wrapper.vm.$nextTick();

    wrapper.getComponent({ name: 'ScheduleDateDialog' }).vm.$emit('confirm', {
      mode: 'direct',
      days: 2,
    });
    await flushPromises();

    expect(rescheduleCard).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({
        mode: 'direct',
        dueTimestamp: expect.any(Number),
      }),
    );
    expect(removeCard).toHaveBeenCalledWith('card-1');
    expect(wrapper.emitted('skip')).toBeTruthy();
  });
});
