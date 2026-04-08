import { beforeEach, describe, expect, it, vi } from 'vitest';

const toolbarCtor = vi.hoisted(() => vi.fn());
const setInlineMark = vi.hoisted(() => vi.fn());

vi.mock('siyuan', () => ({
  Toolbar: toolbarCtor.mockImplementation(() => ({
    setInlineMark,
  })),
}));

import {
  applyProgressiveExcerptHighlight,
  PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR,
} from '../ProgressiveExcerptHighlight';

describe('applyProgressiveExcerptHighlight', () => {
  beforeEach(() => {
    toolbarCtor.mockClear();
    setInlineMark.mockClear();
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('replays the saved range through Protyle text background highlighting instead of mark', () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-node-id="block-1"><span id="text">Hello world</span></div>
      </div>
    `;

    const root = document.getElementById('root');
    const textNode = document.getElementById('text')?.firstChild;
    if (!root || !textNode) {
      throw new Error('Expected text selection fixture');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    const protyle = {
      wysiwyg: {
        element: root,
      },
    };

    const applied = applyProgressiveExcerptHighlight({
      blockId: 'block-1',
      text: 'Hello',
      range,
      commonElement: root,
      root,
      protyle: protyle as never,
    });

    expect(applied).toBe(true);
    expect(setInlineMark).toHaveBeenCalledWith(
      protyle,
      'text',
      'range',
      {
        type: 'backgroundColor',
        color: PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR,
      },
    );
  });

  it('returns false when the saved range is no longer attached to the live root', () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-node-id="block-1"><span id="text">Hello world</span></div>
      </div>
    `;

    const root = document.getElementById('root');
    const textNode = document.getElementById('text')?.firstChild;
    if (!root || !textNode) {
      throw new Error('Expected text selection fixture');
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    root.remove();

    const applied = applyProgressiveExcerptHighlight({
      blockId: 'block-1',
      text: 'Hello',
      range,
      commonElement: root,
      root,
      protyle: {
        wysiwyg: {
          element: root,
        },
      } as never,
    });

    expect(applied).toBe(false);
    expect(setInlineMark).not.toHaveBeenCalled();
  });
});
