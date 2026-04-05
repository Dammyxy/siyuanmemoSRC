import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  showMessage,
  resolveProgressiveSelection,
  isProgressiveSelectionInsideNativeProtyle,
} = vi.hoisted(() => ({
  showMessage: vi.fn(),
  resolveProgressiveSelection: vi.fn(),
  isProgressiveSelectionInsideNativeProtyle: vi.fn(),
}));

vi.mock('siyuan', () => ({
  showMessage,
}));

vi.mock('@/application/entries/ProgressiveSelectionResolver', () => ({
  resolveProgressiveSelection,
  isProgressiveSelectionInsideNativeProtyle,
}));

import { ProgressiveExcerptHotkeyHandler } from '../ProgressiveExcerptHotkeyHandler';

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

  it('allows native Alt+X in editor protyle and creates excerpt asynchronously', async () => {
    document.body.innerHTML = `
      <div class="protyle">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Hello world</span>
        </div>
      </div>
    `;
    const target = document.getElementById('target');
    if (!target) {
      throw new Error('Expected editor target');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveSelection.mockReturnValue({
      blockId: 'block-1',
      text: 'Hello',
    });
    const createFromSelection = vi.fn(async () => ({
      excerptDocId: 'excerpt-doc-1',
      topicCardId: 'card-1',
      sourceBlockId: 'block-1',
      dailyNoteDocId: '',
    }));

    const handler = new ProgressiveExcerptHotkeyHandler({
      getSettingsService: () => ({
        getSettings: () => ({
          progressiveReading: {
            altXExcerptEnabled: true,
          },
        }),
      }),
      getI18n: () => ({
        progressiveExcerptCreatedHotkey: 'Excerpt Topic created and added to today',
      }),
      getSelectionExcerptService: () => ({
        createFromSelection,
      }),
    } as any);
    handler.start();

    const event = new KeyboardEvent('keydown', {
      key: 'x',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);

    await vi.advanceTimersByTimeAsync(0);

    expect(createFromSelection).toHaveBeenCalledTimes(1);
    expect(createFromSelection).toHaveBeenCalledWith({
      sourceBlockId: 'block-1',
      selectedText: 'Hello',
      origin: 'editor',
    });
    expect(showMessage).toHaveBeenCalledWith('Excerpt Topic created and added to today', 3000, 'info');

    handler.stop();
  });

  it('does nothing when the selection is not inside a native protyle surface', async () => {
    document.body.innerHTML = '<div><span id="target" contenteditable="true">Hello world</span></div>';
    const target = document.getElementById('target');
    if (!target) {
      throw new Error('Expected editor target');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(false);
    resolveProgressiveSelection.mockReturnValue({
      blockId: 'block-1',
      text: 'Hello',
    });
    const createFromSelection = vi.fn();
    const handler = new ProgressiveExcerptHotkeyHandler({
      getSettingsService: () => ({
        getSettings: () => ({
          progressiveReading: {
            altXExcerptEnabled: true,
          },
        }),
      }),
      getSelectionExcerptService: () => ({
        createFromSelection,
      }),
    } as any);
    handler.start();

    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'x',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }));

    await vi.advanceTimersByTimeAsync(0);

    expect(createFromSelection).not.toHaveBeenCalled();
    expect(showMessage).not.toHaveBeenCalled();

    handler.stop();
  });

  it('lets native Alt+X pass through without creating excerpts when the feature is disabled', async () => {
    document.body.innerHTML = `
      <div class="protyle">
        <div data-node-id="block-1">
          <span id="target" contenteditable="true">Hello world</span>
        </div>
      </div>
    `;
    const target = document.getElementById('target');
    if (!target) {
      throw new Error('Expected editor target');
    }

    isProgressiveSelectionInsideNativeProtyle.mockReturnValue(true);
    resolveProgressiveSelection.mockReturnValue({
      blockId: 'block-1',
      text: 'Hello',
    });
    const createFromSelection = vi.fn();
    const handler = new ProgressiveExcerptHotkeyHandler({
      getSettingsService: () => ({
        getSettings: () => ({
          progressiveReading: {
            altXExcerptEnabled: false,
          },
        }),
      }),
      getSelectionExcerptService: () => ({
        createFromSelection,
      }),
    } as any);
    handler.start();

    const event = new KeyboardEvent('keydown', {
      key: 'x',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);

    await vi.advanceTimersByTimeAsync(0);

    expect(createFromSelection).not.toHaveBeenCalled();
    expect(showMessage).not.toHaveBeenCalled();

    handler.stop();
  });
});
