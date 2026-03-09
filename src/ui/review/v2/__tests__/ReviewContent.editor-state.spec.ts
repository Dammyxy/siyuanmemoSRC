import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewEditorState } from '../reviewEditorState';

const reviewContentMocks = vi.hoisted(() => {
  const instances: Array<{
    disableCallCount: number;
    enableCallCount: number;
    destroyCallCount: number;
    host: HTMLElement;
    options: { render?: Record<string, unknown>; blockId?: string; action?: string[] };
    protyle: { wysiwyg: { element: HTMLElement } };
  }> = [];
  const blockFixtures = new Map<string, string>();

  class MockApp {}

  class MockProtyle {
    disableCallCount = 0;
    enableCallCount = 0;
    destroyCallCount = 0;
    host: HTMLElement;
    options: { render?: Record<string, unknown>; blockId?: string; action?: string[] };
    protyle: { wysiwyg: { element: HTMLElement } };

    constructor(
      _app: unknown,
      host: HTMLElement,
      options: { after?: (protyle: MockProtyle) => void; blockId?: string; action?: string[]; render?: Record<string, unknown> },
    ) {
      this.host = host;
      this.options = options;
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

const reviewContentQuickCardMocks = vi.hoisted(() => ({
  isQuickCard: vi.fn(async () => false),
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
    async isQuickCard(blockId?: string, cardId?: string): Promise<boolean> {
      return reviewContentQuickCardMocks.isQuickCard(blockId, cardId);
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

function createSymbolQuickContent() {
  return {
    type: 'protyle' as const,
    id: 'block-symbol-quick',
    data: '',
    card: {
      id: 'card-symbol-quick',
      type: 'item',
      meta: {
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
      },
    },
  };
}

function createSymbolQuickContentWithoutIndicators() {
  return {
    type: 'protyle' as const,
    id: 'block-symbol-quick',
    data: '',
    card: {
      id: 'card-symbol-quick',
      type: 'item',
      meta: {
        typeMarker: 'Q',
      },
    },
  };
}

function createNativeRiffContent() {
  return {
    type: 'protyle' as const,
    id: 'block-native-riff',
    data: '',
    answerBlockID: 'block-native-riff',
    card: {
      id: 'card-native-riff',
      type: 'item',
      meta: {
        templateID: 'builtin-riff-sync',
      },
    },
  };
}

function createBidirectionalTemplateContent() {
  return {
    type: 'protyle' as const,
    id: 'question-block',
    data: '',
    answerBlockID: 'answer-block',
    card: {
      id: 'card-bidirectional-forward',
      type: 'item',
      meta: {
        templateID: 'builtin-bidirectional',
        forceProtyleRender: true,
      },
    },
  };
}

function createTopicDocumentContent() {
  return {
    type: 'protyle' as const,
    id: 'topic-doc-root',
    data: '',
    answerBlockID: 'topic-doc-answer-should-be-ignored',
    card: {
      id: 'card-topic-doc',
      type: 'topic',
      meta: {
        isDocument: true,
        blockType: 'd',
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

function findWarnCall(message: string): unknown[] | undefined {
  return reviewContentLoggerMocks.warn.mock.calls.find(([firstArg]) => firstArg === message);
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
    reviewContentQuickCardMocks.isQuickCard.mockReset();
    reviewContentQuickCardMocks.isQuickCard.mockResolvedValue(false);
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
    (window as unknown as { siyuan?: unknown }).siyuan = {
      config: {
        flashcard: {
          superBlock: true,
          heading: true,
          list: true,
          mark: true,
        },
      },
    } as unknown;
  });

  afterEach(() => {
    attachTarget.remove();
    delete (window as unknown as { siyuan?: unknown }).siyuan;
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
    expect(findWarnCall(
      '[SiYuanMemo][ReviewContent] Suppressing invalid forceQuickRender metadata for current session',
    )).toEqual([
      '[SiYuanMemo][ReviewContent] Suppressing invalid forceQuickRender metadata for current session',
      expect.objectContaining({
        blockId: 'block-force-quick',
        cardId: 'card-force-quick',
      }),
    ]);

    await wrapper.setProps({ showAnswer: false });
    await settleReviewContent();

    expect(
      reviewContentLoggerMocks.warn.mock.calls.filter(
        ([firstArg]) => firstArg === '[SiYuanMemo][ReviewContent] Suppressing invalid forceQuickRender metadata for current session',
      ),
    ).toHaveLength(1);

    wrapper.unmount();
  });

  it('routes persisted symbol quick cards to the quick renderer without building Protyle', async () => {
    reviewContentQuickCardMocks.isQuickCard.mockResolvedValue(true);

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createSymbolQuickContent(),
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

    expect(reviewContentQuickCardMocks.isQuickCard).not.toHaveBeenCalled();
    expect(reviewContentMocks.instances).toHaveLength(0);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'special',
      supportsNativeEdit: false,
      isEditing: false,
    });
    expect(wrapper.find('quick-card-renderer-stub').exists()).toBe(true);

    wrapper.unmount();
  });

  it('reruns renderer detection when quick-card metadata arrives for the same card identity', async () => {
    reviewContentQuickCardMocks.isQuickCard.mockResolvedValue(false);

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createSymbolQuickContentWithoutIndicators(),
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
    const initialProtyle = reviewContentMocks.instances[0];
    expect(wrapper.find('quick-card-renderer-stub').exists()).toBe(false);

    reviewContentQuickCardMocks.isQuickCard.mockResolvedValue(true);
    await wrapper.setProps({
      content: createSymbolQuickContent(),
    });
    await settleReviewContent();

    expect(reviewContentQuickCardMocks.isQuickCard).toHaveBeenLastCalledWith('block-symbol-quick', 'card-symbol-quick');
    expect(initialProtyle.destroyCallCount).toBeGreaterThan(0);
    expect(wrapper.find('quick-card-renderer-stub').exists()).toBe(true);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'special',
      supportsNativeEdit: false,
      isEditing: false,
    });

    wrapper.unmount();
  });

  it('reveals native riff-sync answers inline on the main Protyle without creating a separate answer pane', async () => {
    setBlockFixture(
      'block-native-riff',
      '<div class="sb" custom-riff-decks="deck-1"><div class="protyle-action"></div><div class="protyle-attr"></div><div data-node-id="front">front</div><div data-node-id="back">back</div></div>',
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
    expect(reviewContentApiMocks.getBlockDocInfo).not.toHaveBeenCalled();
    expect(reviewContentApiMocks.getDocContent).not.toHaveBeenCalled();

    const hostsBeforeReveal = wrapper.findAll('.fsrs-review-v2-content__protyle-host');
    expect(hostsBeforeReveal).toHaveLength(1);
    expect((hostsBeforeReveal[0].element as HTMLDivElement).classList.contains('siyuanmemo-review-card__block--hidesb')).toBe(true);
    expect((hostsBeforeReveal[0].element as HTMLDivElement).classList.contains('card__block--hidesb')).toBe(false);
    expect(reviewContentMocks.instances[0]?.options.render).toMatchObject({
      breadcrumbDocName: false,
      title: false,
      hideTitleOnZoom: false,
    });

    await wrapper.setProps({
      showAnswer: false,
      hasHiddenContent: true,
    });
    await settleReviewContent();

    const hostsAfterReveal = wrapper.findAll('.fsrs-review-v2-content__protyle-host');
    expect(hostsAfterReveal).toHaveLength(1);
    expect((hostsAfterReveal[0].element as HTMLDivElement).style.display).not.toBe('none');
    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentMocks.instances[0]?.destroyCallCount).toBe(0);

    wrapper.unmount();
  });

  it('renders template-backed question blocks with compact Protyle options before showing the answer pane', async () => {
    setBlockFixture('question-block', '<div data-node-id="question-block">question</div>');
    setBlockFixture('answer-block', '<div data-node-id="answer-block">answer</div>');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createBidirectionalTemplateContent(),
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

    await settleProtyleInit();

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentMocks.instances[0]?.options.blockId).toBe('question-block');
    expect(reviewContentMocks.instances[0]?.options.render).toMatchObject({
      breadcrumbDocName: false,
      title: false,
      hideTitleOnZoom: false,
    });

    const hostBeforeReveal = wrapper.find('.fsrs-review-v2-content__protyle-host').element as HTMLDivElement;
    expect(hostBeforeReveal.querySelector('.protyle-wysiwyg')?.textContent).toContain('question');

    await wrapper.setProps({
      showAnswer: false,
    });
    await settleReviewContent();

    expect(reviewContentMocks.instances).toHaveLength(2);
    expect(reviewContentMocks.instances[1]?.options.blockId).toBe('answer-block');
    expect(hostBeforeReveal.style.display).not.toBe('none');

    wrapper.unmount();
  });

  it('uses native document render options for topic document cards and suppresses answer panes', async () => {
    setBlockFixture('topic-doc-root', '<div data-node-id="topic-doc-root">topic document</div>');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createTopicDocumentContent(),
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

    await settleProtyleInit();

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentMocks.instances[0]?.options.blockId).toBe('topic-doc-root');
    expect(reviewContentMocks.instances[0]?.options.action).toEqual([]);
    expect(reviewContentMocks.instances[0]?.options.render).toMatchObject({
      breadcrumbDocName: true,
      title: true,
      hideTitleOnZoom: true,
    });
    expect(wrapper.find('.fsrs-review-v2-content__answer').exists()).toBe(false);

    await wrapper.setProps({
      showAnswer: false,
    });
    await settleReviewContent();

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(wrapper.find('.fsrs-review-v2-content__answer').exists()).toBe(false);

    wrapper.unmount();
  });

  it('keeps cb-get-all for non-document Protyle cards', async () => {
    setBlockFixture('block-1', '<div data-node-id="block-1">question</div>');

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

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentMocks.instances[0]?.options.blockId).toBe('block-1');
    expect(reviewContentMocks.instances[0]?.options.action).toEqual(['cb-get-all']);

    wrapper.unmount();
  });

  it('retries main Protyle rendering when the host was not connected during the first pass', async () => {
    setBlockFixture('question-block', '<div data-node-id="question-block">question</div>');

    const wrapper = mount(ReviewContent, {
      props: {
        app: {},
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createBidirectionalTemplateContent(),
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

    await new Promise(resolve => setTimeout(resolve, 280));
    await flushPromises();
    expect(reviewContentMocks.instances).toHaveLength(0);

    document.body.appendChild(wrapper.element);
    await new Promise(resolve => setTimeout(resolve, 180));
    await settleReviewContent();

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentMocks.instances[0]?.options.blockId).toBe('question-block');

    wrapper.unmount();
  });

  it('reveals inline hidden content by removing hide classes without rebuilding Protyle', async () => {
    setBlockFixture(
      'block-1',
      '<div class="sb" custom-riff-decks="deck-1"><div class="protyle-action"></div><div class="protyle-attr"></div><div data-node-id="front">front</div><div data-node-id="back">back</div></div>',
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
    expect(host.classList.contains('siyuanmemo-review-card__block--hidesb')).toBe(true);
    expect(host.classList.contains('card__block--hidesb')).toBe(false);

    await wrapper.setProps({
      showAnswer: false,
      hasHiddenContent: true,
    });
    await settleReviewContent();

    expect(host.classList.contains('siyuanmemo-review-card__block--hidesb')).toBe(false);
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
    expect(host.classList.contains('siyuanmemo-review-card__block--hidesb')).toBe(false);
    expect(host.classList.contains('siyuanmemo-review-card__block--hideli')).toBe(false);
    expect(host.classList.contains('siyuanmemo-review-card__block--hideh')).toBe(false);
    expect(host.classList.contains('siyuanmemo-review-card__block--hidemark')).toBe(false);
    expect(host.classList.contains('card__block--hidesb')).toBe(false);
    expect(host.classList.contains('card__block--hideli')).toBe(false);
    expect(host.classList.contains('card__block--hideh')).toBe(false);
    expect(host.classList.contains('card__block--hidemark')).toBe(false);

    wrapper.unmount();
  });

  it('keeps superblock hidden classes off when there is only one direct block child', async () => {
    setBlockFixture(
      'block-1',
      '<div class="sb" custom-riff-decks="deck-1"><div class="protyle-action"></div><div class="protyle-attr"></div><div data-node-id="front">front</div></div>',
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
    expect(host.classList.contains('siyuanmemo-review-card__block--hidesb')).toBe(false);
    expect(host.classList.contains('card__block--hidesb')).toBe(false);

    wrapper.unmount();
  });
});
