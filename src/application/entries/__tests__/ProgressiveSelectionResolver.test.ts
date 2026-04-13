import { beforeEach, describe, expect, it } from 'vitest';
import {
  resolveProgressiveExcerptSelectionSnapshot,
  resolveProgressiveExcerptSnapshotFromBlocks,
} from '../ProgressiveSelectionResolver';

function setLiveSelection(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

describe('ProgressiveSelectionResolver', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('preserves inline elements for single-block rich-text excerpts', () => {
    document.body.innerHTML = `
      <div class="protyle">
        <div class="protyle-wysiwyg" id="root">
          <div data-node-id="block-1" data-type="NodeParagraph" class="p">
            <div contenteditable="true">
              <span id="start">Alpha </span>
              <span data-type="a" data-href="https://example.com" id="link">Link</span>
              <span> Omega</span>
            </div>
            <div class="protyle-attr" contenteditable="false">\u200b</div>
          </div>
        </div>
      </div>
    `;

    const root = document.getElementById('root') as HTMLElement | null;
    const startNode = document.getElementById('start')?.firstChild;
    const linkNode = document.getElementById('link')?.firstChild;
    if (!root || !startNode || !linkNode) {
      throw new Error('Expected rich-text selection fixture');
    }

    const range = document.createRange();
    range.setStart(startNode, 0);
    range.setEnd(linkNode, 4);
    setLiveSelection(range);

    const snapshot = resolveProgressiveExcerptSelectionSnapshot({
      root,
      protyle: { wysiwyg: { element: root } },
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sourceBlockId).toBe('block-1');
    expect(snapshot?.sourceBlockIds).toEqual(['block-1']);
    expect(snapshot?.contentDom).toContain('data-type="a"');
    expect(snapshot?.contentDom).toContain('https://example.com');
    expect(snapshot?.contentDom).not.toContain('data-node-id=');
  });

  it('returns ordered block ids and mixed range/full-block slices for cross-block selections', () => {
    document.body.innerHTML = `
      <div class="protyle">
        <div class="protyle-wysiwyg" id="root">
          <div data-node-id="block-1" data-type="NodeParagraph" class="p">
            <div contenteditable="true">
              <span id="first">Alpha </span>
              <span data-type="a" data-href="https://example.com" id="first-link">Link</span>
            </div>
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
      </div>
    `;

    const root = document.getElementById('root') as HTMLElement | null;
    const firstNode = document.getElementById('first')?.firstChild;
    const lastNode = document.getElementById('last')?.firstChild;
    if (!root || !firstNode || !lastNode) {
      throw new Error('Expected multi-block selection fixture');
    }

    const range = document.createRange();
    range.setStart(firstNode, 1);
    range.setEnd(lastNode, 4);
    setLiveSelection(range);

    const snapshot = resolveProgressiveExcerptSelectionSnapshot({
      root,
      protyle: { wysiwyg: { element: root } },
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sourceBlockIds).toEqual(['block-1', 'block-2', 'block-3']);
    expect(snapshot?.blockSelections.map((selection) => selection.mode)).toEqual(['range', 'full-block', 'range']);
    expect(snapshot?.blockSelections[0]?.beforeHtml).toContain('A');
    expect(snapshot?.blockSelections[2]?.afterHtml).toContain(' end');
    expect(snapshot?.contentDom).toContain('data-type="a"');
    expect(snapshot?.contentDom).toContain('Middle block');
    expect(snapshot?.contentDom).toContain('Tail');
  });

  it('builds full-block snapshots from multiple selected blocks for the block menu flow', () => {
    document.body.innerHTML = `
      <div class="protyle">
        <div class="protyle-wysiwyg" id="root">
          <div data-node-id="block-1" data-type="NodeParagraph" class="p">
            <div contenteditable="true">Alpha <span data-type="a" data-href="https://example.com">Link</span></div>
            <div class="protyle-attr" contenteditable="false">\u200b</div>
          </div>
          <div data-node-id="block-2" data-type="NodeParagraph" class="p">
            <div contenteditable="true">Beta</div>
            <div class="protyle-attr" contenteditable="false">\u200b</div>
          </div>
        </div>
      </div>
    `;

    const firstBlock = document.querySelector('[data-node-id="block-1"]') as HTMLElement | null;
    const secondBlock = document.querySelector('[data-node-id="block-2"]') as HTMLElement | null;
    if (!firstBlock || !secondBlock) {
      throw new Error('Expected block-menu fixture');
    }

    const snapshot = resolveProgressiveExcerptSnapshotFromBlocks([secondBlock, firstBlock]);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.sourceBlockIds).toEqual(['block-1', 'block-2']);
    expect(snapshot?.blockSelections.map((selection) => selection.mode)).toEqual(['full-block', 'full-block']);
    expect(snapshot?.text).toContain('Alpha');
    expect(snapshot?.text).toContain('Beta');
    expect(snapshot?.contentDom).toContain('data-type="a"');
  });
});
