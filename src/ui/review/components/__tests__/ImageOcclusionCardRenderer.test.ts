import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ImageOcclusionCardRenderer from '../ImageOcclusionCardRenderer.vue';
import type { FSRSCard } from '@/types/card';

const getBlockAttrsMock = vi.fn();
const getBlockKramdownMock = vi.fn();

vi.mock('@/infrastructure/siyuan/api', () => ({
  getBlockAttrs: (...args: unknown[]) => getBlockAttrsMock(...args),
  getBlockKramdown: (...args: unknown[]) => getBlockKramdownMock(...args),
}));

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createPayload(cardId: string): string {
  return JSON.stringify({
    version: 2,
    imageSrc: 'assets/image.png',
    masks: [
      { id: 'm1', x: 0.1, y: 0.2, w: 0.3, h: 0.2, prompt: 'Today as note' },
    ],
    maskToCardId: {
      m1: cardId,
    },
  });
}

function createImageOcclusionCard(cardId: string): FSRSCard {
  return {
    id: cardId,
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: 0,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 0,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 0,
    updatedAt: 0,
    meta: {
      source: 'image-occlusion',
      imageOcclusion: true,
      imageOcclusionMaskId: 'm1',
    },
  } as unknown as FSRSCard;
}

describe('ImageOcclusionCardRenderer.vue', () => {
  beforeEach(() => {
    getBlockAttrsMock.mockReset();
    getBlockKramdownMock.mockReset();
  });

  it('shows blue mask + mask label + bottom hint before reveal', async () => {
    const cardId = 'card-1';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-1',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.image-occlusion-card-renderer__question').text()).toContain('Today as note');
    expect(wrapper.find('.image-occlusion-card-renderer__mask-label').exists()).toBe(true);
    expect(wrapper.find('.image-occlusion-card-renderer__hint').exists()).toBe(true);
    expect(wrapper.find('.image-occlusion-card-renderer__mask.is-revealed').exists()).toBe(false);
  });

  it('keeps black frame only and hides mask label + bottom hint after reveal', async () => {
    const cardId = 'card-2';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-2',
        showAnswer: true,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.image-occlusion-card-renderer__question').text()).toContain('Today as note');
    expect(wrapper.find('.image-occlusion-card-renderer__mask.is-revealed').exists()).toBe(true);
    expect(wrapper.find('.image-occlusion-card-renderer__mask-label').exists()).toBe(false);
    expect(wrapper.find('.image-occlusion-card-renderer__hint').exists()).toBe(false);
  });

  it('toggles image fullscreen by floating button', async () => {
    const cardId = 'card-3';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-3',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    const stage = wrapper.find('.image-occlusion-card-renderer__stage');
    const toggle = wrapper.get('[data-role="image-fullscreen-toggle"]');
    expect(stage.classes()).not.toContain('is-image-fullscreen');

    await toggle.trigger('click');
    expect(stage.classes()).toContain('is-image-fullscreen');

    await toggle.trigger('click');
    expect(stage.classes()).not.toContain('is-image-fullscreen');
  });

  it('toggles image fullscreen by + key', async () => {
    const cardId = 'card-4';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-4',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    const stage = wrapper.find('.image-occlusion-card-renderer__stage');
    expect(stage.classes()).not.toContain('is-image-fullscreen');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    await wrapper.vm.$nextTick();
    expect(stage.classes()).toContain('is-image-fullscreen');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    await wrapper.vm.$nextTick();
    expect(stage.classes()).not.toContain('is-image-fullscreen');
  });

  it('exits image fullscreen when left-clicking the stage', async () => {
    const cardId = 'card-5';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-5',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    const stage = wrapper.get('[data-role="image-fullscreen-stage"]');
    const toggle = wrapper.get('[data-role="image-fullscreen-toggle"]');
    await toggle.trigger('click');
    expect(stage.classes()).toContain('is-image-fullscreen');

    await stage.trigger('mousedown', { button: 0 });
    expect(stage.classes()).not.toContain('is-image-fullscreen');
  });

  it('changes zoom value by ctrl+wheel while fullscreen', async () => {
    const cardId = 'card-6';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-6',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-role="image-fullscreen-toggle"]').trigger('click');
    const viewport = wrapper.get('.image-occlusion-card-renderer__viewport');
    const zoomValue = wrapper.get('[data-role="image-zoom-value"]');
    expect(zoomValue.text()).toBe('100%');

    viewport.element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -120,
    }));
    await wrapper.vm.$nextTick();
    expect(zoomValue.text()).toBe('110%');

    viewport.element.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 120,
    }));
    await wrapper.vm.$nextTick();
    expect(zoomValue.text()).toBe('100%');
  });

  it('shows loading state only after deferred threshold on slow fetch', async () => {
    vi.useFakeTimers();
    try {
      const cardId = 'card-7';
      getBlockAttrsMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                'custom-fsrs-image-occlusion': createPayload(cardId),
                'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
              });
            }, 200);
          })
      );
      getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

      const wrapper = mount(ImageOcclusionCardRenderer, {
        props: {
          blockId: 'block-7',
          showAnswer: false,
          card: createImageOcclusionCard(cardId),
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.find('.card-loading-state').exists()).toBe(false);

      vi.advanceTimersByTime(119);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.card-loading-state').exists()).toBe(false);

      vi.advanceTimersByTime(1);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.card-loading-state').exists()).toBe(true);

      vi.advanceTimersByTime(80);
      await Promise.resolve();
      await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.card-loading-state').exists()).toBe(false);
      expect(wrapper.find('.image-occlusion-card-renderer__content').exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
