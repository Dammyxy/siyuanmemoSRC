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
});
