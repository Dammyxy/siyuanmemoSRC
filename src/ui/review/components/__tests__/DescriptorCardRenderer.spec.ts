import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import DescriptorCardRenderer from '../DescriptorCardRenderer.vue';

describe('DescriptorCardRenderer', () => {
  it('renders the direct CDF layout and hides semantic helper chrome in direct mode', async () => {
    const renderService = {
      prepareViewModel: vi.fn().mockResolvedValue({
        blockId: 'descriptor-1',
        breadcrumbs: [{ id: 'doc-1', label: 'Doc' }],
        dependencyBlockIds: ['doc-1', 'concept-1', 'descriptor-1'],
        frontHtml: '<p>semantic front</p>',
        backHtml: '<p>semantic back</p>',
        attribute: '形成过程',
        description: '前身恒星经历超新星爆炸后形成',
        parentConcept: {
          blockId: 'concept-1',
          title: '中子星',
          preview: '中子星',
          html: '<p>中子星</p>',
          isConceptCard: true,
        },
        siblingDescriptors: [{ blockId: 'sib-1', attribute: '密度', description: '极高' }],
        warning: 'legacy semantic warning',
      }),
    } as any;

    const wrapper = mount(DescriptorCardRenderer, {
      props: {
        blockId: 'descriptor-1',
        cardId: 'card-1',
        card: {
          id: 'card-1',
          meta: {
            typeMarker: 'concept-descriptor-forward',
          },
        },
        renderService,
        displayMode: 'direct',
        showAnswer: true,
      },
      global: {
        stubs: {
          CardBreadcrumb: true,
          CardErrorState: true,
          CardLoadingState: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('.cdf-direct-layout').exists()).toBe(true);
    expect(wrapper.find('.descriptor-card-renderer__warning').exists()).toBe(false);
    expect(wrapper.find('.descriptor-card-renderer__siblings').exists()).toBe(false);
    expect(wrapper.text()).toContain('概念');
    expect(wrapper.text()).toContain('线索');
    expect(wrapper.text()).toContain('答案');
    expect(wrapper.text()).toContain('中子星');
    expect(wrapper.text()).toContain('形成过程');
    expect(wrapper.text()).toContain('前身恒星经历超新星爆炸后形成');
  });
});
