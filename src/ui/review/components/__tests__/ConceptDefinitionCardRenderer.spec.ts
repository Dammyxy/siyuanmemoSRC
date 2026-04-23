// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const conceptDefinitionRendererMocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  },
  prepareViewModel: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => conceptDefinitionRendererMocks.logger,
}));

vi.mock('@/core/card/concept-definition/application/ConceptDefinitionCardRenderService', () => ({
  ConceptDefinitionCardRenderService: class {
    prepareViewModel(...args: unknown[]) {
      return conceptDefinitionRendererMocks.prepareViewModel(...args);
    }
  },
}));

import ConceptDefinitionCardRenderer from '../ConceptDefinitionCardRenderer.vue';

describe('ConceptDefinitionCardRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conceptDefinitionRendererMocks.prepareViewModel.mockRejectedValue(
      new Error('Concept block not found: concept-missing'),
    );
  });

  it('dedupes repeated same-identity renderer failures and leaves error logging to the parent surface', async () => {
    const props = {
      blockId: 'definition-1',
      cardId: 'card-1',
      card: {
        xiuyuanID: 'xy-1',
        meta: {
          xiuyuanID: 'xy-1',
          faceIndex: 0,
          typeMarker: 'concept-definition-forward',
        },
      },
      showAnswer: false,
    };

    const wrapperA = mount(ConceptDefinitionCardRenderer, {
      props,
      global: {
        stubs: {
          CardBreadcrumb: true,
          CardErrorState: true,
          CardLoadingState: true,
        },
      },
    });
    await flushPromises();
    expect(wrapperA.emitted('error')).toHaveLength(1);
    wrapperA.unmount();

    const wrapperB = mount(ConceptDefinitionCardRenderer, {
      props,
      global: {
        stubs: {
          CardBreadcrumb: true,
          CardErrorState: true,
          CardLoadingState: true,
        },
      },
    });
    await flushPromises();

    expect(wrapperB.emitted('error')).toHaveLength(1);
    expect(conceptDefinitionRendererMocks.logger.debug).toHaveBeenCalledTimes(1);
    expect(conceptDefinitionRendererMocks.logger.error).not.toHaveBeenCalled();
  });

  it('renders the direct CDF layout for non-cloze concept-definition cards in direct mode', async () => {
    conceptDefinitionRendererMocks.prepareViewModel.mockResolvedValue({
      blockId: 'definition-2',
      breadcrumbs: [{ id: 'doc-1', label: 'Doc' }],
      dependencyBlockIds: ['doc-1', 'concept-1', 'definition-2'],
      conceptName: '中子星',
      conceptBlockId: 'concept-1',
      definitionHtml: '<p>质量极高的致密恒星残骸</p>',
      frontHtml: '<p>semantic front</p>',
      backHtml: '<p>semantic back</p>',
      relationArrow: '↔',
      isReverse: false,
    });

    const wrapper = mount(ConceptDefinitionCardRenderer, {
      props: {
        blockId: 'definition-2',
        cardId: 'card-2',
        card: {
          xiuyuanID: 'xy-2',
          meta: {
            xiuyuanID: 'xy-2',
            faceIndex: 0,
            typeMarker: 'concept-definition-forward',
          },
        },
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
    expect(wrapper.find('.concept-definition-card-renderer__badge').exists()).toBe(false);
    expect(wrapper.text()).toContain('中子星');
    expect(wrapper.text()).toContain('↔');
    expect(wrapper.text()).toContain('...');
    expect(wrapper.text()).not.toContain('质量极高的致密恒星残骸');
  });
});
