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
});
