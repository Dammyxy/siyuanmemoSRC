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

  it('prepares and persists per-block mutations for multi-block excerpts', async () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-node-id="block-1" data-type="NodeParagraph" class="p">
          <div contenteditable="true"><span id="first">Alpha Link</span></div>
          <div class="protyle-attr" contenteditable="false">\u200b</div>
        </div>
        <div data-node-id="block-2" data-type="NodeParagraph" class="p">
          <div contenteditable="true" id="middle">Middle block</div>
          <div class="protyle-attr" contenteditable="false">\u200b</div>
        </div>
        <div data-node-id="block-3" data-type="NodeParagraph" class="p">
          <div contenteditable="true"><span id="last">Tail end</span></div>
          <div class="protyle-attr" contenteditable="false">\u200b</div>
        </div>
      </div>
    `;

    const root = document.getElementById('root');
    const firstTextNode = document.getElementById('first')?.firstChild;
    const lastTextNode = document.getElementById('last')?.firstChild;
    if (!root || !firstTextNode || !lastTextNode) {
      throw new Error('Expected multi-block highlight fixture');
    }

    const reload = vi.fn();
    const persistDomBlock = vi.fn(async () => undefined);

    const firstRange = document.createRange();
    firstRange.setStart(firstTextNode, 6);
    firstRange.setEnd(firstTextNode, 10);

    const lastRange = document.createRange();
    lastRange.setStart(lastTextNode, 0);
    lastRange.setEnd(lastTextNode, 4);

    const snapshot = {
      blockId: 'block-1',
      sourceBlockId: 'block-1',
      sourceBlockIds: ['block-1', 'block-2', 'block-3'],
      text: 'Link\nMiddle block\nTail',
      contentDom: '<div></div>',
      range: firstRange.cloneRange(),
      blockSelections: [
        {
          blockId: 'block-1',
          mode: 'range' as const,
          excerptHtml: '<div></div>',
          range: firstRange.cloneRange(),
        },
        {
          blockId: 'block-2',
          mode: 'full-block' as const,
          excerptHtml: '<div></div>',
        },
        {
          blockId: 'block-3',
          mode: 'range' as const,
          excerptHtml: '<div></div>',
          range: lastRange.cloneRange(),
        },
      ],
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
    };

    const prepared = prepareProgressiveExcerptHighlight(snapshot);

    expect(prepared).not.toBeNull();
    expect(prepared?.blockIds).toEqual(['block-1', 'block-2', 'block-3']);
    expect(prepared?.blockMutations).toHaveLength(3);

    const applied = await applyProgressiveExcerptHighlight(prepared, { persistDomBlock });

    expect(applied).toBe(true);
    expect(persistDomBlock).toHaveBeenCalledTimes(3);
    expect(persistDomBlock).toHaveBeenNthCalledWith(
      1,
      'block-1',
      expect.stringContaining(`background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`),
    );
    expect(persistDomBlock).toHaveBeenNthCalledWith(
      2,
      'block-2',
      expect.stringContaining(`background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`),
    );
    expect(persistDomBlock).toHaveBeenNthCalledWith(
      3,
      'block-3',
      expect.stringContaining(`background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`),
    );
    expect(root.querySelector('[data-node-id="block-2"]')?.outerHTML).toContain(
      `background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`,
    );
    expect(reload).toHaveBeenCalledWith(false);
  });

  it('highlights every editable descendant when a source super block is used as the highlight target', async () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-node-id="super-block-1" data-type="NodeSuperBlock" class="sb">
          <div class="protyle-action"></div>
          <div data-node-id="child-1" data-type="NodeParagraph" class="p">
            <div contenteditable="true" id="first-child">Alpha</div>
            <div class="protyle-attr" contenteditable="false">\u200b</div>
          </div>
          <div data-node-id="child-2" data-type="NodeParagraph" class="p">
            <div contenteditable="true" id="second-child">Beta</div>
            <div class="protyle-attr" contenteditable="false">\u200b</div>
          </div>
          <div class="protyle-attr" contenteditable="false">\u200b</div>
        </div>
      </div>
    `;

    const root = document.getElementById('root');
    const superBlock = root?.querySelector<HTMLElement>('[data-node-id="super-block-1"]');
    if (!root || !superBlock) {
      throw new Error('Expected super block highlight fixture');
    }

    const reload = vi.fn();
    const persistDomBlock = vi.fn(async () => undefined);
    const snapshot = {
      blockId: 'super-block-1',
      sourceBlockId: 'super-block-1',
      sourceBlockIds: ['super-block-1'],
      text: 'Alpha\nBeta',
      contentDom: superBlock.outerHTML,
      range: document.createRange(),
      blockSelections: [
        {
          blockId: 'super-block-1',
          mode: 'full-block' as const,
          excerptHtml: superBlock.outerHTML,
        },
      ],
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
    };

    const prepared = prepareProgressiveExcerptHighlight(snapshot);

    expect(prepared).not.toBeNull();
    expect(prepared?.blockIds).toEqual(['super-block-1']);

    const applied = await applyProgressiveExcerptHighlight(prepared, { persistDomBlock });

    expect(applied).toBe(true);
    expect(persistDomBlock).toHaveBeenCalledTimes(1);
    expect(persistDomBlock).toHaveBeenCalledWith(
      'super-block-1',
      expect.stringContaining(`background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`),
    );
    expect(root.querySelector('#first-child')?.getAttribute('style')).toContain(
      `background-color: ${PROGRESSIVE_EXCERPT_HIGHLIGHT_COLOR};`,
    );
    expect(root.querySelector('#second-child')?.getAttribute('style')).toContain(
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
