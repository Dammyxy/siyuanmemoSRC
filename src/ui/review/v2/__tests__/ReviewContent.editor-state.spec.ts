import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewEditorState } from '../reviewEditorState';

const reviewContentMocks = vi.hoisted(() => {
  const instances: Array<{
    disableCallCount: number;
    enableCallCount: number;
    destroyCallCount: number;
    host: HTMLElement;
    protyle: { wysiwyg: { element: HTMLElement } };
  }> = [];

  class MockApp {}

  class MockProtyle {
    disableCallCount = 0;
    enableCallCount = 0;
    destroyCallCount = 0;
    host: HTMLElement;
    protyle: { wysiwyg: { element: HTMLElement } };

    constructor(_app: unknown, host: HTMLElement, options: { after?: (protyle: MockProtyle) => void }) {
      this.host = host;
      const wysiwygElement = document.createElement('div');
      wysiwygElement.className = 'protyle-wysiwyg';
      host.appendChild(wysiwygElement);
      this.protyle = {
        wysiwyg: {
          element: wysiwygElement,
        },
      };
      instances.push(this);
      options.after?.(this);
    }

    enable(): void {
      this.enableCallCount += 1;
    }

    disable(): void {
      this.disableCallCount += 1;
    }

    destroy(): void {
      this.destroyCallCount += 1;
    }
  }

  return {
    instances,
    MockApp,
    MockProtyle,
  };
});

vi.mock('siyuan', () => ({
  App: reviewContentMocks.MockApp,
  Constants: {
    CB_GET_ALL: 'cb-get-all',
  },
  Protyle: reviewContentMocks.MockProtyle,
}));

vi.mock('@/core/card/render-profile/RenderProfileResolver', () => ({
  resolveRenderProfile: () => null,
}));

vi.mock('@/core/xiuyuan/cardMeta', () => ({
  isConceptCard: () => false,
  isConceptDefinitionCard: () => false,
}));

vi.mock('@/core/card/quick-card/infrastructure/SiyuanBlockAdapter', () => ({
  SiyuanBlockAdapter: class {},
}));

vi.mock('@/core/card/quick-card/infrastructure/QuickCardRepository', () => ({
  QuickCardRepository: class {},
}));

vi.mock('@/core/card/quick-card/application/QuickCardRenderService', () => ({
  QuickCardRenderService: class {
    async isQuickCard(): Promise<boolean> {
      return false;
    }
  },
}));

vi.mock('@/core/card/descriptor-card/infrastructure/SiyuanBlockAdapter', () => ({
  SiyuanBlockAdapter: class {},
}));

vi.mock('@/core/card/descriptor-card/infrastructure/DescriptorCardRepository', () => ({
  DescriptorCardRepository: class {},
}));

vi.mock('@/core/card/descriptor-card/application/DescriptorCardRenderService', () => ({
  DescriptorCardRenderService: class {
    async isDescriptorCard(): Promise<boolean> {
      return false;
    }
  },
}));

import ReviewContent from '../ReviewContent.vue';

function createProtyleContent() {
  return {
    type: 'protyle' as const,
    id: 'block-1',
    data: '',
    card: {
      id: 'card-1',
      type: 'item',
      meta: {
        forceProtyleRender: true,
      },
    },
  };
}

function createSpecialContent() {
  return {
    type: 'protyle' as const,
    id: 'block-special',
    data: '',
    isXiuyuanListTemplate: true,
    xiuyuanMeta: {
      templateId: 'template-1',
    },
    card: {
      id: 'card-special',
      type: 'item',
      meta: {},
    },
  };
}

function createHtmlContent() {
  return {
    type: 'html' as const,
    id: 'html-1',
    data: '<p>hello</p>',
  };
}

function createEmptyContent() {
  return {
    type: 'empty' as const,
    id: 'empty-1',
    data: '',
  };
}

function getEditorStates(wrapper: ReturnType<typeof mount>): ReviewEditorState[] {
  return (wrapper.emitted('editor-state-change') ?? []).map(([state]) => state as ReviewEditorState);
}

async function settleReviewContent(): Promise<void> {
  await flushPromises();
  await new Promise(resolve => setTimeout(resolve, 25));
  await flushPromises();
}

describe('ReviewContent editor state', () => {
  let attachTarget: HTMLDivElement;
  let actionButton: HTMLButtonElement;

  beforeEach(() => {
    reviewContentMocks.instances.length = 0;
    attachTarget = document.createElement('div');
    attachTarget.className = 'fsrs-review-v2';
    actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = 'grade';
    const actionWrap = document.createElement('div');
    actionWrap.className = 'card__action';
    actionWrap.appendChild(actionButton);
    attachTarget.appendChild(actionWrap);
    document.body.appendChild(attachTarget);
  });

  afterEach(() => {
    attachTarget.remove();
  });

  it('tracks main Protyle edit state and re-enables double-click editing after Escape exit', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createProtyleContent(),
        showAnswer: true,
        hasHiddenContent: false,
        meta: {
          transition: 'none',
        },
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: true,
          DescriptorCardRenderer: true,
          ConceptDefinitionCardRenderer: true,
          ConceptCardRenderer: true,
        },
      },
    });

    await settleReviewContent();

    const initialStates = getEditorStates(wrapper);
    expect(initialStates.at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: false,
    });

    const protyle = reviewContentMocks.instances[0];
    expect(protyle).toBeTruthy();
    protyle.protyle.wysiwyg.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flushPromises();

    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: true,
    });

    const exposed = wrapper.vm as unknown as { exitEditorByEscape: () => boolean };
    expect(exposed.exitEditorByEscape()).toBe(true);
    await flushPromises();

    expect(protyle.disableCallCount).toBeGreaterThanOrEqual(2);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: false,
    });
    expect(document.activeElement).toBe(actionButton);

    protyle.protyle.wysiwyg.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flushPromises();

    expect(protyle.enableCallCount).toBe(2);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: true,
    });

    wrapper.unmount();
  });

  it('marks html, empty, and special renderers as non-editable', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createHtmlContent(),
        showAnswer: true,
        hasHiddenContent: false,
        meta: {
          transition: 'none',
        },
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: true,
          DescriptorCardRenderer: true,
          ConceptDefinitionCardRenderer: true,
          ConceptCardRenderer: true,
        },
      },
    });

    await flushPromises();
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'html',
      supportsNativeEdit: false,
      isEditing: false,
    });

    await wrapper.setProps({
      content: createEmptyContent(),
    });
    await flushPromises();
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'empty',
      supportsNativeEdit: false,
      isEditing: false,
    });

    await wrapper.setProps({
      content: createSpecialContent(),
    });
    await settleReviewContent();
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'special',
      supportsNativeEdit: false,
      isEditing: false,
    });

    wrapper.unmount();
  });
});
