// @vitest-environment happy-dom

import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { RichContentResult } from '@/core/card/common/application/richContent';

function richContent(html: string): RichContentResult {
  return {
    html,
    atoms: [],
    diagnostics: [],
    source: {
      kind: 'concept',
      field: 'content',
    },
    renderKind: 'html',
  };
}

const prepareViewModel = vi.fn(async () => ({
  conceptName: '幂函数',
  conceptBlockId: 'concept-block-1',
  content: richContent('<p>指数为定值，以 x 为自变量。</p>'),
  breadcrumbs: [{ id: 'crumb-1', label: '数学' }],
}));

vi.mock('@/core/card/concept/application/ConceptCardRenderService', () => ({
  ConceptCardRenderService: vi.fn().mockImplementation(() => ({
    prepareViewModel,
  })),
}));

import ConceptCardRenderer from '../ConceptCardRenderer.vue';

describe('ConceptCardRenderer', () => {
  it('renders the concept card content without the legacy jump action', async () => {
    const wrapper = mount(ConceptCardRenderer, {
      props: {
        blockId: 'concept-block-1',
        showAnswer: false,
      },
      global: {
        stubs: {
          CardBreadcrumb: { template: '<div class="card-breadcrumb-stub"></div>' },
          CardLoadingState: { template: '<div class="card-loading-stub"></div>' },
          CardErrorState: { template: '<div class="card-error-stub"></div>' },
        },
      },
    });

    await flushPromises();
    await nextTick();

    expect(prepareViewModel).toHaveBeenCalledWith('concept-block-1', undefined);
    expect(wrapper.text()).toContain('幂函数');
    expect(wrapper.find('.concept-card-renderer__badge-label').text()).toContain('概念卡');
    expect(wrapper.text()).not.toContain('跳转到概念');
    expect(wrapper.find('.concept-card-renderer__actions').exists()).toBe(false);
  });

  it('renders answer content through the shared review rich html host', async () => {
    const wrapper = mount(ConceptCardRenderer, {
      props: {
        blockId: 'concept-block-1',
        showAnswer: true,
      },
      global: {
        stubs: {
          CardBreadcrumb: { template: '<div class="card-breadcrumb-stub"></div>' },
          CardLoadingState: { template: '<div class="card-loading-stub"></div>' },
          CardErrorState: { template: '<div class="card-error-stub"></div>' },
        },
      },
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.find('.review-rich-html-content').exists()).toBe(true);
    expect(wrapper.html()).toContain('指数为定值，以 x 为自变量。');
  });
});
