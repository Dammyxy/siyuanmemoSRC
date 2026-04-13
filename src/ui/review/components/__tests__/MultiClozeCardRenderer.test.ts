import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';

const multiClozeRendererMocks = vi.hoisted(() => ({
  prepareViewModel: vi.fn(),
}));

vi.mock('@/core/card/multi-cloze/application/MultiClozeCardRenderService', () => ({
  MultiClozeCardRenderService: class {
    async prepareViewModel(card: unknown) {
      return multiClozeRendererMocks.prepareViewModel(card);
    }
  },
}));

import MultiClozeCardRenderer from '../MultiClozeCardRenderer.vue';

function createCard(): FSRSCard {
  const now = Date.now();
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: now,
    stability: 5,
    difficulty: 4,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: now,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {
      templateID: 'builtin-multi-cloze',
      faceIndex: 0,
      faces: [{ question: 'front', answer: 'back' }],
    },
  } as FSRSCard;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('MultiClozeCardRenderer.vue', () => {
  it('renders a single inline content region and swaps front/back html in place', async () => {
    multiClozeRendererMocks.prepareViewModel.mockResolvedValue({
      blockId: 'block-1',
      breadcrumbs: [],
      frontHtml: '<p>Front</p>',
      backHtml: '<p>Back</p>',
      faceIndex: 0,
      totalFaces: 1,
      renderMode: 'default',
    });

    const wrapper = mount(MultiClozeCardRenderer, {
      props: {
        card: createCard(),
        showAnswer: false,
      },
    });

    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    expect(multiClozeRendererMocks.prepareViewModel).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.multi-cloze-card-renderer--question').exists()).toBe(true);
    expect(wrapper.find('.multi-cloze-card-renderer__protyle.protyle').exists()).toBe(true);
    expect(wrapper.find('.multi-cloze-card-renderer__body.protyle-content').exists()).toBe(true);
    expect(wrapper.html()).toContain('Front');
    expect(wrapper.html()).not.toContain('Back');
    expect(wrapper.find('.multi-cloze-card-renderer__answer-divider').exists()).toBe(false);
    expect(wrapper.find('.multi-cloze-card-renderer__front-preview').exists()).toBe(false);

    await wrapper.setProps({ showAnswer: true });
    await wrapper.vm.$nextTick();

    expect(multiClozeRendererMocks.prepareViewModel).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.multi-cloze-card-renderer--show-answer').exists()).toBe(true);
    expect(wrapper.html()).toContain('Back');
    expect(wrapper.html()).not.toContain('Front');
  });
});
