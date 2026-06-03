import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, onMounted } from 'vue';
import type { ReviewEditorState } from '../reviewEditorState';
import type { ReviewRenderServices } from '@/application/factories/createReviewRenderServices';
import type { ReviewUIState } from '../types';

const reviewContentMocks = vi.hoisted(() => {
  const instances: Array<{
    disableCallCount: number;
    enableCallCount: number;
    destroyCallCount: number;
    reloadCallCount: number;
    host: HTMLElement;
    options: { render?: Record<string, unknown>; blockId?: string; action?: string[] };
    protyle: { wysiwyg: { element: HTMLElement } };
  }> = [];
  const blockFixtures = new Map<string, string>();
  const deferredAfterBlockIds = new Set<string>();
  const deferredAfterCallbacks = new Map<string, () => void>();

  class MockApp {}

  class MockProtyle {
    disableCallCount = 0;
    enableCallCount = 0;
    destroyCallCount = 0;
    reloadCallCount = 0;
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
      wysiwygElement.contentEditable = 'true';
      wysiwygElement.tabIndex = -1;
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
      if (typeof options.blockId === 'string' && deferredAfterBlockIds.has(options.blockId)) {
        deferredAfterCallbacks.set(options.blockId, () => options.after?.(this));
      } else {
        options.after?.(this);
      }
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

    reload(): void {
      this.reloadCallCount += 1;
    }
  }

  return {
    blockFixtures,
    deferredAfterBlockIds,
    deferredAfterCallbacks,
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

const reviewContentConceptMocks = vi.hoisted(() => ({
  isConceptCard: vi.fn(() => false),
  isConceptDefinitionCard: vi.fn(() => false),
  isDescriptorSemanticCard: vi.fn(() => false),
}));

const reviewContentDescriptorMocks = vi.hoisted(() => ({
  isDescriptorCard: vi.fn(async () => false),
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

vi.mock('@/core/card/render-profile/RenderProfileResolver', async () => {
  const actual = await vi.importActual<typeof import('@/core/card/render-profile/RenderProfileResolver')>(
    '@/core/card/render-profile/RenderProfileResolver',
  );
  return actual;
});

vi.mock('@/core/xiuyuan/cardMeta', () => ({
  isConceptCard: (...args: unknown[]) => reviewContentConceptMocks.isConceptCard(...args),
  isConceptDefinitionCard: (...args: unknown[]) => reviewContentConceptMocks.isConceptDefinitionCard(...args),
  isDescriptorSemanticCard: (...args: unknown[]) => reviewContentConceptMocks.isDescriptorSemanticCard(...args),
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
      return reviewContentDescriptorMocks.isDescriptorCard();
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

function createProtyleContent(blockId = 'block-1', cardId = 'card-1') {
  return {
    type: 'protyle' as const,
    id: blockId,
    data: '',
    card: {
      id: cardId,
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

function createSymbolQuickContent(symbolType = '>>') {
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
        symbolType,
      },
    },
  };
}

function createProgressiveDerivedItemSymbolContent() {
  return {
    type: 'protyle' as const,
    id: 'block-derived-item',
    data: '',
    card: {
      id: 'card-derived-item',
      type: 'item',
      meta: {
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '>>',
        progressive: {
          kind: 'derived-item',
        },
      },
    },
  };
}

function createBidirectionalSingleQuickContent(typeMarker: 'forward' | 'reverse' = 'forward') {
  return {
    type: 'protyle' as const,
    id: 'block-bidirectional-single',
    data: '',
    card: {
      id: `card-bidirectional-single-${typeMarker}`,
      type: 'item',
      meta: {
        templateID: 'builtin-bidirectional-single',
        renderProfile: 'quick-default',
        typeMarker,
      },
    },
  };
}

function createBidirectionalSingleQuickContentWithoutProfile(typeMarker: 'forward' | 'reverse' = 'forward') {
  return {
    type: 'protyle' as const,
    id: 'block-bidirectional-single',
    data: '',
    card: {
      id: `card-bidirectional-single-${typeMarker}`,
      type: 'item',
      meta: {
        templateID: 'builtin-bidirectional-single',
        typeMarker,
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

function createMultiClozeContent() {
  return {
    type: 'protyle' as const,
    id: 'block-multi-cloze',
    data: '',
    card: {
      id: 'card-multi-cloze',
      type: 'item',
      meta: {
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'default',
        renderProfile: 'quick-default',
        source: 'symbol',
        symbolDetected: true,
        cardSource: 'quick-symbol',
        symbolType: '==',
        faceIndex: 0,
        faces: [{
          question: 'Alpha <mark>[...]</mark> beta',
          answer: 'gamma',
        }],
      },
    },
  };
}

function createInlineFormulaMultiClozeContent() {
  return {
    type: 'protyle' as const,
    id: 'block-inline-formula-cloze',
    data: '',
    card: {
      id: 'card-inline-formula-cloze',
      type: 'item',
      meta: {
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'inline-formula-cloze',
        faceIndex: 0,
        faces: [{
          question: '$E = mc^2$ 中的 <mark>[...]</mark>',
          answer: 'm',
        }],
      },
    },
  };
}

function createConceptContent() {
  return {
    type: 'protyle' as const,
    id: 'block-concept',
    data: '',
    card: {
      id: 'card-concept',
      type: 'concept',
      meta: {},
    },
  };
}

function createConceptDefinitionContent() {
  return {
    type: 'protyle' as const,
    id: 'block-concept-definition',
    data: '',
    card: {
      id: 'card-concept-definition',
      type: 'item',
      meta: {},
    },
  };
}

function createSemanticConceptDefinitionContentWithoutMarkers() {
  return {
    type: 'protyle' as const,
    id: 'definition-block',
    data: '',
    card: {
      id: 'card-concept-definition-semantic',
      type: 'item',
      meta: {
        templateID: 'builtin-concept-definition-reverse',
        frontBlockIDs: ['definition-block'],
        backBlockIDs: ['concept-block'],
        fieldMapping: {
          concept: 'concept-block',
          definition: 'definition-block',
        },
      },
    },
  };
}

function createDescriptorContent() {
  return {
    type: 'protyle' as const,
    id: 'block-descriptor',
    data: '',
    card: {
      id: 'card-descriptor',
      type: 'descriptor',
      meta: {},
    },
  };
}

function createSemanticDescriptorContentWithoutMarkers() {
  return {
    type: 'protyle' as const,
    id: 'descriptor-block',
    data: '',
    card: {
      id: 'card-descriptor-semantic',
      type: 'item',
      meta: {
        templateID: 'builtin-concept-descriptor-both',
        frontBlockIDs: ['concept-block', 'descriptor-block'],
        backBlockIDs: ['concept-block', 'descriptor-block'],
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-block',
        },
      },
    },
  };
}

function createStaleMetaPolicyDescriptorContent() {
  return {
    type: 'protyle' as const,
    id: 'descriptor-policy-block',
    data: '',
    card: {
      id: 'card-policy-descriptor',
      blockId: 'card-block-policy-descriptor',
      updatedAt: 12345,
      faceKey: {
        ruleId: 'descriptor-reverse',
        faceIndex: 2,
      },
      type: 'item',
      meta: {
        templateID: 'builtin-multi-cloze',
        clozeRenderMode: 'inline-formula-cloze',
        renderProfile: 'quick-inline-formula',
        typeMarker: 'concept-definition-forward',
        faceIndex: 0,
        faces: [{
          question: 'stale <mark>[...]</mark>',
          answer: 'multi-cloze',
        }],
        fieldMapping: {
          concept: 'concept-block',
          descriptor: 'descriptor-policy-block',
        },
      },
    },
  };
}

function createRenderPolicyMeta(
  content: {
    id: string;
    card?: {
      id?: string;
      blockId?: string;
      updatedAt?: string | number;
      type?: string;
      faceKey?: {
        ruleId?: string;
        cardRuleId?: string;
        faceIndex?: number;
      };
      meta?: Record<string, unknown>;
    };
  },
  rendererKind: 'descriptor' | 'concept-definition' | 'concept' | 'multi-cloze' | 'quick' | 'image-occlusion' | null,
): ReviewUIState['meta'] {
  const card = content.card;
  const cardId = String(card?.id ?? '');
  const blockId = String(card?.blockId ?? content.id);
  const updatedAt = String(card?.updatedAt ?? '');
  const ruleId = String(card?.faceKey?.ruleId ?? card?.faceKey?.cardRuleId ?? `${rendererKind ?? 'main'}-rule`);
  const faceIndex = Number.isFinite(card?.faceKey?.faceIndex) ? Number(card?.faceKey?.faceIndex) : 0;
  return {
    transition: 'none',
    renderContext: {
      version: 1,
      targetKind: 'standard-card',
      targetIdentity: {
        cardId,
        blockId,
        deckId: '',
      },
      schedulerSnapshot: null,
      sourceLineage: null,
      progressiveDisclosure: null,
      renderPayload: {
        contentBlockId: content.id,
        answerBlockId: '',
        cardType: card?.type ?? null,
        meta: { ...(card?.meta ?? {}) },
      },
      renderPolicy: {
        version: 1,
        profile: rendererKind === 'descriptor' ? 'descriptor' : null,
        specialRendererKind: rendererKind,
        semanticKind: rendererKind,
        forceProtyleRender: false,
        forceQuickRender: rendererKind === 'quick',
        quickDetectReason: '',
        cacheTokens: {
          cardId,
          blockId,
          cardType: String(card?.type ?? ''),
          faceToken: `rule:${ruleId}::face:${faceIndex}`,
          ruleId,
          updatedAt,
        },
        legacyProjection: {
          templateID: typeof card?.meta?.templateID === 'string' ? card.meta.templateID : '',
          typeMarker: typeof card?.meta?.typeMarker === 'string' ? card.meta.typeMarker : '',
          faceIndex: typeof card?.meta?.faceIndex === 'number' ? card.meta.faceIndex : 0,
          renderProfile: typeof card?.meta?.renderProfile === 'string' ? card.meta.renderProfile : '',
          clozeRenderMode: typeof card?.meta?.clozeRenderMode === 'string' ? card.meta.clozeRenderMode : '',
          used: ['templateID', 'typeMarker', 'faceIndex', 'renderProfile', 'clozeRenderMode'],
        },
        diagnostics: ['legacy-render-projection-read'],
      },
      allowedActions: ['answer', 'edit'],
      diagnostics: [],
      unavailable: {
        writer: 'not-required',
        backend: 'not-required',
      },
      sourcePayloadIdentity: null,
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

function createEditableListTemplateContent() {
  return {
    type: 'protyle' as const,
    id: 'block-list-template',
    data: '',
    isXiuyuanListTemplate: true,
    xiuyuanMeta: {
      currentIndex: 1,
      allChildren: [
        { id: 'child-1', cue: 'cue-1', answer: 'answer-1', index: 0 },
        { id: 'child-2', cue: 'cue-2', answer: 'answer-2', index: 1 },
      ],
    },
    card: {
      id: 'card-list-template',
      type: 'item',
      meta: {},
    },
  };
}

function createHtmlContent(data = '<p>hello</p>') {
  return {
    type: 'html' as const,
    id: 'html-1',
    data,
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

type EditableTargetProbe = {
  blockId: string;
  rendererKind: string;
  sourceKind: 'block-markdown';
  title?: string;
};

type EditableTargetsExposed = {
  getEditableTargets: () => EditableTargetProbe[];
};

function expectEditableTargets(
  exposed: EditableTargetsExposed,
  expected: Array<Pick<EditableTargetProbe, 'blockId' | 'rendererKind'>>,
): void {
  expect(exposed.getEditableTargets()).toEqual(expected.map(target => expect.objectContaining({
    ...target,
    sourceKind: 'block-markdown',
  })));
}

function findWarnCall(message: string): unknown[] | undefined {
  return reviewContentLoggerMocks.warn.mock.calls.find(([firstArg]) => firstArg === message);
}

function createRenderServicesStub(): ReviewRenderServices {
  return {
    quickCardRenderService: {
      isQuickCard: (blockId?: string, cardId?: string) => reviewContentQuickCardMocks.isQuickCard(blockId, cardId),
    },
    descriptorCardRenderService: {
      isDescriptorCard: (blockId?: string) => reviewContentDescriptorMocks.isDescriptorCard(blockId),
    },
    conceptDefinitionCardRenderService: {},
    conceptCardRenderService: {},
    multiClozeCardRenderService: {},
  } as unknown as ReviewRenderServices;
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
    reviewContentMocks.deferredAfterBlockIds.clear();
    reviewContentMocks.deferredAfterCallbacks.clear();
    reviewContentLoggerMocks.warn.mockReset();
    reviewContentLoggerMocks.error.mockReset();
    reviewContentLoggerMocks.debug.mockReset();
    reviewContentLoggerMocks.info.mockReset();
    reviewContentLoggerMocks.log.mockReset();
    reviewContentLoggerMocks.trace.mockReset();
    reviewContentQuickCardMocks.isQuickCard.mockReset();
    reviewContentQuickCardMocks.isQuickCard.mockResolvedValue(false);
    reviewContentConceptMocks.isConceptCard.mockReset();
    reviewContentConceptMocks.isConceptCard.mockReturnValue(false);
    reviewContentConceptMocks.isConceptDefinitionCard.mockReset();
    reviewContentConceptMocks.isConceptDefinitionCard.mockReturnValue(false);
    reviewContentConceptMocks.isDescriptorSemanticCard.mockReset();
    reviewContentConceptMocks.isDescriptorSemanticCard.mockReturnValue(false);
    reviewContentDescriptorMocks.isDescriptorCard.mockReset();
    reviewContentDescriptorMocks.isDescriptorCard.mockResolvedValue(false);
    reviewContentApiMocks.getBlockDocInfo.mockReset();
    reviewContentApiMocks.getDocContent.mockReset();
    reviewContentApiMocks.getBlockDocInfo.mockResolvedValue({ ial: {} });
    reviewContentApiMocks.getDocContent.mockResolvedValue({ content: '', type: 'NodeDocument' });
    attachTarget = document.createElement('div');
    attachTarget.className = 'fsrs-review-v2';
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'card__action-button card__action-back';
    backButton.textContent = '(p / q)';
    const againButton = document.createElement('button');
    againButton.type = 'button';
    againButton.className = 'card__action-main';
    againButton.setAttribute('data-type', '1');
    againButton.textContent = 'again';
    actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'card__action-main';
    actionButton.setAttribute('data-type', '3');
    actionButton.textContent = 'grade';
    const actionWrap = document.createElement('div');
    actionWrap.className = 'card__action';
    actionWrap.appendChild(backButton);
    actionWrap.appendChild(againButton);
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

  it('tracks main Protyle focus and returns Escape back to the primary review action without relocking', async () => {
    setBlockFixture(
      'block-1',
      '<div data-node-id="selected-block" class="p protyle-wysiwyg--select"><span>Selected text</span></div>',
    );
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
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
    expect(protyle.disableCallCount).toBe(0);
    const selectedBlock = protyle.protyle.wysiwyg.element.querySelector('[data-node-id="selected-block"]') as HTMLElement;
    const selectedText = selectedBlock.querySelector('span')?.firstChild;
    expect(selectedBlock.classList.contains('protyle-wysiwyg--select')).toBe(true);

    protyle.protyle.wysiwyg.element.focus();
    if (selectedText) {
      const range = document.createRange();
      range.selectNodeContents(selectedText);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    await flushPromises();

    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: true,
    });

    const exposed = wrapper.vm as unknown as { exitEditorByEscape: () => boolean };
    expect(exposed.exitEditorByEscape()).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    await flushPromises();

    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: false,
    });
    expect(document.activeElement).toBe(actionButton);
    expect(selectedBlock.classList.contains('protyle-wysiwyg--select')).toBe(false);
    const activeRange = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    expect(activeRange?.commonAncestorContainer).toBe(actionButton);
    expect(protyle.enableCallCount).toBe(0);
    expect(protyle.disableCallCount).toBe(0);

    protyle.protyle.wysiwyg.element.focus();
    await flushPromises();

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
        renderServices: createRenderServicesStub(),
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

  it('forwards custom html block links through the existing tab open service', async () => {
    const openBlockTab = vi.fn(async () => undefined);
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
            getTabApplicationService: () => ({
              openBlockTab,
            }),
          }),
        },
        content: createHtmlContent(
          '<p><span data-type="block-ref" data-id="20260401010101-abcdefg">概念</span> <a href="siyuan://blocks/20260402020202-bcdefgh">链接</a></p>',
        ),
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

    const blockRef = wrapper.element.querySelector('[data-type="block-ref"]') as HTMLElement;
    blockRef.click();
    await flushPromises();
    expect(openBlockTab).toHaveBeenCalledWith({ blockId: '20260401010101-abcdefg' });

    const anchor = wrapper.element.querySelector('a[href^="siyuan://blocks/"]') as HTMLAnchorElement;
    anchor.click();
    await flushPromises();
    expect(openBlockTab).toHaveBeenCalledWith({ blockId: '20260402020202-bcdefgh' });

    wrapper.unmount();
  });

  it('exposes editable targets for supported renderers and keeps image occlusion unsupported', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
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

    const exposed = wrapper.vm as unknown as {
      getEditableTargets: () => EditableTargetProbe[];
      getNativeSplitGuardState: () => {
        rendererKind: string;
        blockNativeTabSplit: boolean;
      };
    };
    expectEditableTargets(exposed, [{
      blockId: 'block-1',
      rendererKind: 'main-protyle',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'main-protyle',
      blockNativeTabSplit: false,
    });

    await wrapper.setProps({
      content: createEditableListTemplateContent(),
    });
    await settleReviewContent();
    expectEditableTargets(exposed, [{
      blockId: 'child-2',
      rendererKind: 'list-template',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'list-template',
      blockNativeTabSplit: true,
    });

    const multiClozeContent = createMultiClozeContent();
    await wrapper.setProps({
      content: multiClozeContent,
      meta: createRenderPolicyMeta(multiClozeContent, 'multi-cloze'),
    });
    await settleReviewContent();
    expectEditableTargets(exposed, [{
      blockId: 'block-multi-cloze',
      rendererKind: 'multi-cloze',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'multi-cloze',
      blockNativeTabSplit: true,
    });

    const inlineFormulaContent = createInlineFormulaMultiClozeContent();
    await wrapper.setProps({
      content: inlineFormulaContent,
      meta: createRenderPolicyMeta(inlineFormulaContent, 'multi-cloze'),
    });
    await settleReviewContent();
    expectEditableTargets(exposed, [{
      blockId: 'block-inline-formula-cloze',
      rendererKind: 'multi-cloze',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'multi-cloze',
      blockNativeTabSplit: true,
    });

    const symbolQuickContent = createSymbolQuickContent();
    await wrapper.setProps({
      content: symbolQuickContent,
      meta: createRenderPolicyMeta(symbolQuickContent, 'quick'),
    });
    await settleReviewContent();
    expectEditableTargets(exposed, [{
      blockId: 'block-symbol-quick',
      rendererKind: 'quick',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'quick',
      blockNativeTabSplit: true,
    });

    const conceptContent = createConceptContent();
    await wrapper.setProps({
      content: conceptContent,
      meta: createRenderPolicyMeta(conceptContent, 'concept'),
    });
    await settleReviewContent();
    expectEditableTargets(exposed, [{
      blockId: 'block-concept',
      rendererKind: 'concept',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'concept',
      blockNativeTabSplit: true,
    });

    const conceptDefinitionContent = createConceptDefinitionContent();
    await wrapper.setProps({
      content: conceptDefinitionContent,
      meta: createRenderPolicyMeta(conceptDefinitionContent, 'concept-definition'),
    });
    await settleReviewContent();
    expectEditableTargets(exposed, [{
      blockId: 'block-concept-definition',
      rendererKind: 'concept-definition',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'concept-definition',
      blockNativeTabSplit: true,
    });

    const descriptorContent = createDescriptorContent();
    await wrapper.setProps({
      content: descriptorContent,
      meta: createRenderPolicyMeta(descriptorContent, 'descriptor'),
    });
    await settleReviewContent();
    expectEditableTargets(exposed, [{
      blockId: 'block-descriptor',
      rendererKind: 'descriptor',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'descriptor',
      blockNativeTabSplit: true,
    });
    const imageOcclusionContent = {
      type: 'protyle' as const,
      id: 'block-image-occlusion',
      data: '',
      card: {
        id: 'card-image-occlusion',
        type: 'item',
        meta: {
          source: 'image-occlusion',
        },
      },
    };
    await wrapper.setProps({
      content: imageOcclusionContent,
      meta: createRenderPolicyMeta(imageOcclusionContent, 'image-occlusion'),
    });
    await settleReviewContent();
    expect(exposed.getEditableTargets()).toEqual([]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'image-occlusion',
      blockNativeTabSplit: true,
    });

    await wrapper.setProps({
      content: createHtmlContent(),
      meta: {
        transition: 'none',
      },
    });
    await settleReviewContent();
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'html',
      blockNativeTabSplit: false,
    });

    await wrapper.setProps({
      content: createEmptyContent(),
    });
    await settleReviewContent();
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'empty',
      blockNativeTabSplit: false,
    });

    wrapper.unmount();
  });

  it('routes concept-definition semantic signals to the dedicated renderer without creating main Protyle, including renderEpoch refreshes', async () => {
    const ConceptDefinitionRendererStub = defineComponent({
      name: 'ConceptDefinitionCardRendererStub',
      setup() {
        return () => h('div', { class: 'concept-definition-renderer-stub' });
      },
    });

    const content = createSemanticConceptDefinitionContentWithoutMarkers();

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'concept-definition'),
        renderEpoch: 0,
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: true,
          DescriptorCardRenderer: true,
          ConceptDefinitionCardRenderer: ConceptDefinitionRendererStub,
          ConceptCardRenderer: true,
        },
      },
    });

    await settleReviewContent();

    const exposed = wrapper.vm as unknown as EditableTargetsExposed;

    expect(wrapper.findComponent({ name: 'ConceptDefinitionCardRendererStub' }).exists()).toBe(true);
    expect(reviewContentMocks.instances).toHaveLength(0);
    expectEditableTargets(exposed, [{
      blockId: 'concept-block',
      rendererKind: 'concept-definition',
    }, {
      blockId: 'definition-block',
      rendererKind: 'concept-definition',
    }]);

    await wrapper.setProps({
      renderEpoch: 1,
    });
    await settleReviewContent();

    expect(wrapper.findComponent({ name: 'ConceptDefinitionCardRendererStub' }).exists()).toBe(true);
    expect(reviewContentMocks.instances).toHaveLength(0);

    wrapper.unmount();
  });

  it('uses concept-definition named source blocks without promoting dependency-only blocks to editable targets', async () => {
    const ConceptDefinitionRendererStub = defineComponent({
      name: 'ConceptDefinitionCardRendererStub',
      setup() {
        return () => h('div', { class: 'concept-definition-renderer-stub' });
      },
    });
    const content = {
      ...createConceptDefinitionContent(),
      id: 'definition-block',
      prepared: {
        rendererKind: 'concept-definition' as const,
        identityKey: 'prepared-cdf',
        viewModel: {
          blockId: 'definition-block',
          breadcrumbs: [{ id: 'breadcrumb-block', name: 'Doc', type: 'd' }],
          dependencyBlockIds: [
            'definition-block',
            'concept-block',
            'breadcrumb-block',
            'sibling-descriptor-block',
          ],
          conceptName: 'Concept',
          conceptBlockId: 'concept-block',
          definitionBlockId: 'definition-block',
          definitionHtml: '',
          frontHtml: '',
          backHtml: '',
          relationArrow: '→',
        },
      },
    };

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'concept-definition'),
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: true,
          DescriptorCardRenderer: true,
          ConceptDefinitionCardRenderer: ConceptDefinitionRendererStub,
          ConceptCardRenderer: true,
        },
      },
    });

    await settleReviewContent();

    const exposed = wrapper.vm as unknown as EditableTargetsExposed;

    expectEditableTargets(exposed, [{
      blockId: 'concept-block',
      rendererKind: 'concept-definition',
    }, {
      blockId: 'definition-block',
      rendererKind: 'concept-definition',
    }]);
    expect(exposed.getEditableTargets().map(target => target.blockId)).not.toContain('breadcrumb-block');
    expect(exposed.getEditableTargets().map(target => target.blockId)).not.toContain('sibling-descriptor-block');

    wrapper.unmount();
  });

  it('routes descriptor semantic signals to the dedicated renderer without waiting for descriptor syntax detection', async () => {
    const DescriptorRendererStub = defineComponent({
      name: 'DescriptorCardRendererStub',
      setup() {
        return () => h('div', { class: 'descriptor-renderer-stub' });
      },
    });

    const content = createSemanticDescriptorContentWithoutMarkers();

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'descriptor'),
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: true,
          DescriptorCardRenderer: DescriptorRendererStub,
          ConceptDefinitionCardRenderer: true,
          ConceptCardRenderer: true,
        },
      },
    });

    await settleReviewContent();

    const exposed = wrapper.vm as unknown as EditableTargetsExposed;

    expect(wrapper.findComponent({ name: 'DescriptorCardRendererStub' }).exists()).toBe(true);
    expect(reviewContentMocks.instances).toHaveLength(0);
    expect(reviewContentDescriptorMocks.isDescriptorCard).not.toHaveBeenCalled();
    expectEditableTargets(exposed, [{
      blockId: 'concept-block',
      rendererKind: 'descriptor',
    }, {
      blockId: 'descriptor-block',
      rendererKind: 'descriptor',
    }]);

    wrapper.unmount();
  });

  it('routes semantic renderer from render context policy before stale raw metadata', async () => {
    const DescriptorRendererStub = defineComponent({
      name: 'DescriptorCardRendererStub',
      setup() {
        return () => h('div', { class: 'descriptor-renderer-stub' });
      },
    });
    const content = createStaleMetaPolicyDescriptorContent();

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'descriptor'),
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: true,
          DescriptorCardRenderer: DescriptorRendererStub,
          ConceptDefinitionCardRenderer: true,
          ConceptCardRenderer: true,
        },
      },
    });

    await settleReviewContent();

    const exposed = wrapper.vm as unknown as {
      getEditableTargets: () => EditableTargetProbe[];
      getNativeSplitGuardState: () => {
        rendererKind: string;
        blockNativeTabSplit: boolean;
      };
    };

    expect(wrapper.findComponent({ name: 'DescriptorCardRendererStub' }).exists()).toBe(true);
    expect(wrapper.find('multi-cloze-card-renderer-stub').exists()).toBe(false);
    expect(wrapper.find('concept-definition-card-renderer-stub').exists()).toBe(false);
    expect(reviewContentMocks.instances).toHaveLength(0);
    expect(reviewContentDescriptorMocks.isDescriptorCard).not.toHaveBeenCalled();
    expect(reviewContentQuickCardMocks.isQuickCard).not.toHaveBeenCalled();
    expectEditableTargets(exposed, [{
      blockId: 'concept-block',
      rendererKind: 'descriptor',
    }, {
      blockId: 'descriptor-policy-block',
      rendererKind: 'descriptor',
    }]);
    expect(exposed.getNativeSplitGuardState()).toEqual({
      rendererKind: 'descriptor',
      blockNativeTabSplit: true,
    });

    wrapper.unmount();
  });

  it('does not promote stale raw semantic metadata when render context policy selects main Protyle', async () => {
    const content = createStaleMetaPolicyDescriptorContent();

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, null),
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

    expect(wrapper.find('multi-cloze-card-renderer-stub').exists()).toBe(false);
    expect(wrapper.find('descriptor-card-renderer-stub').exists()).toBe(false);
    expect(wrapper.find('concept-definition-card-renderer-stub').exists()).toBe(false);
    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(reviewContentMocks.instances[0]?.options.blockId).toBe('descriptor-policy-block');
    expect(reviewContentDescriptorMocks.isDescriptorCard).not.toHaveBeenCalled();
    expect(reviewContentQuickCardMocks.isQuickCard).not.toHaveBeenCalled();
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: false,
    });

    wrapper.unmount();
  });

  it('destroys the old Protyle instance when switching from main renderer to special renderer', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
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

  it('falls back to standard Protyle once when policy-selected quick renderer rejects the card', async () => {
    const QuickRendererRejectingStub = defineComponent({
      name: 'QuickCardRendererStub',
      emits: ['error'],
      setup(_props, { emit }) {
        onMounted(() => {
          emit('error', new Error('not a quick card'));
        });
        return () => h('div', { class: 'quick-card-renderer-stub' });
      },
    });
    const content = createForcedQuickContent();
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'quick'),
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: QuickRendererRejectingStub,
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

  it('keeps progressive derived items on standard Protyle without probing quick detection', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createProgressiveDerivedItemSymbolContent(),
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
    expect(reviewContentQuickCardMocks.isQuickCard).not.toHaveBeenCalled();
    expect(findWarnCall(
      '[SiYuanMemo][ReviewContent] Suppressing invalid forceQuickRender metadata for current session',
    )).toBeUndefined();
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: false,
    });

    wrapper.unmount();
  });

  it('routes persisted symbol quick cards to the quick renderer without building Protyle', async () => {
    const content = createSymbolQuickContent();

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'quick'),
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

  it('routes persisted bidirectional symbol quick cards to the quick renderer without building Protyle', async () => {
    const content = createSymbolQuickContent('<>');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'quick'),
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
    expect(wrapper.find('quick-card-renderer-stub').exists()).toBe(true);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'special',
      supportsNativeEdit: false,
      isEditing: false,
    });

    wrapper.unmount();
  });

  it('routes builtin bidirectional single quick-default cards to the quick renderer without building Protyle', async () => {
    const content = createBidirectionalSingleQuickContent('reverse');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'quick'),
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
    expect(wrapper.find('quick-card-renderer-stub').exists()).toBe(true);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'special',
      supportsNativeEdit: false,
      isEditing: false,
    });

    wrapper.unmount();
  });

  it('routes builtin bidirectional single cards without renderProfile to the quick renderer when policy selects quick', async () => {
    const content = createBidirectionalSingleQuickContentWithoutProfile('forward');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'quick'),
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
    expect(wrapper.find('quick-card-renderer-stub').exists()).toBe(true);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'special',
      supportsNativeEdit: false,
      isEditing: false,
    });

    wrapper.unmount();
  });

  it('routes builtin multi-cloze item cards to the dedicated renderer', async () => {
    const content = createMultiClozeContent();
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'multi-cloze'),
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

    expect(reviewContentMocks.instances).toHaveLength(0);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'multi-cloze',
      supportsNativeEdit: true,
      isEditing: false,
    });
    expect(wrapper.find('multi-cloze-card-renderer-stub').exists()).toBe(true);

    wrapper.unmount();
  });

  it('keeps broad native hide classes off ordinary multi-cloze cards', async () => {
    const content = createMultiClozeContent();
    setBlockFixture(
      'block-multi-cloze',
      '<div data-node-id="block-multi-cloze">危险化学品单位应 <span data-type="mark">具备安全条件</span></div>',
    );

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: true,
        meta: createRenderPolicyMeta(content, 'multi-cloze'),
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

    expect(wrapper.find('quick-card-renderer-stub').exists()).toBe(false);
    expect(wrapper.find('multi-cloze-card-renderer-stub').exists()).toBe(true);
    expect(reviewContentMocks.instances).toHaveLength(0);
    expect(wrapper.find('.fsrs-review-v2-content__protyle-host').exists()).toBe(false);

    await wrapper.setProps({
      showAnswer: false,
      hasHiddenContent: true,
    });
    await settleReviewContent();

    expect(wrapper.find('multi-cloze-card-renderer-stub').exists()).toBe(true);
    expect(reviewContentMocks.instances).toHaveLength(0);

    wrapper.unmount();
  });

  it('routes inline-formula multi-cloze cards to the dedicated renderer without building Protyle', async () => {
    const content = createInlineFormulaMultiClozeContent();
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'multi-cloze'),
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

    expect(reviewContentMocks.instances).toHaveLength(0);
    expect(getEditorStates(wrapper).at(-1)).toEqual({
      renderer: 'special',
      supportsNativeEdit: false,
      isEditing: false,
    });
    expect(wrapper.find('multi-cloze-card-renderer-stub').exists()).toBe(true);

    wrapper.unmount();
  });

  it('switches from main Protyle to quick renderer when render policy arrives for the same card identity', async () => {
    const initialContent = createSymbolQuickContentWithoutIndicators();
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: initialContent,
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

    const quickContent = createSymbolQuickContent();
    await wrapper.setProps({
      content: quickContent,
      meta: createRenderPolicyMeta(quickContent, 'quick'),
    });
    await settleReviewContent();

    expect(reviewContentQuickCardMocks.isQuickCard).not.toHaveBeenCalled();
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
        renderServices: createRenderServicesStub(),
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
        renderServices: createRenderServicesStub(),
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
        renderServices: createRenderServicesStub(),
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
        renderServices: createRenderServicesStub(),
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
        renderServices: createRenderServicesStub(),
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

  it('soft-refreshes the same card without rebuilding Protyle', async () => {
    setBlockFixture('block-1', '<div data-node-id="block-1">question</div>');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
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
        renderEpoch: 0,
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

    const exposed = wrapper.vm as unknown as {
      refreshVisibleContent: (reason?: string) => Promise<boolean>;
    };
    await expect(exposed.refreshVisibleContent('test-soft-refresh')).resolves.toBe(true);
    await settleProtyleInit();

    expect(initialProtyle?.reloadCallCount).toBe(1);
    expect(initialProtyle?.destroyCallCount).toBe(0);
    expect(reviewContentMocks.instances).toHaveLength(1);

    wrapper.unmount();
  });

  it('ignores renderEpoch changes on the main Protyle path', async () => {
    setBlockFixture('block-1', '<div data-node-id="block-1">question</div>');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createProtyleContent(),
        showAnswer: true,
        hasHiddenContent: false,
        meta: {
          transition: 'slide-left',
        },
        renderEpoch: 0,
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

    await wrapper.setProps({ renderEpoch: 1 });
    await settleReviewContent();

    expect(reviewContentMocks.instances).toHaveLength(1);
    expect(initialProtyle?.reloadCallCount).toBe(0);
    expect(initialProtyle?.destroyCallCount).toBe(0);

    wrapper.unmount();
  });

  it('keeps the active Protyle visible while the next card Protyle is pending', async () => {
    setBlockFixture('block-1', '<div data-node-id="block-1">question one</div>');
    setBlockFixture('block-2', '<div data-node-id="block-2">question two</div>');
    reviewContentMocks.deferredAfterBlockIds.add('block-2');

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: createProtyleContent('block-1', 'card-1'),
        showAnswer: true,
        hasHiddenContent: false,
        meta: {
          transition: 'slide-left',
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
      content: createProtyleContent('block-2', 'card-2'),
    });
    await flushPromises();

    expect(reviewContentMocks.instances).toHaveLength(2);
    expect(initialProtyle?.destroyCallCount).toBe(0);
    expect(initialProtyle?.host.isConnected).toBe(true);
    expect(wrapper.find('.fsrs-review-v2-content__protyle-instance[data-pending="true"]').exists()).toBe(true);

    reviewContentMocks.deferredAfterCallbacks.get('block-2')?.();
    await settleReviewContent();

    expect(initialProtyle?.destroyCallCount).toBeGreaterThan(0);
    expect(initialProtyle?.host.isConnected).toBe(false);
    expect(wrapper.find('.fsrs-review-v2-content__protyle-instance[data-pending="true"]').exists()).toBe(false);

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
        renderServices: createRenderServicesStub(),
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
        renderServices: createRenderServicesStub(),
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
        renderServices: createRenderServicesStub(),
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

  it('exposes fallback dependency block ids for the current card', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content: {
          type: 'protyle' as const,
          id: 'definition-block',
          data: '',
          answerBlockID: 'answer-block',
          card: {
            id: 'card-cdf',
            blockId: 'card-block',
            type: 'item',
            meta: {
              frontBlockIDs: ['concept-block'],
              backBlockIDs: ['definition-block'],
              fieldMapping: {
                concept: 'concept-block',
                definition: 'definition-block',
              },
            },
          },
        },
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

    const exposed = wrapper.vm as unknown as { getDependencyBlockIds: () => string[] };
    expect(exposed.getDependencyBlockIds()).toEqual(expect.arrayContaining([
      'definition-block',
      'answer-block',
      'card-block',
      'concept-block',
    ]));

    wrapper.unmount();
  });

  it('merges renderer-refined dependency block ids for concept-definition cards', async () => {
    const ConceptDefinitionRendererStub = defineComponent({
      name: 'ConceptDefinitionCardRendererStub',
      emits: ['loaded'],
      setup() {
        return () => h('div', { class: 'concept-definition-renderer-stub' });
      },
    });

    const content = {
      type: 'protyle' as const,
      id: 'definition-block',
      data: '',
      card: {
        id: 'card-cdf',
        blockId: 'card-block',
        type: 'item',
        meta: {
          frontBlockIDs: ['concept-block'],
          backBlockIDs: ['definition-block'],
          fieldMapping: {
            concept: 'concept-block',
            definition: 'definition-block',
          },
        },
      },
    };

    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        plugin: {
          getContext: () => ({
            getCardStorage: () => null,
          }),
        },
        content,
        showAnswer: true,
        hasHiddenContent: false,
        meta: createRenderPolicyMeta(content, 'concept-definition'),
      },
      global: {
        stubs: {
          transition: false,
          XiuyuanListTemplateCard: true,
          MultiClozeCardRenderer: true,
          ImageOcclusionCardRenderer: true,
          QuickCardRenderer: true,
          DescriptorCardRenderer: true,
          ConceptDefinitionCardRenderer: ConceptDefinitionRendererStub,
          ConceptCardRenderer: true,
        },
      },
    });

    await settleReviewContent();
    const renderer = wrapper.findComponent({ name: 'ConceptDefinitionCardRendererStub' });
    expect(renderer.exists()).toBe(true);
    renderer.vm.$emit('loaded', {
      dependencyBlockIds: ['breadcrumb-1', 'concept-block', 'definition-block'],
    });
    await settleReviewContent();

    const exposed = wrapper.vm as unknown as { getDependencyBlockIds: () => string[] };
    expect(exposed.getDependencyBlockIds()).toEqual(expect.arrayContaining([
      'definition-block',
      'card-block',
      'concept-block',
      'breadcrumb-1',
    ]));

    wrapper.unmount();
  });

  it('does not render the legacy Concept roam action near Review content', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        content: {
          ...createProtyleContent('concept-block', 'concept-card'),
          card: {
            ...createProtyleContent('concept-block', 'concept-card').card,
            type: 'concept',
          },
        },
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
    expect(wrapper.find('.fsrs-review-v2-content__concept-roam').exists()).toBe(false);
    expect(wrapper.emitted('concept-roam')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the legacy Concept roam action hidden after answer reveal', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        content: {
          ...createProtyleContent('concept-block', 'concept-card'),
          card: {
            ...createProtyleContent('concept-block', 'concept-card').card,
            type: 'concept',
          },
        },
        showAnswer: false,
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
    expect(wrapper.find('.fsrs-review-v2-content__concept-roam').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides Concept roam action when no Concept focus resolves', async () => {
    const wrapper = mount(ReviewContent, {
      attachTo: attachTarget,
      props: {
        app: {},
        renderServices: createRenderServicesStub(),
        content: createProtyleContent('item-block', 'item-card'),
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
    expect(wrapper.find('.fsrs-review-v2-content__concept-roam').exists()).toBe(false);
    wrapper.unmount();
  });
});
