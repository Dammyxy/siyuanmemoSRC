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
        directScene: {
          rows: [
            {
              kind: 'concept',
              key: 'concept',
              content: {
                html: '<p>[[中子星]]</p>',
                renderKind: 'fragment',
              },
              emphasize: 'primary',
            },
            {
              kind: 'relation',
              key: 'descriptor',
              level: 1,
              left: {
                html: '<p>形成过程</p>',
                renderKind: 'fragment',
              },
              right: {
                html: '<div class="protyle-wysiwyg"><p>前身恒星经历超新星爆炸后形成</p><blockquote><p>同时保留复杂块直出。</p></blockquote></div>',
                renderKind: 'block-flow',
              },
              arrow: '→',
            },
          ],
          frontMask: { rowKey: 'descriptor', segment: 'right' },
        },
        relationArrow: '→',
        isReverse: false,
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
    expect(wrapper.text()).toContain('中子星');
    expect(wrapper.text()).toContain('→');
    expect(wrapper.text()).toContain('形成过程');
    expect(wrapper.text()).toContain('前身恒星经历超新星爆炸后形成');
    expect(wrapper.html()).toContain('cdf-editor__row--stacked');
    expect(wrapper.text()).not.toContain('legacy semantic warning');
  });

  it('keeps descriptor cards in direct mode even when only fallback description is available', async () => {
    const renderService = {
      prepareViewModel: vi.fn().mockResolvedValue({
        blockId: 'descriptor-2',
        breadcrumbs: [{ id: 'doc-1', label: 'Doc' }],
        dependencyBlockIds: ['doc-1', 'descriptor-2'],
        frontHtml: '<p>semantic front</p>',
        backHtml: '<p>semantic back</p>',
        directScene: {
          rows: [{
            kind: 'standalone',
            key: 'descriptor-answer',
            content: {
              html: '<p>前身→恒星</p>',
              renderKind: 'fragment',
            },
          }],
          frontMask: null,
        },
        relationArrow: '→',
        isReverse: false,
        attribute: '',
        description: '前身→恒星',
        parentConcept: null,
        siblingDescriptors: [],
        warning: 'warningNoParentConcept',
      }),
    } as any;

    const wrapper = mount(DescriptorCardRenderer, {
      props: {
        blockId: 'descriptor-2',
        cardId: 'card-2',
        card: {
          id: 'card-2',
          meta: {
            typeMarker: 'concept-descriptor-forward',
          },
        },
        renderService,
        displayMode: 'direct',
        showAnswer: false,
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
    expect(wrapper.text()).toContain('前身→恒星');
    expect(wrapper.text()).not.toContain('defaultAttribute');
  });

  it('keeps semantic fallback minimal without warning, badge, or sibling chrome', async () => {
    const renderService = {
      prepareViewModel: vi.fn().mockResolvedValue({
        blockId: 'descriptor-3',
        breadcrumbs: [{ id: 'doc-1', label: 'Doc' }],
        dependencyBlockIds: ['doc-1', 'descriptor-3'],
        frontHtml: '<p>semantic front</p>',
        backHtml: '<p>semantic back</p>',
        relationArrow: '→',
        isReverse: false,
        attribute: '前身',
        description: '恒星',
        parentConcept: null,
        siblingDescriptors: [{ blockId: 'sib-1', attribute: '密度', content: '密度 ;; 极高' }],
        warning: 'warningNoParentConcept',
      }),
    } as any;

    const wrapper = mount(DescriptorCardRenderer, {
      props: {
        blockId: 'descriptor-3',
        cardId: 'card-3',
        renderService,
        displayMode: 'semantic',
        showAnswer: false,
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

    expect(wrapper.find('.descriptor-card-renderer__warning').exists()).toBe(false);
    expect(wrapper.find('.descriptor-card-renderer__badge').exists()).toBe(false);
    expect(wrapper.find('.descriptor-card-renderer__siblings').exists()).toBe(false);
    expect(wrapper.find('.review-rich-html-content').exists()).toBe(true);
    expect(wrapper.html()).toContain('semantic front');
  });
});
