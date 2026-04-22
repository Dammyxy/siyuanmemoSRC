import { describe, expect, it, vi } from 'vitest';
import {
  applyPreparedSelectionClozeMark,
  prepareSelectionClozeMark,
  type PreparedSelectionClozeMark,
} from '../SelectionClozeMarker';

function createSnapshotWithRange(html: string, selectedText: string) {
  document.body.innerHTML = html;
  const root = document.getElementById('root');
  const block = root?.querySelector<HTMLElement>('[data-node-id="block-1"]');
  const editable = block?.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!root || !block || !editable) {
    throw new Error('Expected root, block, and editable content');
  }

  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  let matchedNode: Text | null = null;
  let startOffset = -1;
  while (current) {
    if (current instanceof Text) {
      const offset = current.textContent?.indexOf(selectedText) ?? -1;
      if (offset >= 0) {
        matchedNode = current;
        startOffset = offset;
        break;
      }
    }
    current = walker.nextNode();
  }

  if (!matchedNode || startOffset < 0) {
    throw new Error(`Expected to find selection text: ${selectedText}`);
  }

  const range = document.createRange();
  range.setStart(matchedNode, startOffset);
  range.setEnd(matchedNode, startOffset + selectedText.length);

  return {
    blockId: 'block-1',
    sourceBlockId: 'block-1',
    sourceBlockIds: ['block-1'],
    text: selectedText,
    contentDom: block.outerHTML,
    range,
    commonElement: editable,
    root,
    protyle: {
      wysiwyg: { element: root },
      getInstance: () => ({ reload: vi.fn() }),
    },
  };
}

describe('SelectionClozeMarker', () => {
  it('wraps plain selected text with a tokenized text+mark span', () => {
    const prepared = prepareSelectionClozeMark(createSnapshotWithRange(
      '<div id="root"><div data-node-id="block-1"><div contenteditable="true">Alpha Beta Gamma</div></div></div>',
      'Beta',
    ));

    expect(prepared).not.toBeNull();
    expect(prepared?.alreadyApplied).toBe(false);
    expect(prepared?.nextBlockHtml).toContain('data-type="text mark"');
    expect(prepared?.nextBlockHtml).toContain('Beta');
  });

  it('treats tokenized mark spans as already applied', () => {
    const prepared = prepareSelectionClozeMark(createSnapshotWithRange(
      '<div id="root"><div data-node-id="block-1"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span> Gamma</div></div></div>',
      'Beta',
    ));

    expect(prepared).not.toBeNull();
    expect(prepared?.alreadyApplied).toBe(true);
    expect(prepared?.blockMutations[0]?.alreadyApplied).toBe(true);
  });

  it('returns an explicit apply result after persisting DOM mutations', async () => {
    const prepared = prepareSelectionClozeMark(createSnapshotWithRange(
      '<div id="root"><div data-node-id="block-1"><div contenteditable="true">Alpha Beta Gamma</div></div></div>',
      'Beta',
    ));
    const persistDomBlock = vi.fn(async () => undefined);

    await expect(applyPreparedSelectionClozeMark(prepared, { persistDomBlock })).resolves.toBe('applied');
    expect(persistDomBlock).toHaveBeenCalledWith(
      'block-1',
      expect.stringContaining('data-type="text mark"'),
    );
  });

  it('rethrows the original Siyuan persistence error instead of collapsing to false', async () => {
    const prepared: PreparedSelectionClozeMark = {
      blockId: 'block-1',
      blockIds: ['block-1'],
      previousBlockHtml: '<div data-node-id="block-1"><div contenteditable="true">Alpha Beta</div></div>',
      nextBlockHtml: '<div data-node-id="block-1"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div></div>',
      blockMutations: [{
        blockId: 'block-1',
        previousBlockHtml: '<div data-node-id="block-1"><div contenteditable="true">Alpha Beta</div></div>',
        nextBlockHtml: '<div data-node-id="block-1"><div contenteditable="true">Alpha <span data-type="text mark">Beta</span></div></div>',
        alreadyApplied: false,
      }],
      root: document.body,
      protyle: null,
      alreadyApplied: false,
    };
    const kernelError = new Error('Siyuan API Error: invalid DOM');

    await expect(applyPreparedSelectionClozeMark(prepared, {
      persistDomBlock: vi.fn(async () => {
        throw kernelError;
      }),
    })).rejects.toBe(kernelError);
  });
});
