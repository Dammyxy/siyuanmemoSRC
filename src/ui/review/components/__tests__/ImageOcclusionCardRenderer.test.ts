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

  it('does not exit image fullscreen when left-clicking the stage', async () => {
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
    expect(stage.classes()).toContain('is-image-fullscreen');
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

  it('keeps mouse anchor stable by adjusting viewport scroll on ctrl+wheel', async () => {
    const cardId = 'card-11';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-11',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-role="image-fullscreen-toggle"]').trigger('click');
    await wrapper.vm.$nextTick();

    const viewport = wrapper.get('.image-occlusion-card-renderer__viewport').element as HTMLElement;
    viewport.scrollLeft = 120;
    viewport.scrollTop = 80;

    const rectSpy = vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 40,
      left: 100,
      top: 40,
      right: 700,
      bottom: 440,
      width: 600,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect);

    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -120,
      clientX: 250,
      clientY: 160,
    }));

    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(viewport.scrollLeft).toBeCloseTo(147, 3);
    expect(viewport.scrollTop).toBeCloseTo(100, 3);
    rectSpy.mockRestore();
  });

  it('applies only the latest pending scroll compensation during rapid ctrl+wheel zoom', async () => {
    const cardId = 'card-12';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-12',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-role="image-fullscreen-toggle"]').trigger('click');
    await wrapper.vm.$nextTick();

    const viewport = wrapper.get('.image-occlusion-card-renderer__viewport').element as HTMLElement;
    let scrollLeftValue = 100;
    let scrollTopValue = 50;
    let scrollLeftSetCount = 0;
    let scrollTopSetCount = 0;

    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeftValue,
      set: (value: number) => {
        scrollLeftSetCount += 1;
        scrollLeftValue = Number(value);
      },
    });

    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopSetCount += 1;
        scrollTopValue = Number(value);
      },
    });

    const rectSpy = vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 40,
      left: 100,
      top: 40,
      right: 700,
      bottom: 440,
      width: 600,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect);

    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -120,
      clientX: 250,
      clientY: 170,
    }));
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -120,
      clientX: 300,
      clientY: 200,
    }));

    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(scrollLeftSetCount).toBe(1);
    expect(scrollTopSetCount).toBe(1);
    expect(scrollLeftValue).toBeCloseTo(127.2727, 3);
    expect(scrollTopValue).toBeCloseTo(69.0909, 3);
    rectSpy.mockRestore();
  });

  it('scrolls horizontally by shift+wheel while fullscreen', async () => {
    const cardId = 'card-8';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-8',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-role="image-fullscreen-toggle"]').trigger('click');
    const viewport = wrapper.get('.image-occlusion-card-renderer__viewport').element as HTMLElement;
    viewport.scrollLeft = 0;

    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      deltaY: 120,
    }));
    await wrapper.vm.$nextTick();

    expect(viewport.scrollLeft).toBe(120);
  });

  it('does not change zoom value by plain wheel while fullscreen', async () => {
    const cardId = 'card-9';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-9',
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
      deltaY: -120,
    }));
    await wrapper.vm.$nextTick();

    expect(zoomValue.text()).toBe('100%');
  });

  it('exits image fullscreen by Escape key', async () => {
    const cardId = 'card-10';
    getBlockAttrsMock.mockResolvedValue({
      'custom-fsrs-image-occlusion': createPayload(cardId),
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify([cardId]),
    });
    getBlockKramdownMock.mockResolvedValue({ kramdown: '' });

    const wrapper = mount(ImageOcclusionCardRenderer, {
      props: {
        blockId: 'block-10',
        showAnswer: false,
        card: createImageOcclusionCard(cardId),
      },
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    const stage = wrapper.get('[data-role="image-fullscreen-stage"]');
    await wrapper.get('[data-role="image-fullscreen-toggle"]').trigger('click');
    expect(stage.classes()).toContain('is-image-fullscreen');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(stage.classes()).not.toContain('is-image-fullscreen');
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
