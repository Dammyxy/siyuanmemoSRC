import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showMessage,
  resolveProgressiveExcerptSelectionSnapshot,
  isProgressiveSelectionInsideNativeProtyle,
  prepareProgressiveExcerptHighlight,
  applyProgressiveExcerptHighlight,
} = vi.hoisted(() => ({
  showMessage: vi.fn(),
  resolveProgressiveExcerptSelectionSnapshot: vi.fn(),
  isProgressiveSelectionInsideNativeProtyle: vi.fn(),
  prepareProgressiveExcerptHighlight: vi.fn(),
  applyProgressiveExcerptHighlight: vi.fn(),
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
    decisions: [],
    available: false,
  }));
  const createTopicContinuation = options?.createTopicContinuation ?? vi.fn(async () => ({
    created: 1,
    skipped: 0,
    items: [],
  }));
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
        progressiveExcerptCreatedHotkey: 'Excerpt Topic created and added to today',
        progressiveExcerptNoSelection: 'Select text before excerpting',
        progressiveExcerptDisabled: 'Excerpt shortcut is disabled. Enable it in settings first.',
        progressiveExcerptDuplicateJumped: 'This passage was already excerpted.',
        progressiveExcerptMenuLabel: 'Excerpt',
        progressiveExcerptContinuationMenuLabel: '在摘录下制卡',
        progressiveExcerptContinuationCreated: '已在当前摘录下新增 {created} 张练习卡',
        progressiveExcerptContinuationCreatedSkipped: '已在当前摘录下新增 {created} 张练习卡，跳过 {skipped} 个重复项',
        progressiveExcerptContinuationSkipped: '当前摘录下已存在相同练习卡，已跳过 {skipped} 个重复项',
        progressiveExcerptContinuationFailed: '在摘录下制卡失败：{message}',
        ...(options?.i18n || {}),
      }),
      getSelectionExcerptService: () => ({
        materializeExcerptSource,
        createFromSelection,
        updateSourceBlockDom: vi.fn(async () => undefined),
      }),
      getSelectionTopicContinuationService: () => ({
        prepareSelection: prepareTopicContinuation,
        createFromSelection: createTopicContinuation,
      }),
      getTabApplicationService: () => tabApplicationService,
    } as any),
    createFromSelection,
    prepareTopicContinuation,
    createTopicContinuation,
    materializeExcerptSource,
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
    expect(showMessage).toHaveBeenCalledWith('Excerpt Topic created and added to today', 3000, 'info');
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
    expect(showMessage).toHaveBeenCalledWith('Excerpt Topic created and added to today', 3000, 'info');
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
    expect(showMessage).toHaveBeenCalledWith('Excerpt Topic created and added to today', 3000, 'info');
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
    expect(showMessage).toHaveBeenCalledWith('Excerpt Topic created and added to today', 3000, 'info');
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
      decisions: [],
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
      contentDom: '<div data-type="NodeParagraph"><div contenteditable="true">Alpha <span data-type="mark">Beta</span></div></div>',
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
      decisions: [{ id: 'MarkClozeRule', family: 'cloze' }],
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
    expect(menu.addItem.mock.calls[1][0].label).toBe('在摘录下制卡');

    await menu.addItem.mock.calls[1][0].click();

    expect(createTopicContinuation).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'block-1',
      rootId: 'excerpt-doc-root-1',
      selectedText: 'Alpha Beta',
    }), preparation);
    expect(showMessage).toHaveBeenCalledWith('已在当前摘录下新增 2 张练习卡，跳过 1 个重复项', 3000, 'info');
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
        decisions: [{ id: 'BasicDirectionRule', family: 'basic' }],
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

    expect(showMessage).toHaveBeenCalledWith('已在当前摘录下新增 1 张练习卡', 3000, 'info');
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
