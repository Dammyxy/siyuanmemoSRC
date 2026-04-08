import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showMessage,
  resolveProgressiveExcerptSelectionSnapshot,
  isProgressiveSelectionInsideNativeProtyle,
  applyProgressiveExcerptHighlight,
} = vi.hoisted(() => ({
  showMessage: vi.fn(),
  resolveProgressiveExcerptSelectionSnapshot: vi.fn(),
  isProgressiveSelectionInsideNativeProtyle: vi.fn(),
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
  applyProgressiveExcerptHighlight,
}));

import {
  ProgressiveExcerptHotkeyHandler,
  PROGRESSIVE_EXCERPT_REQUEST_EVENT,
} from '../ProgressiveExcerptHotkeyHandler';

function createHandler(options?: {
  enabled?: boolean;
  createFromSelection?: ReturnType<typeof vi.fn>;
  i18n?: Record<string, string>;
}) {
  const createFromSelection = options?.createFromSelection ?? vi.fn(async () => ({
    excerptDocId: 'excerpt-doc-1',
    topicCardId: 'card-1',
    sourceBlockId: 'block-1',
    dailyNoteDocId: '',
  }));

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
        progressiveExcerptNoSelection: 'Select text within a single block before excerpting',
        progressiveExcerptDisabled: 'Excerpt shortcut is disabled. Enable it in settings first.',
        ...(options?.i18n || {}),
      }),
      getSelectionExcerptService: () => ({
        createFromSelection,
      }),
    } as any),
    createFromSelection,
  };
}

describe('ProgressiveExcerptHotkeyHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
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
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue({
      blockId: 'block-1',
      text: 'Hello',
      range: document.createRange(),
      commonElement: root,
      root,
      protyle: { wysiwyg: { element: root } },
    });

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
      selectedText: 'Hello',
      origin: 'editor',
    });
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
    expect(showMessage).toHaveBeenCalledWith('Select text within a single block before excerpting', 3000, 'error');
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
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue({
      blockId: 'block-1',
      text: 'Hello',
      range: document.createRange(),
      commonElement: document.body,
      root: null,
      protyle: { wysiwyg: { element: document.body } },
    });

    const { handler, createFromSelection } = createHandler();
    handler.runFromCommand();
    await vi.advanceTimersByTimeAsync(0);

    expect(resolveProgressiveExcerptSelectionSnapshot).toHaveBeenCalledWith({
      protyle: undefined,
    });
    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'block-1',
      selectedText: 'Hello',
      origin: 'editor',
    });
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
    resolveProgressiveExcerptSelectionSnapshot.mockReturnValue({
      blockId: 'block-1',
      text: 'Hello',
      range: document.createRange(),
      commonElement: root,
      root,
      protyle: { wysiwyg: { element: root } },
    });
    applyProgressiveExcerptHighlight.mockImplementation(() => {
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
});
