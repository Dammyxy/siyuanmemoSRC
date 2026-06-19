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
  stubs: Record<string, unknown> = {},
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
        SkipMenuButton: {
          name: 'SkipMenuButton',
          template: '<button class="skip-menu-button-stub" @click="$emit(\'togglePanel\')"></button>',
          emits: ['skip', 'togglePanel'],
        },
        InsertPositionDialog: true,
        ScheduleDateDialog: true,
        teleport: true,
        ...stubs,
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
  it('renders the desktop reveal stage as a three-column layout with a right-side skip split control', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
    }));

    const root = wrapper.get('.card__action--reveal');
    const revealButton = root.get('button[data-type="-1"]');

    expect(root.classes()).toContain('card__action--desktop');
    expect(root.find('.card__action-back--desktop-reveal').exists()).toBe(true);
    expect(root.find('.card__action-spacer').exists()).toBe(false);
    expect(root.find('.card__action-skip--desktop-reveal').exists()).toBe(true);
    expect(root.find('.skip-menu-button-stub').exists()).toBe(true);
    expect(revealButton.find('.card__icon').text()).toBe('👀');
    expect(revealButton.text()).toContain('Space');
    expect(revealButton.text()).toContain('Enter');
    expect(revealButton.classes()).toContain('card__action-button');
    expect(revealButton.classes()).toContain('card__action-main--reveal');
    expect(revealButton.classes()).toContain('card__action-main--reveal-stacked');
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
    const skipStub = columns[0]?.getComponent({ name: 'SkipMenuButton' });
    expect(skipStub?.attributes('desktop-stacked')).toBeUndefined();
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
    expect(root.find('.skip-menu-button-stub').exists()).toBe(true);
  });

  it('disables primary actions while the next card is being prepared', async () => {
    const wrapper = mountReviewActions(createActions(), false, null, {
      meta: {
        canBack: true,
        remainingSize: 3,
        transition: 'none',
        advancePending: {
          active: true,
          reason: 'grade',
          startedAt: Date.now(),
        },
      },
    });

    const goodButton = wrapper.get('button[data-type="3"]');
    expect(goodButton.attributes('disabled')).toBeDefined();

    await goodButton.trigger('click');
    expect(wrapper.emitted('grade')).toBeFalsy();
  });

  it('keeps the reveal stage sticky on mobile', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
    }), true);

    const root = wrapper.get('.card__action--reveal');
    expect(root.classes()).toContain('card__action--mobile');
    expect(root.find('.skip-menu-button-stub').exists()).toBe(true);
  });

  it('spans the mobile topic next-card action across the rating area', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: true,
      cardMeta: {
        type: 'topic',
        cardType: 'topic',
        blockID: 'block-topic',
        cardID: 'card-topic',
      },
    }), true);

    const root = wrapper.get('.card__action--rating');
    const columns = root.findAll('.card__action-column');

    expect(root.classes()).toContain('card__action--mobile');
    expect(columns).toHaveLength(2);
    expect(columns[1]?.classes()).toContain('card__action-column--topic-next');
    expect(wrapper.get('button[data-type="3"]').text()).toContain('下一张');
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
    const skipStub = columns[0]?.getComponent({ name: 'SkipMenuButton' });
    expect(skipStub?.attributes('desktop-stacked')).toBeUndefined();
    expect(wrapper.get('button[data-type="3"]').attributes('aria-label')).toBe('Space/Enter');
  });

  it('keeps native mobile rating density with back, skip, and due dates', () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
      grades: [
        { label: 'Again', value: 1, color: 'red', kb: '1', emoji: 'A', nextDue: '2026-05-22' },
        { label: 'Hard', value: 2, color: 'orange', kb: '2', emoji: 'H', nextDue: '2026-05-23' },
        { label: 'Good', value: 3, color: 'blue', kb: '3', emoji: 'G', nextDue: '2026-05-24' },
        { label: 'Easy', value: 4, color: 'green', kb: '4', emoji: 'E', nextDue: '2026-05-25' },
      ],
    }), true);

    const root = wrapper.get('.card__action--rating');
    const columns = root.findAll('.card__action-column');
    const dueMeta = root.findAll('.card__action-meta')
      .map((node) => node.text())
      .filter((text) => text.length > 0);

    expect(root.classes()).toContain('card__action--mobile');
    expect(root.attributes('style') ?? '').not.toContain('--review-rating-columns');
    expect(columns).toHaveLength(5);
    expect(columns[0]?.classes()).toContain('card__action-column--stack');
    expect(columns[0]?.find('.card__action-back--stacked').exists()).toBe(true);
    expect(columns[0]?.findComponent({ name: 'SkipMenuButton' }).exists()).toBe(true);
    expect(dueMeta).toEqual(['2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25']);
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

  it('opens the inline skip panel for regular cards when the skip trigger toggles', async () => {
    const wrapper = mountReviewActions(createActions({
      showAnswer: false,
    }), false, null, {
      meta: { canBack: true, remainingSize: 3, transition: 'none' },
      queue: {
        insertAt: vi.fn(async () => undefined),
      },
    });

    wrapper.getComponent({ name: 'SkipMenuButton' }).vm.$emit('togglePanel');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.review-skip-panel').exists()).toBe(true);
    expect(wrapper.find('.review-skip-panel__card--schedule').exists()).toBe(true);
  });

  it('blocks quick schedule controls for neural roam virtual cards', async () => {
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
      {
        meta: { canBack: true, remainingSize: 3, transition: 'none' },
        queue: {
          insertAt: vi.fn(async () => undefined),
        },
      },
    );

    wrapper.getComponent({ name: 'SkipMenuButton' }).vm.$emit('togglePanel');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.review-skip-panel').exists()).toBe(true);
    expect(wrapper.find('.review-skip-panel__card--schedule').exists()).toBe(false);
  });

  it('fills a date from quick schedule controls and waits for confirmation', async () => {
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
        queue: {
          insertAt: vi.fn(async () => undefined),
          removeCard,
        },
      },
    );

    wrapper.getComponent({ name: 'SkipMenuButton' }).vm.$emit('togglePanel');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.review-skip-panel__date-presets .review-skip-panel__preset')[0]!.trigger('click');
    await flushPromises();

    expect(rescheduleCard).not.toHaveBeenCalled();
    expect(removeCard).not.toHaveBeenCalled();
    expect(wrapper.emitted('skip')).toBeFalsy();
    expect((wrapper.get('.review-skip-panel__date-custom input').element as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await wrapper.get('.review-skip-panel__date-custom .b3-button').trigger('click');
    await flushPromises();

    expect(rescheduleCard).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({
        mode: 'direct',
        dueTimestamp: expect.any(Number),
      }),
    );
    expect(removeCard).not.toHaveBeenCalled();
    expect(wrapper.emitted('skip')).toBeFalsy();
    expect(wrapper.emitted('scheduled')).toEqual([[
      expect.objectContaining({
        cardId: 'card-1',
        blockId: 'block-1',
        dueTimestamp: expect.any(Number),
      }),
    ]]);
  });
});

describe('ReviewActions skip later panel', () => {
  it('keeps primary skip one-click and toggles the inline later panel from the trailing control', async () => {
    const wrapper = mountReviewActions(
      createActions({ showAnswer: true }),
      false,
      null,
      {
        meta: { canBack: true, remainingSize: 47, transition: 'none' },
        queue: {
          insertAt: vi.fn(async () => undefined),
        },
      },
      {
        SkipMenuButton: false,
      },
    );

    expect(wrapper.find('.review-skip-panel').exists()).toBe(false);

    await wrapper.get('.skip-menu-button__main').trigger('click');
    expect(wrapper.emitted('skip')).toEqual([[]]);
    expect(wrapper.find('.review-skip-panel').exists()).toBe(false);

    await wrapper.get('.skip-menu-button__trigger').trigger('click');

    expect(wrapper.find('.review-skip-panel').exists()).toBe(true);
    expect(wrapper.find('.review-skip-panel').text()).toContain('稍后再看');
    expect(wrapper.find('.review-skip-panel input[type="range"]').exists()).toBe(true);
    expect(wrapper.findAll('.review-skip-panel__presets .review-skip-panel__preset').map((node) => node.text())).toEqual([
      '5 张后',
      '10 张后',
      '中段',
      '队尾',
    ]);
    expect(wrapper.find('insert-position-dialog-stub').exists()).toBe(false);
  });

  it('inserts the current card through preset or slider positions and remembers the last position locally', async () => {
    const insertAt = vi.fn(async () => undefined);
    const wrapper = mountReviewActions(
      createActions({ showAnswer: true }),
      false,
      null,
      {
        meta: { canBack: true, remainingSize: 47, transition: 'none' },
        queue: {
          insertAt,
        },
      },
      {
        SkipMenuButton: false,
      },
    );

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    await wrapper.findAll('.review-skip-panel__presets .review-skip-panel__preset')[0]!.trigger('click');
    await wrapper.get('.review-skip-panel__commit-button').trigger('click');
    await flushPromises();

    expect(insertAt).toHaveBeenCalledWith('card-1', 5);
    expect(wrapper.emitted('skip')).toEqual([[]]);
    expect(wrapper.find('.review-skip-panel').exists()).toBe(false);

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    expect((wrapper.get('.review-skip-panel input[type="range"]').element as HTMLInputElement).value).toBe('5');

    await wrapper.get('.review-skip-panel input[type="range"]').setValue(14);
    expect(wrapper.get('.review-skip-panel__state').text()).toContain('14');

    await wrapper.get('.review-skip-panel__commit-button').trigger('click');
    await flushPromises();

    expect(insertAt).toHaveBeenLastCalledWith('card-1', 14);
    expect(wrapper.emitted('skip')).toEqual([[], []]);
  });

  it('clamps tail insertion to queued cards after the current card', async () => {
    const insertAt = vi.fn(async () => undefined);
    const wrapper = mountReviewActions(
      createActions({ showAnswer: true }),
      false,
      null,
      {
        meta: { canBack: true, remainingSize: 6, transition: 'none' },
        queue: {
          insertAt,
        },
      },
      {
        SkipMenuButton: false,
      },
    );

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    await wrapper.findAll('.review-skip-panel__presets .review-skip-panel__preset')[3]!.trigger('click');
    await wrapper.get('.review-skip-panel__commit-button').trigger('click');
    await flushPromises();

    expect(insertAt).toHaveBeenCalledWith('card-1', 5);
  });

  it('keeps preset selection distinct when short queues clamp to the same position', async () => {
    const wrapper = mountReviewActions(
      createActions({ showAnswer: true }),
      false,
      null,
      {
        meta: { canBack: true, remainingSize: 6, transition: 'none' },
        queue: {
          insertAt: vi.fn(async () => undefined),
        },
      },
      {
        SkipMenuButton: false,
      },
    );

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    const presets = wrapper.findAll('.review-skip-panel__presets .review-skip-panel__preset');

    await presets[1]!.trigger('click');
    expect(wrapper.findAll('.review-skip-panel__presets .is-active').map((node) => node.text())).toEqual(['10 张后']);

    await presets[3]!.trigger('click');
    expect(wrapper.findAll('.review-skip-panel__presets .is-active').map((node) => node.text())).toEqual(['队尾']);
  });

  it('fills quick schedule dates without skipping until the confirmation button is clicked', async () => {
    const rescheduleCard = vi.fn(async () => undefined);
    const removeCard = vi.fn(async () => undefined);
    const wrapper = mountReviewActions(
      createActions({ showAnswer: true }),
      false,
      null,
      {
        meta: { canBack: true, remainingSize: 47, transition: 'none' },
        plugin: {
          getContext: () => ({
            getReviewService: () => ({ rescheduleCard }),
          }),
        },
        queue: {
          insertAt: vi.fn(async () => undefined),
          removeCard,
        },
      },
      {
        SkipMenuButton: false,
      },
    );

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    await wrapper.findAll('.review-skip-panel__date-presets .review-skip-panel__preset')[0]!.trigger('click');
    await flushPromises();

    expect(rescheduleCard).not.toHaveBeenCalled();
    expect(removeCard).not.toHaveBeenCalled();
    expect(wrapper.emitted('skip')).toBeFalsy();
    expect(wrapper.find('.review-skip-panel').exists()).toBe(true);
    expect((wrapper.get('.review-skip-panel__date-custom input').element as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await wrapper.get('.review-skip-panel__date-custom .b3-button').trigger('click');
    await flushPromises();

    expect(rescheduleCard).toHaveBeenCalledWith(
      'card-1',
      expect.objectContaining({
        mode: 'direct',
        dueTimestamp: expect.any(Number),
      }),
    );
    expect(removeCard).not.toHaveBeenCalled();
    expect(wrapper.emitted('skip')).toBeFalsy();
    expect(wrapper.emitted('scheduled')).toEqual([[
      expect.objectContaining({
        cardId: 'card-1',
        blockId: 'block-1',
        dueTimestamp: expect.any(Number),
      }),
    ]]);
    expect(wrapper.find('.review-skip-panel').exists()).toBe(false);
  });

  it('does not schedule when the custom date value is invalid', async () => {
    const rescheduleCard = vi.fn(async () => undefined);
    const removeCard = vi.fn(async () => undefined);
    const wrapper = mountReviewActions(
      createActions({ showAnswer: true }),
      false,
      null,
      {
        meta: { canBack: true, remainingSize: 47, transition: 'none' },
        plugin: {
          getContext: () => ({
            getReviewService: () => ({ rescheduleCard }),
          }),
        },
        queue: {
          insertAt: vi.fn(async () => undefined),
          removeCard,
        },
      },
      {
        SkipMenuButton: false,
      },
    );

    await wrapper.get('.skip-menu-button__trigger').trigger('click');
    await wrapper.get('.review-skip-panel__date-custom input').setValue('not-a-date');
    await wrapper.get('.review-skip-panel__date-custom .b3-button').trigger('click');
    await flushPromises();

    expect(rescheduleCard).not.toHaveBeenCalled();
    expect(removeCard).not.toHaveBeenCalled();
    expect(wrapper.emitted('skip')).toBeFalsy();
    expect(wrapper.find('.review-skip-panel').exists()).toBe(true);
  });

  it('hides quick date scheduling for neural roam virtual cards', async () => {
    const wrapper = mountReviewActions(
      createActions({ showAnswer: true }),
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
      {
        meta: { canBack: true, remainingSize: 47, transition: 'none' },
        queue: {
          insertAt: vi.fn(async () => undefined),
        },
      },
      {
        SkipMenuButton: false,
      },
    );

    await wrapper.get('.skip-menu-button__trigger').trigger('click');

    expect(wrapper.find('.review-skip-panel__card--later').exists()).toBe(true);
    expect(wrapper.find('.review-skip-panel__card--schedule').exists()).toBe(false);
  });
});
