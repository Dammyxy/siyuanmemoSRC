import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockContextResolver } from '@/application/entries/BlockContextResolver';

function createBlock(blockId: string): HTMLElement {
  const block = document.createElement('div');
  block.setAttribute('data-node-id', blockId);
  block.textContent = blockId;
  return block;
}

describe('BlockContextResolver', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  it('uses selected blocks first when they exist', () => {
    const notify = vi.fn();
    const resolver = new BlockContextResolver({ i18n: {}, notify });

    const root = document.createElement('div');
    const selectedBlock = createBlock('selected-block');
    const activeBlock = createBlock('active-block');
    selectedBlock.classList.add('protyle-wysiwyg--select');
    root.append(selectedBlock, activeBlock);
    document.body.appendChild(root);

    const result = resolver.resolve({
      protyle: {
        wysiwyg: {
          element: root,
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result?.source).toBe('selected');
    expect(result?.blockElements.map((element) => element.getAttribute('data-node-id'))).toEqual(['selected-block']);
    expect(notify).not.toHaveBeenCalled();
  });

  it('falls back to current active block when no selected block exists', () => {
    const notify = vi.fn();
    const resolver = new BlockContextResolver({ i18n: {}, notify });

    const block = createBlock('active-block');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    block.appendChild(editor);
    document.body.appendChild(block);
    editor.focus();

    const result = resolver.resolve({});

    expect(result).not.toBeNull();
    expect(result?.source).toBe('active');
    expect(result?.blockElements.map((element) => element.getAttribute('data-node-id'))).toEqual(['active-block']);
    expect(notify).not.toHaveBeenCalled();
  });

  it('returns null and notifies user when no block context is available', () => {
    const notify = vi.fn();
    const resolver = new BlockContextResolver({
      i18n: {
        coreReviewNoBlockContext: '没有上下文',
      },
      notify,
    });

    const result = resolver.resolve({});

    expect(result).toBeNull();
    expect(notify).toHaveBeenCalledWith('没有上下文');
  });
});
