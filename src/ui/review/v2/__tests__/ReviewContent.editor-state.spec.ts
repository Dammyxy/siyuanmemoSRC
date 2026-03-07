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
  const blockFixtures = new Map<string, string>();

  class MockApp {}

  class MockProtyle {
    disableCallCount = 0;
    enableCallCount = 0;
    destroyCallCount = 0;
    host: HTMLElement;
    protyle: { wysiwyg: { element: HTMLElement } };

    constructor(
      _app: unknown,
      host: HTMLElement,
      options: { after?: (protyle: MockProtyle) => void; blockId?: string },
    ) {
      this.host = host;
      const wysiwygElement = document.createElement('div');
      wysiwygElement.className = 'protyle-wysiwyg';
      const fixture = typeof options.blockId === 'string'
        ? blockFixtures.get(options.blockId)
        : undefined;
      if (fixture) {
        wysiwygElement.innerHTML = fixture;
      }
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
    blockFixtures,
    instances,
    MockApp,
    MockProtyle,
  };
});

const reviewContentLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

const reviewContentApiMocks = vi.hoisted(() => ({
  getBlockDocInfo: vi.fn(async () => ({ ial: {} })),
  getDocContent: vi.fn(async () => ({ content: '', type: 'NodeDocument' })),
}));

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

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewContentLoggerMocks,
  logger: reviewContentLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/infrastructure/siyuan/api', () => ({
  getBlockDocInfo: reviewContentApiMocks.getBlockDocInfo,
  getDocContent: reviewContentApiMocks.getDocContent,
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

function createForcedQuickContent() {
  return {
    type: 'protyle' as const,
    id: 'block-force-quick',
    data: '',
    card: {
      id: 'card-force-quick',
      type: 'item',
      meta: {
        forceQuickRender: true,
        quickDetectReason: 'cloze-latex-numbered',
      },
    },
  };
}

function createNativeRiffContent() {
  return {
    type: 'protyle' as const,
    id: 'block-native-riff',
    data: '',
    card: {
      id: 'card-native-riff',
      type: 'item',
      meta: {
        templateID: 'builtin-riff-sync',
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

function setBlockFixture(blockId: string, html: string): void {
  reviewContentMocks.blockFixtures.set(blockId, html);
}

function getEditorStates(wrapper: ReturnType<typeof mount>): ReviewEditorState[] {
  return (wrapper.emitted('editor-state-change') ?? []).map(([state]) => state as ReviewEditorState);
}

async function settleReviewContent(): Promise<void> {
  await flushPromises();
  await new Promise(resolve => setTimeout(resolve, 25));
  await flushPromises();
}

async function settleProtyleInit(): Promise<void> {
  await flushPromises();
  await new Promise(resolve => setTimeout(resolve, 140));
  await flushPromises();
}

describe('ReviewContent editor state', () => {
  let attachTarget: HTMLDivElement;
  let actionButton: HTMLButtonElement;

  beforeEach(() => {
    reviewContentMocks.instances.length = 0;
    reviewContentMocks.blockFixtures.clear();
    reviewContentLoggerMocks.warn.mockReset();
    reviewContentLoggerMocks.error.mockReset();
    reviewContentLoggerMocks.debug.mockReset();
    reviewContentLoggerMocks.info.mockReset();
    reviewContentLoggerMocks.log.mockReset();
    reviewContentLoggerMocks.trace.mockReset();
    reviewContentApiMocks.getBlockDocInfo.mockReset();
    reviewContentApiMocks.getDocContent.mockReset();
    reviewContentApiMocks.getBlockDocInfo.mockResolvedValue({ ial: {} });
    reviewContentApiMocks.getDocContent.mockResolvedValue({ content: '', type: 'NodeDocument' });
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
    (window as Window & {
      siyuan?: {
        config?: {
          flashcard?: {
            superBlock?: boolean;
            heading?: boolean;
            list?: boolean;
            mark?: boolean;
          };
        };
      };
    }).siyuan = {
      config: {
        flashcard: {
          superBlock: true,
          heading: true,
          list: true,
          mark: true,
        },
      },
    };
  });

  afterEach(() => {
    attachTarget.remove();
    delete (window as Window & { siyuan?: unknown }).siyuan;
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

  it('destroys the old Protyle instance when switching from main renderer to special renderer', async () => {
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

    const initialProtyle = reviewContentMocks.instances[0];
    expect(initialProtyle).toBeTruthy();

    await wrapper.setProps({
      content: createSpecialContent(),
    });
    await settleReviewContent();

    expect(initialProtyle.destroyCallCount).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it('falls back to standard Protyle once when forceQuickRender metadata is invalid', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createForcedQuickContent(),
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

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentLoggerMocks.warn).toHaveBeenCalledTimes(1);
    expect(reviewContentLoggerMocks.warn).toHaveBeenCalledWith(
      '[SiYuanMemo][ReviewContent] Suppressing invalid forceQuickRender metadata for current session',
      expect.objectContaining({
        blockId: 'block-force-quick',
        cardId: 'card-force-quick',
      }),
    );

    await wrapper.setProps({ showAnswer: false });
    await settleReviewContent();

    expect(reviewContentLoggerMocks.warn).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('loads native riff-sync hidden cards through doc content instead of direct blockId rendering', async () => {
    reviewContentApiMocks.getBlockDocInfo.mockResolvedValue({ ial: {} });
    reviewContentApiMocks.getDocContent.mockResolvedValue({
      content: '<div class="sb" custom-riff-decks="deck-1"><div class="protyle-attr"></div><div data-node-id="front"></div><div data-node-id="back"></div></div>',
      type: 'NodeDocument',
      rootID: 'doc-native-riff',
      id: 'block-native-riff',
    });

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createNativeRiffContent(),
        showAnswer: true,
        hasHiddenContent: true,
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

    await settleProtyleInit();

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentApiMocks.getBlockDocInfo).toHaveBeenCalledWith('block-native-riff');
    expect(reviewContentApiMocks.getDocContent).toHaveBeenCalledWith('block-native-riff');

    wrapper.unmount();
  });

  it('reveals inline hidden content by removing hide classes without rebuilding Protyle', async () => {
    setBlockFixture(
      'block-1',
      '<div class="sb" custom-riff-decks="deck-1"><div class="protyle-attr"></div><div data-node-id="front"></div><div data-node-id="back"></div></div>',
    );
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
        hasHiddenContent: true,
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

    await settleProtyleInit();

    const host = wrapper.find('.fsrs-review-v2-content__protyle-host').element as HTMLDivElement;
    const protyle = reviewContentMocks.instances[0];
    expect(host.classList.contains('card__block--hidesb')).toBe(true);

    await wrapper.setProps({
      showAnswer: false,
      hasHiddenContent: true,
    });
    await settleReviewContent();

    expect(host.classList.contains('card__block--hidesb')).toBe(false);
    expect(protyle.destroyCallCount).toBe(0);

    wrapper.unmount();
  });

  it('keeps native hidden classes off when rendered content does not match flashcard DOM', async () => {
    setBlockFixture('block-1', '<div class="p" data-node-id="plain"></div>');

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
        hasHiddenContent: true,
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

    await settleProtyleInit();

    const host = wrapper.find('.fsrs-review-v2-content__protyle-host').element as HTMLDivElement;
    expect(host.classList.contains('card__block--hidesb')).toBe(false);
    expect(host.classList.contains('card__block--hideli')).toBe(false);
    expect(host.classList.contains('card__block--hideh')).toBe(false);
    expect(host.classList.contains('card__block--hidemark')).toBe(false);

    wrapper.unmount();
  });
});
