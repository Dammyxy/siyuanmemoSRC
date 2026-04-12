import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyProgressiveExcerptHighlight,
  prepareProgressiveExcerptHighlight,
  PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR,
} from '../ProgressiveExcerptHighlight';

describe('ProgressiveExcerptHighlight', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('prepares a stable block mutation with the target background color', () => {
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

    const prepared = prepareProgressiveExcerptHighlight({
      blockId: 'block-1',
      text: 'Hello',
      range,
      commonElement: root,
      root,
      protyle: {
        wysiwyg: {
          element: root,
        },
        getInstance: () => ({
          updateTransaction: vi.fn(),
        }),
      } as never,
    });

    expect(prepared).not.toBeNull();
    expect(prepared?.blockId).toBe('block-1');
    expect(prepared?.alreadyApplied).toBe(false);
    expect(prepared?.root).toBe(root);
    expect(prepared?.previousBlockHtml).not.toContain(`background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`);
    expect(prepared?.nextBlockHtml).toContain(`background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`);
    expect(prepared?.nextBlockHtml).toContain('data-type="text"');
  });

  it('persists the prepared mutation through the supplied block-update callback and refreshes the live block', async () => {
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

    const persistDomBlock = vi.fn(async () => undefined);
    const reload = vi.fn();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    const prepared = prepareProgressiveExcerptHighlight({
      blockId: 'block-1',
      text: 'Hello',
      range,
      commonElement: root,
      root,
      protyle: {
        wysiwyg: {
          element: root,
        },
        getInstance: () => ({
          reload,
        }),
      } as never,
    });

    const applied = await applyProgressiveExcerptHighlight(prepared, { persistDomBlock });

    expect(applied).toBe(true);
    expect(persistDomBlock).toHaveBeenCalledTimes(1);
    expect(persistDomBlock).toHaveBeenCalledWith(
      'block-1',
      expect.stringContaining(`background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`),
    );
    expect(root.querySelector('[data-node-id="block-1"]')?.outerHTML).toContain(
      `background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`,
    );
    expect(reload).toHaveBeenCalledWith(false);
  });

  it('treats already-colored selections as no-op success', async () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-node-id="block-1">
          <span data-type="text" style="background-color: var(--b3-font-background4);" id="text">Hello world</span>
        </div>
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

    const prepared = prepareProgressiveExcerptHighlight({
      blockId: 'block-1',
      text: 'Hello',
      range,
      commonElement: root,
      root,
      protyle: {
        wysiwyg: {
          element: root,
        },
        getInstance: () => ({
          reload: vi.fn(),
        }),
      } as never,
    });

    expect(prepared?.alreadyApplied).toBe(true);
    const persistDomBlock = vi.fn(async () => undefined);
    await expect(applyProgressiveExcerptHighlight(prepared, { persistDomBlock })).resolves.toBe(true);
    expect(persistDomBlock).not.toHaveBeenCalled();
  });

  it('returns null when the saved range is no longer attached to the live root', async () => {
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

    const prepared = prepareProgressiveExcerptHighlight({
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

    expect(prepared).toBeNull();
    await expect(
      applyProgressiveExcerptHighlight(prepared, { persistDomBlock: vi.fn(async () => undefined) }),
    ).resolves.toBe(false);
  });

  it('returns false when no block-update callback is provided', async () => {
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

    const prepared = prepareProgressiveExcerptHighlight({
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

    await expect(applyProgressiveExcerptHighlight(prepared)).resolves.toBe(false);
  });
});
