import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FSRSCard } from '@/types/card';
import { buildReviewRendererIdentity } from '../reviewRendererIdentity';
import type { RichContentResult } from '@/core/card/common/application/richContent';

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

function richContent(html: string, field = 'front'): RichContentResult {
  return {
    html,
    atoms: [],
    diagnostics: [],
    source: {
      kind: 'multi-cloze',
      field,
    },
    renderKind: 'html',
  };
}

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = Date.now();
  const meta = {
    templateID: 'builtin-multi-cloze',
    faceIndex: 0,
    faces: [{ question: 'front', answer: 'back' }],
    ...(overrides.meta ?? {}),
  };
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
    ...overrides,
    meta,
  } as FSRSCard;
}

function buildPreparedIdentity(card: FSRSCard): string {
  return buildReviewRendererIdentity(card);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('MultiClozeCardRenderer.vue', () => {
  beforeEach(() => {
    multiClozeRendererMocks.prepareViewModel.mockReset();
  });

  it('renders a single inline content region and swaps front/back html in place', async () => {
    multiClozeRendererMocks.prepareViewModel.mockResolvedValue({
      blockId: 'block-1',
      breadcrumbs: [],
      frontContent: richContent('<p>Front</p>', 'front'),
      backContent: richContent('<p>Back</p>', 'back'),
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
    expect(wrapper.find('.review-rich-html-content').exists()).toBe(true);
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

  it('renders prepared view model synchronously without loading or service fallback', async () => {
    const card = createCard();
    const preparedViewModel = {
      blockId: 'block-1',
      breadcrumbs: [],
      frontContent: richContent('<p>Prepared front</p>', 'front'),
      backContent: richContent('<p>Prepared back</p>', 'back'),
      faceIndex: 0,
      totalFaces: 1,
      renderMode: 'default',
    };

    const wrapper = mount(MultiClozeCardRenderer, {
      props: {
        card,
        showAnswer: false,
        preparedViewModel,
        preparedIdentity: buildPreparedIdentity(card),
      },
    });

    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    expect(multiClozeRendererMocks.prepareViewModel).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: 'CardLoadingState' }).exists()).toBe(false);
    expect(wrapper.html()).toContain('Prepared front');
  });

  it('matches prepared identity by faceKey before stale legacy faceIndex', async () => {
    const card = createCard({
      faceKey: { ruleId: 'multi-cloze', faceIndex: 2 },
      meta: {
        templateID: 'builtin-multi-cloze',
        faceIndex: 0,
        typeMarker: 'stale-cloze-0',
        faces: [{ question: 'front', answer: 'back' }],
      },
    });
    const preparedViewModel = {
      blockId: 'block-1',
      breadcrumbs: [],
      frontContent: richContent('<p>FaceKey prepared front</p>', 'front'),
      backContent: richContent('<p>FaceKey prepared back</p>', 'back'),
      faceIndex: 2,
      totalFaces: 3,
      renderMode: 'default',
    };

    const wrapper = mount(MultiClozeCardRenderer, {
      props: {
        card,
        showAnswer: false,
        preparedViewModel,
        preparedIdentity: buildPreparedIdentity(card),
      },
    });

    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    expect(multiClozeRendererMocks.prepareViewModel).not.toHaveBeenCalled();
    expect(wrapper.html()).toContain('FaceKey prepared front');
  });

  it('does not keep the previous card visible when a new identity fails to load', async () => {
    multiClozeRendererMocks.prepareViewModel
      .mockResolvedValueOnce({
        blockId: 'block-1',
        breadcrumbs: [],
        frontContent: richContent('<p>Old front</p>', 'front'),
        backContent: richContent('<p>Old back</p>', 'back'),
        faceIndex: 0,
        totalFaces: 1,
        renderMode: 'default',
      })
      .mockRejectedValueOnce(new Error('Invalid faceIndex: 1, total faces: 1'));

    const wrapper = mount(MultiClozeCardRenderer, {
      props: {
        card: createCard(),
        showAnswer: false,
      },
    });

    await flushMicrotasks();
    await wrapper.vm.$nextTick();
    expect(wrapper.html()).toContain('Old front');

    await wrapper.setProps({
      card: createCard({
        id: 'card-2',
        blockId: 'block-2',
        meta: {
          templateID: 'builtin-multi-cloze',
          faceIndex: 1,
          faces: [{ question: 'new', answer: 'new answer' }],
        },
      }),
    });
    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    expect(wrapper.html()).not.toContain('Old front');
    expect(wrapper.text()).toContain('Invalid faceIndex: 1, total faces: 1');
  });
});
