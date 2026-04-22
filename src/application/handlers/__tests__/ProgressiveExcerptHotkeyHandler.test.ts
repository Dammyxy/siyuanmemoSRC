import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showMessage,
  resolveProgressiveExcerptSelectionSnapshot,
  isProgressiveSelectionInsideNativeProtyle,
  prepareProgressiveExcerptHighlight,
  applyProgressiveExcerptHighlight,
  prepareSelectionClozeMark,
  applyPreparedSelectionClozeMark,
} = vi.hoisted(() => ({
  showMessage: vi.fn(),
  resolveProgressiveExcerptSelectionSnapshot: vi.fn(),
  isProgressiveSelectionInsideNativeProtyle: vi.fn(),
  prepareProgressiveExcerptHighlight: vi.fn(),
  applyProgressiveExcerptHighlight: vi.fn(),
  prepareSelectionClozeMark: vi.fn(),
  applyPreparedSelectionClozeMark: vi.fn(),
}));

vi.mock('siyuan', () => ({
  showMessage,
}));

vi.mock('@/application/entries/ProgressiveSelectionResolver', () => ({
  resolveProgressiveExcerptSelectionSnapshot,
  isProgressiveSelectionInsideNativeProtyle,
}));

vi.mock('@/application/entries/ProgressiveExcerptHighlight', () => ({
  prepareProgressiveExcerptHighlight,
  applyProgressiveExcerptHighlight,
}));

vi.mock('@/application/entries/SelectionClozeMarker', () => ({
  prepareSelectionClozeMark,
  applyPreparedSelectionClozeMark,
}));

import {
  ProgressiveExcerptHotkeyHandler,
  PROGRESSIVE_EXCERPT_REQUEST_EVENT,
} from '../ProgressiveExcerptHotkeyHandler';

const HELLO_CONTENT_DOM = '<div data-type="NodeParagraph" class="p"><div contenteditable="true">Hello</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>';

function createSelectionSnapshot(root: HTMLElement | null, overrides: Record<string, unknown> = {}) {
  const range = document.createRange();
  const commonElement = root || document.body;
  return {
    blockId: 'block-1',
    sourceBlockId: 'block-1',
    sourceBlockIds: ['block-1'],
    text: 'Hello',
    contentDom: HELLO_CONTENT_DOM,
    range,
    blockSelections: [{
      blockId: 'block-1',
      mode: 'range',
      excerptHtml: HELLO_CONTENT_DOM,
      range: range.cloneRange(),
    }],
    commonElement,
    root,
    protyle: { wysiwyg: { element: commonElement } },
    ...overrides,
  };
}

function createHandler(options?: {
  enabled?: boolean;
  createFromSelection?: ReturnType<typeof vi.fn>;
  materializeExcerptSource?: ReturnType<typeof vi.fn>;
  prepareTopicContinuation?: ReturnType<typeof vi.fn>;
  createTopicContinuation?: ReturnType<typeof vi.fn>;
  autoCardHandler?: {
    suppressNextTopicDerivedMarkMutation: ReturnType<typeof vi.fn>;
  };
  i18n?: Record<string, string>;
}) {
  const createFromSelection = options?.createFromSelection ?? vi.fn(async () => ({
    kind: 'created' as const,
    excerptEntityId: 'excerpt-doc-1',
    excerptEntityType: 'doc',
    topicCardId: 'card-1',
    sourceBlockId: 'block-1',
    sourceBlockIds: ['block-1'],
    containerDocId: '',
    recordId: 'record-1',
    colorApplied: false,
  }));
  const materializeExcerptSource = options?.materializeExcerptSource ?? vi.fn(async (selection: ReturnType<typeof createSelectionSnapshot>) => ({
    sourceBlockId: selection.sourceBlockId,
    sourceBlockIds: selection.sourceBlockIds,
    contentDom: selection.contentDom,
    highlightSnapshot: selection,
    reused: false,
  }));
  const prepareTopicContinuation = options?.prepareTopicContinuation ?? vi.fn(() => ({
    rootId: 'doc-root-1',
    topicContext: null,
    normalizedContent: '',
    plannerContent: '',
    artifactContentDom: '',
    decisions: [],
    available: false,
    mode: null,
    highlightTargetCount: 0,
  }));
  const createTopicContinuation = options?.createTopicContinuation ?? vi.fn(async () => ({
    created: 1,
    skipped: 0,
    items: [],
  }));
  const autoCardHandler = options?.autoCardHandler ?? {
    suppressNextTopicDerivedMarkMutation: vi.fn(),
  };
  const updateSourceBlockDom = vi.fn(async () => undefined);
  const tabApplicationService = {
    openDocumentTab: vi.fn(async () => undefined),
    openBlockTab: vi.fn(async () => undefined),
  };

  return {
    handler: new ProgressiveExcerptHotkeyHandler({
      getSettingsService: () => ({
        getSettings: () => ({
          progressiveReading: {
            altXExcerptEnabled: options?.enabled ?? true,
          },
        }),
      }),
      getI18n: () => ({
        progressiveExcerptCreatedHotkey: 'Topic created and added to today',
        progressiveExcerptNoSelection: 'Select text before excerpting',
        progressiveExcerptDisabled: 'Excerpt shortcut is disabled. Enable it in settings first.',
        progressiveExcerptDuplicateJumped: 'This passage was already excerpted.',
        progressiveExcerptMenuLabel: 'Excerpt',
        progressiveExcerptContinuationMenuLabel: '在 Topic 下创建 Item',
        progressiveExcerptContinuationCreated: '已在当前 Topic 下新增 {created} 个 Item',
        progressiveExcerptContinuationCreatedSkipped: '已在当前 Topic 下新增 {created} 个 Item，跳过 {skipped} 个重复项',
        progressiveExcerptContinuationSkipped: '当前 Topic 下已存在相同 Item，已跳过 {skipped} 个重复项',
        progressiveExcerptContinuationFailed: '在 Topic 下创建 Item 失败：{message}',
        progressiveItemUseBatchFillCurrentBlock: '当前选区包含多个高亮，请改用“从当前块高亮补齐 Item”',
        ...(options?.i18n || {}),
      }),
      getSelectionExcerptService: () => ({
        materializeExcerptSource,
        createFromSelection,
        updateSourceBlockDom,
      }),
      getSelectionTopicContinuationService: () => ({
        prepareSelection: prepareTopicContinuation,
        createFromSelection: createTopicContinuation,
      }),
      getAutoCardHandler: () => autoCardHandler,
      getTabApplicationService: () => tabApplicationService,
    } as any),
    createFromSelection,
    prepareTopicContinuation,
    createTopicContinuation,
    autoCardHandler,
    materializeExcerptSource,
    updateSourceBlockDom,
    tabApplicationService,
  };
}

describe('ProgressiveExcerptHotkeyHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    prepareProgressiveExcerptHighlight.mockReset();
    prepareProgressiveExcerptHighlight.mockReturnValue({
      blockId: 'block-1',
      previousBlockHtml: '<div data-node-id="block-1">Hello world</div>',
      nextBlockHtml: '<div data-node-id="block-1"><span data-type="text" style="background-color: var(--b3-font-background4);">Hello</span> world</div>',
      root: document.body,
      protyle: { getInstance: () => ({ reload: vi.fn() }) },
      alreadyApplied: false,
    });
    applyProgressiveExcerptHighlight.mockReset();
    applyProgressiveExcerptHighlight.mockResolvedValue(true);
    prepareSelectionClozeMark.mockReset();
    prepareSelectionClozeMark.mockReturnValue({
      blockId: 'block-1',
      blockIds: ['block-1'],
      previousBlockHtml: '<div data-node-id="block-1">Hello</div>',
      nextBlockHtml: '<div data-node-id="block-1"><span data-type="text mark">Hello</span></div>',
      blockMutations: [{
        blockId: 'block-1',
        previousBlockHtml: '<div data-node-id="block-1">Hello</div>',
        nextBlockHtml: '<div data-node-id="block-1"><span data-type="text mark">Hello</span></div>',
        alreadyApplied: false,
      }],
      root: document.body,
      protyle: { getInstance: () => ({ reload: vi.fn() }) },
      alreadyApplied: false,
    });
    applyPreparedSelectionClozeMark.mockReset();
    applyPreparedSelectionClozeMark.mockResolvedValue('applied');
    isProgressiveSelectionInsideNativeProtyle.mockReset();
    resolveProgressiveExcerptSelectionSnapshot.mockReset();
    showMessage.mockReset();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('creates excerpts from the registered editor command using the provided protyle root', async () => {
    document.body.innerHTML = `
      <div class="protyle" id="editor-root">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Hello world</span>
        </div>
      </div>
    `;

    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(root));

    const { handler, createFromSelection } = createHandler();
    await handler.runFromEditor({
      wysiwyg: {
        element: root,
      },
    } as any);

    expect(isProgressiveSelectionInsideNativeProtyle).toHaveBeenCalledWith({ root });
    expect(resolveProgressiveExcerptSelectionSnapshot).toHaveBeenCalledWith({
      root,
      protyle: {
        wysiwyg: {
          element: root,
        },
      },
    });
    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1'],
      selectedText: 'Hello',
      contentDom: HELLO_CONTENT_DOM,
      origin: 'editor',
    });
    expect(prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenCalledWith('Topic created and added to today', 3000, 'info');
  });

  it('shows the existing selection error when the editor command has no valid single-block selection', async () => {
    document.body.innerHTML = '<div class="protyle" id="editor-root"></div>';
    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(null);

    const { handler, createFromSelection } = createHandler();
    await handler.runFromEditor({
      wysiwyg: {
        element: root,
      },
    } as any);

    expect(createFromSelection).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith('Select text before excerpting', 3000, 'error');
  });

  it('dispatches the review-surface request before attempting editor fallback from the command callback', async () => {
    const reviewRequestListener = vi.fn((event: Event) => {
      event.preventDefault();
    });
    window.addEventListener(PROGRESSIVE_EXCERPT_REQUEST_EVENT, reviewRequestListener as EventListener);

    const { handler, createFromSelection } = createHandler();
    handler.runFromCommand();

    expect(reviewRequestListener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);

    expect(reviewRequestListener).toHaveBeenCalledTimes(1);
    expect(createFromSelection).not.toHaveBeenCalled();

    window.removeEventListener(PROGRESSIVE_EXCERPT_REQUEST_EVENT, reviewRequestListener as EventListener);
  });

  it('falls back to the active native editor selection after the command-panel tick when review does not claim it', async () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(null, {
      commonElement: document.body,
      protyle: { wysiwyg: { element: document.body } },
    }));

    const { handler, createFromSelection } = createHandler();
    handler.runFromCommand();
    await vi.advanceTimersByTimeAsync(0);

    expect(resolveProgressiveExcerptSelectionSnapshot).toHaveBeenCalledWith({
      protyle: undefined,
    });
    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1'],
      selectedText: 'Hello',
      contentDom: HELLO_CONTENT_DOM,
      origin: 'editor',
    });
    expect(prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenCalledWith('Topic created and added to today', 3000, 'info');
  });

  it('keeps excerpt creation successful when highlight replay throws', async () => {
    document.body.innerHTML = `
      <div class="protyle" id="editor-root">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Hello world</span>
        </div>
      </div>
    `;

    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(root));
    applyProgressiveExcerptHighlight.mockImplementation(async () => {
      throw new Error('highlight failed');
    });

    const { handler, createFromSelection } = createHandler();
    await handler.runFromEditor({
      wysiwyg: {
        element: root,
      },
    } as any);

    expect(createFromSelection).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenCalledWith('Topic created and added to today', 3000, 'info');
  });

  it('adds an excerpt item to the content menu for a valid single-block editor selection', async () => {
    document.body.innerHTML = `
      <div class="protyle" id="editor-root">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Hello world</span>
        </div>
      </div>
    `;

    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(root));

    const menu = { addItem: vi.fn() };
    const { handler, createFromSelection } = createHandler({ enabled: false });
    handler.handleContentMenu({
      detail: {
        menu,
        protyle: {
          wysiwyg: {
            element: root,
          },
        },
      },
    });

    expect(menu.addItem).toHaveBeenCalledTimes(1);
    const item = menu.addItem.mock.calls[0][0];
    expect(item.label).toBe('Excerpt');
    expect(item.accelerator).toBeUndefined();

    await item.click();

    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1'],
      selectedText: 'Hello',
      contentDom: HELLO_CONTENT_DOM,
      origin: 'editor',
    });
    expect(prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenCalledWith('Topic created and added to today', 3000, 'info');
  });

  it('keeps only the excerpt entry in ordinary documents without topic/excerpt continuation context', () => {
    document.body.innerHTML = `
      <div class="protyle" id="editor-root">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Hello world</span>
        </div>
      </div>
    `;

    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(root));

    const prepareTopicContinuation = vi.fn(() => ({
      rootId: 'doc-root-1',
      topicContext: null,
      normalizedContent: '',
      plannerContent: '',
      artifactContentDom: '',
      decisions: [],
      mode: null,
      highlightTargetCount: 0,
      available: false,
    }));
    const menu = { addItem: vi.fn() };
    const { handler } = createHandler({ prepareTopicContinuation });
    handler.handleContentMenu({
      detail: {
        menu,
        protyle: {
          wysiwyg: {
            element: root,
          },
          block: {
            rootID: 'doc-root-1',
          },
        },
      },
    });

    expect(prepareTopicContinuation).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'block-1',
      rootId: 'doc-root-1',
      selectedText: 'Hello',
    }));
    expect(menu.addItem).toHaveBeenCalledTimes(1);
    expect(menu.addItem.mock.calls[0][0].label).toBe('Excerpt');
  });

  it('adds a continuation entry in excerpt-doc context and routes it through the selection continuation service', async () => {
    document.body.innerHTML = `
      <div class="protyle" id="editor-root">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Alpha Beta</span>
        </div>
      </div>
    `;

    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(root, {
      text: 'Alpha Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div></div>',
      protyle: {
        wysiwyg: {
          element: root,
        },
        block: {
          rootID: 'excerpt-doc-root-1',
        },
      },
    }));

    const preparation = {
      rootId: 'excerpt-doc-root-1',
      topicContext: {
        topicCardId: 'topic-card-excerpt-root-1',
        topicBlockId: 'excerpt-doc-root-1',
        sourceDocId: 'excerpt-doc-root-1',
        scope: 'doc-root' as const,
      },
      normalizedContent: 'Alpha ==Beta==',
      plannerContent: 'Alpha ==Beta==',
      artifactContentDom: '',
      decisions: [{ id: 'MarkClozeRule', family: 'cloze' }],
      mode: 'planner-derived' as const,
      highlightTargetCount: 1,
      available: true,
    };
    const prepareTopicContinuation = vi.fn(() => preparation);
    const createTopicContinuation = vi.fn(async () => ({
      created: 2,
      skipped: 1,
      items: [],
    }));
    const menu = { addItem: vi.fn() };
    const { handler } = createHandler({
      prepareTopicContinuation,
      createTopicContinuation,
    });
    handler.handleContentMenu({
      detail: {
        menu,
        protyle: {
          wysiwyg: {
            element: root,
          },
          block: {
            rootID: 'excerpt-doc-root-1',
          },
        },
      },
    });

    expect(menu.addItem).toHaveBeenCalledTimes(2);
    expect(menu.addItem.mock.calls[1][0].label).toBe('在 Topic 下创建 Item');

    await menu.addItem.mock.calls[1][0].click();

    expect(createTopicContinuation).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'block-1',
      rootId: 'excerpt-doc-root-1',
      selectedText: 'Alpha Beta',
    }), preparation);
    expect(showMessage).toHaveBeenCalledWith('已在当前 Topic 下新增 2 个 Item，跳过 1 个重复项', 3000, 'info');
  });

  it('shows the continuation success toast for daily-note excerpt blocks', async () => {
    document.body.innerHTML = `
      <div class="protyle" id="editor-root">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Alpha Beta</span>
        </div>
      </div>
    `;

    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(root, {
      text: 'Alpha Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha >> Beta</div></div>',
      protyle: {
        wysiwyg: {
          element: root,
        },
        block: {
          rootID: 'daily-doc-1',
        },
      },
    }));

    const menu = { addItem: vi.fn() };
    const { handler } = createHandler({
      prepareTopicContinuation: vi.fn(() => ({
        rootId: 'daily-doc-1',
        topicContext: {
          topicCardId: 'topic-card-excerpt-block-1',
          topicBlockId: 'block-1',
          sourceDocId: 'daily-doc-1',
          scope: 'block' as const,
        },
        normalizedContent: 'Alpha >> Beta',
        plannerContent: 'Alpha >> Beta',
        artifactContentDom: '',
        decisions: [{ id: 'BasicDirectionRule', family: 'basic' }],
        mode: 'planner-derived' as const,
        highlightTargetCount: 0,
        available: true,
      })),
      createTopicContinuation: vi.fn(async () => ({
        created: 1,
        skipped: 0,
        items: [],
      })),
    });
    handler.handleContentMenu({
      detail: {
        menu,
        protyle: {
          wysiwyg: {
            element: root,
          },
          block: {
            rootID: 'daily-doc-1',
          },
        },
      },
    });

    await menu.addItem.mock.calls[1][0].click();

    expect(showMessage).toHaveBeenCalledWith('已在当前 Topic 下新增 1 个 Item', 3000, 'info');
  });

  it('does not add an excerpt item to the content menu when the selection is invalid', () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(false);

    const menu = { addItem: vi.fn() };
    const { handler } = createHandler();
    handler.handleContentMenu({
      detail: {
        menu,
        protyle: undefined,
      },
    });

    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it('uses the manual Topic -> Item path for plain text selections in topic context', async () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(document.body, {
      protyle: {
        wysiwyg: { element: document.body },
        block: { rootID: 'topic-doc-root-1' },
      },
      text: 'Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
      blockSelections: [{
        blockId: 'block-1',
        mode: 'range',
        excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        beforeHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha </div></div>',
        afterHtml: '<div data-type="NodeParagraph"><div contenteditable="true"> Gamma</div></div>',
      }],
    }));

    const preparation = {
      rootId: 'topic-doc-root-1',
      topicContext: {
        topicCardId: 'topic-card-1',
        topicBlockId: 'topic-doc-root-1',
        sourceDocId: 'topic-doc-root-1',
        scope: 'doc-root' as const,
      },
      normalizedContent: 'Beta',
      plannerContent: 'Alpha ==Beta== Gamma',
      artifactContentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span> Gamma</div></div>',
      answerFingerprint: 'block-1::ManualSelectionClozeRule::Alpha::Beta::Gamma',
      decisions: [{ id: 'ManualSelectionClozeRule', family: 'cloze' }],
      mode: 'manual-cloze' as const,
      highlightTargetCount: 0,
      available: true,
    };
    const createTopicContinuation = vi.fn(async () => ({
      created: 1,
      skipped: 0,
      items: [],
    }));
    const autoCardHandler = {
      suppressNextTopicDerivedMarkMutation: vi.fn(),
    };
    const { handler } = createHandler({
      prepareTopicContinuation: vi.fn(() => preparation),
      createTopicContinuation,
      autoCardHandler,
    });

    await handler.runItemFromEditor({
      wysiwyg: {
        element: document.body,
      },
      block: {
        rootID: 'topic-doc-root-1',
      },
    } as any);

    expect(createTopicContinuation).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'block-1',
      selectedText: 'Beta',
      rootId: 'topic-doc-root-1',
    }), preparation);
    expect(prepareSelectionClozeMark).toHaveBeenCalledTimes(1);
    expect(applyPreparedSelectionClozeMark).toHaveBeenCalledTimes(1);
    expect(autoCardHandler.suppressNextTopicDerivedMarkMutation).toHaveBeenCalledWith('block-1');
    expect(showMessage).toHaveBeenCalledWith('已在当前 Topic 下新增 1 个 Item', 3000, 'info');
  });

  it('surfaces the original Siyuan API error when topic manual cloze persistence fails', async () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(document.body, {
      protyle: {
        wysiwyg: { element: document.body },
        block: { rootID: 'topic-doc-root-1' },
      },
      text: 'Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
      blockSelections: [{
        blockId: 'block-1',
        mode: 'range',
        excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        beforeHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha </div></div>',
        afterHtml: '<div data-type="NodeParagraph"><div contenteditable="true"> Gamma</div></div>',
      }],
    }));

    const preparation = {
      rootId: 'topic-doc-root-1',
      topicContext: {
        topicCardId: 'topic-card-1',
        topicBlockId: 'topic-doc-root-1',
        sourceDocId: 'topic-doc-root-1',
        scope: 'doc-root' as const,
      },
      normalizedContent: 'Beta',
      plannerContent: 'Alpha ==Beta== Gamma',
      artifactContentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span> Gamma</div></div>',
      answerFingerprint: 'block-1::ManualSelectionClozeRule::Alpha::Beta::Gamma',
      decisions: [{ id: 'ManualSelectionClozeRule', family: 'cloze' }],
      mode: 'manual-cloze' as const,
      highlightTargetCount: 0,
      available: true,
    };
    applyPreparedSelectionClozeMark.mockRejectedValueOnce(new Error('Siyuan API Error: invalid DOM'));

    const createTopicContinuation = vi.fn(async () => ({
      created: 1,
      skipped: 0,
      items: [],
    }));
    const { handler } = createHandler({
      prepareTopicContinuation: vi.fn(() => preparation),
      createTopicContinuation,
    });

    await handler.runItemFromEditor({
      wysiwyg: {
        element: document.body,
      },
      block: {
        rootID: 'topic-doc-root-1',
      },
    } as any);

    expect(createTopicContinuation).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith('在 Topic 下创建 Item 失败：Siyuan API Error: invalid DOM', 5000, 'error');
  });

  it('falls back to wrapping the plain selection as a standard cloze outside topic context', async () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(document.body, {
      text: 'Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
    }));

    const prepareTopicContinuation = vi.fn(() => ({
      rootId: 'ordinary-doc-1',
      topicContext: null,
      normalizedContent: 'Beta',
      plannerContent: '',
      artifactContentDom: '',
      decisions: [],
      mode: null,
      highlightTargetCount: 0,
      available: false,
    }));
    const { handler } = createHandler({
      prepareTopicContinuation,
    });

    await handler.runItemFromEditor({
      wysiwyg: {
        element: document.body,
      },
      block: {
        rootID: 'ordinary-doc-1',
      },
    } as any);

    expect(prepareSelectionClozeMark).toHaveBeenCalledTimes(1);
    expect(applyPreparedSelectionClozeMark).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenCalledWith('已将选区标记为挖空，普通卡片会按现有规则生成', 3000, 'info');
  });

  it('runs the new Item command after the command-panel tick and falls back to standard cloze outside topic context', async () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(null, {
      commonElement: document.body,
      protyle: { wysiwyg: { element: document.body } },
      text: 'Beta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
    }));

    const prepareTopicContinuation = vi.fn(() => ({
      rootId: 'ordinary-doc-1',
      topicContext: null,
      normalizedContent: 'Beta',
      plannerContent: '',
      artifactContentDom: '',
      decisions: [],
      mode: null,
      highlightTargetCount: 0,
      available: false,
    }));
    const { handler } = createHandler({ prepareTopicContinuation });

    handler.runItemFromCommand();
    await vi.advanceTimersByTimeAsync(0);

    expect(prepareSelectionClozeMark).toHaveBeenCalledTimes(1);
    expect(applyPreparedSelectionClozeMark).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenCalledWith('已将选区标记为挖空，普通卡片会按现有规则生成', 3000, 'info');
  });

  it('rejects Topic continuation for multi-block selections and shows the single-block message', async () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(document.body, {
      protyle: {
        wysiwyg: { element: document.body },
        block: { rootID: 'topic-doc-root-1' },
      },
      text: 'Beta Gamma',
      blockSelections: [
        {
          blockId: 'block-1',
          mode: 'range',
          excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Beta</div></div>',
        },
        {
          blockId: 'block-2',
          mode: 'range',
          excerptHtml: '<div data-type="NodeParagraph"><div contenteditable="true">Gamma</div></div>',
        },
      ],
    }));

    const prepareTopicContinuation = vi.fn(() => ({
      rootId: 'topic-doc-root-1',
      topicContext: {
        topicCardId: 'topic-card-1',
        topicBlockId: 'topic-doc-root-1',
        sourceDocId: 'topic-doc-root-1',
        scope: 'doc-root' as const,
      },
      normalizedContent: 'Beta Gamma',
      plannerContent: '',
      artifactContentDom: '',
      decisions: [],
      mode: null,
      highlightTargetCount: 0,
      available: false,
    }));
    const createTopicContinuation = vi.fn(async () => ({
      created: 1,
      skipped: 0,
      items: [],
    }));
    const { handler } = createHandler({
      prepareTopicContinuation,
      createTopicContinuation,
    });

    await handler.runItemFromEditor({
      wysiwyg: {
        element: document.body,
      },
      block: {
        rootID: 'topic-doc-root-1',
      },
    } as any);

    expect(createTopicContinuation).not.toHaveBeenCalled();
    expect(prepareSelectionClozeMark).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith('请在单个块内连续选区后再创建 Item', 3000, 'error');
  });

  it('rejects Topic continuation for selections that cover multiple highlighted blanks and points to current-block batch fill', async () => {
    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(document.body, {
      protyle: {
        wysiwyg: { element: document.body },
        block: { rootID: 'topic-doc-root-1' },
      },
      text: 'Beta Delta',
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span> Gamma <span data-type="text mark">Delta</span></div></div>',
    }));

    const createTopicContinuation = vi.fn(async () => ({
      created: 2,
      skipped: 0,
      items: [],
    }));
    const { handler } = createHandler({
      prepareTopicContinuation: vi.fn(() => ({
        rootId: 'topic-doc-root-1',
        topicContext: {
          topicCardId: 'topic-card-1',
          topicBlockId: 'topic-doc-root-1',
          sourceDocId: 'topic-doc-root-1',
          scope: 'doc-root' as const,
        },
        normalizedContent: 'Alpha ==Beta== Gamma ==Delta==',
        plannerContent: 'Alpha ==Beta== Gamma ==Delta==',
        artifactContentDom: '',
        decisions: [{ id: 'MarkClozeRule', family: 'cloze' }],
        mode: 'planner-derived' as const,
        highlightTargetCount: 2,
        available: true,
      })),
      createTopicContinuation,
    });

    await handler.runItemFromEditor({
      wysiwyg: {
        element: document.body,
      },
      block: {
        rootID: 'topic-doc-root-1',
      },
    } as any);

    expect(createTopicContinuation).not.toHaveBeenCalled();
    expect(prepareSelectionClozeMark).not.toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith('当前选区包含多个高亮，请改用“从当前块高亮补齐 Item”', 3000, 'error');
  });

  it('jumps to the existing excerpt instead of recreating it when the same source text is excerpted twice', async () => {
    document.body.innerHTML = `
      <div class="protyle" id="editor-root">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Hello world</span>
        </div>
      </div>
    `;

    const root = document.getElementById('editor-root');
    if (!root) {
      throw new Error('Expected editor root');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue(createSelectionSnapshot(root));

    const createFromSelection = vi.fn(async () => ({
      kind: 'duplicate' as const,
      record: {
        recordId: 'record-1',
        excerptEntityId: 'excerpt-doc-1',
        excerptEntityType: 'doc' as const,
        sourceDocId: 'doc-1',
        sourceBlockId: 'block-1',
        sourceBlockIds: ['block-1'],
        selectedText: 'Hello',
        normalizedFingerprint: 'Hello',
        colorToken: 'var(--b3-font-background4)',
        origin: 'editor' as const,
        createdAt: Date.now(),
        status: 'active' as const,
      },
    }));

    const { handler, tabApplicationService } = createHandler({ createFromSelection });
    await handler.runFromEditor({
      wysiwyg: {
        element: root,
      },
    } as any);

    expect(applyProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(prepareProgressiveExcerptHighlight).toHaveBeenCalledTimes(1);
    expect(tabApplicationService.openDocumentTab).toHaveBeenCalledWith({ docId: 'excerpt-doc-1' });
    expect(showMessage).toHaveBeenCalledWith('This passage was already excerpted.', 3000, 'info');
  });
});
