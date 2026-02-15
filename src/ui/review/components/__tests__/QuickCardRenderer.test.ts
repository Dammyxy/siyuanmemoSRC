import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import QuickCardRenderer from '../QuickCardRenderer.vue';
import type { QuickCardRenderService } from '@/core/card/quick-card/application/QuickCardRenderService';
import type { QuickCardRenderResult } from '@/core/card/quick-card/application/QuickCardRenderService';

describe('QuickCardRenderer.vue', () => {
  let mockRenderService: QuickCardRenderService;
  let mockRenderResult: QuickCardRenderResult;

  beforeEach(() => {
    mockRenderResult = {
      html: '<div>Test content</div>',
      cssClasses: [],
      cardType: 'basic',
      metadata: { symbol: '>>' },
    };

    mockRenderService = {
      render: vi.fn().mockResolvedValue(mockRenderResult),
      toggleFace: vi.fn(),
    } as any;
  });

  describe('mounting', () => {
    it('should render loading state initially', () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      expect(wrapper.find('.quick-card-renderer__loading').exists()).toBe(true);
    });

    it('should load front face on mount', async () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRenderService.render).toHaveBeenCalledWith('123', 'front');
    });

    it('should render card content after loading', async () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.quick-card-renderer__content').exists()).toBe(true);
      expect(wrapper.html()).toContain('Test content');
    });
  });

  describe('showAnswer prop', () => {
    it('should load back face when showAnswer is true', async () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
          showAnswer: true,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRenderService.render).toHaveBeenCalledWith('123', 'back');
    });

    it('should reload when showAnswer changes from false to true', async () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
          showAnswer: false,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRenderService.render).toHaveBeenCalledWith('123', 'front');

      await wrapper.setProps({ showAnswer: true });
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRenderService.render).toHaveBeenCalledWith('123', 'back');
    });

    it('should reload when showAnswer changes from true to false', async () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
          showAnswer: true,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      await wrapper.setProps({ showAnswer: false });
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRenderService.render).toHaveBeenCalledWith('123', 'front');
    });
  });

  describe('blockId prop', () => {
    it('should reload when blockId changes', async () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRenderService.render).toHaveBeenCalledWith('123', 'front');

      await wrapper.setProps({ blockId: '456' });
      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRenderService.render).toHaveBeenCalledWith('456', 'front');
    });
  });

  describe('CSS classes', () => {
    it('should apply CSS classes from render result', async () => {
      mockRenderResult.cssClasses = ['card__block--hidemark'];
      mockRenderService.render = vi.fn().mockResolvedValue(mockRenderResult);

      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      const content = wrapper.find('.quick-card-renderer__content');
      expect(content.classes()).toContain('card__block--hidemark');
    });

    it('should apply multiple CSS classes', async () => {
      mockRenderResult.cssClasses = ['card__block--hidemark', 'card__block--hideli'];
      mockRenderService.render = vi.fn().mockResolvedValue(mockRenderResult);

      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      const content = wrapper.find('.quick-card-renderer__content');
      expect(content.classes()).toContain('card__block--hidemark');
      expect(content.classes()).toContain('card__block--hideli');
    });
  });

  describe('error handling', () => {
    it('should display error when render fails', async () => {
      mockRenderService.render = vi.fn().mockRejectedValue(new Error('Render failed'));

      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.quick-card-renderer__error').exists()).toBe(true);
      expect(wrapper.text()).toContain('Render failed');
    });

    it('should emit error event when render fails', async () => {
      const error = new Error('Render failed');
      mockRenderService.render = vi.fn().mockRejectedValue(error);

      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('error')).toBeTruthy();
      expect(wrapper.emitted('error')?.[0]).toEqual([error]);
    });

    it('should display error when render returns null', async () => {
      mockRenderService.render = vi.fn().mockResolvedValue(null);

      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.quick-card-renderer__error').exists()).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit loaded event when render succeeds', async () => {
      const wrapper = mount(QuickCardRenderer, {
        props: {
          blockId: '123',
          renderService: mockRenderService,
        },
      });

      await wrapper.vm.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted('loaded')).toBeTruthy();
      expect(wrapper.emitted('loaded')?.[0]).toEqual([mockRenderResult]);
    });
  });
});
