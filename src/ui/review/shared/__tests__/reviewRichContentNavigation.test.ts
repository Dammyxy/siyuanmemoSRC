// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveReviewRichContentTarget,
  routeReviewRichContentClick,
} from '../reviewRichContentNavigation';

function dispatchClick(html: string, selector: string, handlers: Parameters<typeof routeReviewRichContentClick>[1]) {
  document.body.innerHTML = html;
  const element = document.body.querySelector(selector);
  if (!element) {
    throw new Error(`Missing test element: ${selector}`);
  }
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  });
  let bubbled = false;
  document.body.addEventListener('click', () => {
    bubbled = true;
  }, { once: true });
  element.addEventListener('click', (nativeEvent) => {
    routeReviewRichContentClick(nativeEvent as MouseEvent, handlers);
  });
  element.dispatchEvent(event);
  return { event, bubbled };
}

describe('reviewRichContentNavigation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('resolves block references from SiYuan DOM spans and siyuan links', () => {
    document.body.innerHTML = `
      <span data-type="block-ref" data-id="20260401010101-abcdefg">概念</span>
      <span data-type="a" data-href="siyuan://blocks/20260402020202-bcdefgh">链接</span>
    `;

    expect(resolveReviewRichContentTarget(document.querySelector('[data-type="block-ref"]'))).toMatchObject({
      kind: 'block',
      blockId: '20260401010101-abcdefg',
    });
    expect(resolveReviewRichContentTarget(document.querySelector('[data-type="a"]'))).toMatchObject({
      kind: 'block',
      blockId: '20260402020202-bcdefgh',
    });
  });

  it('routes block clicks without bubbling to review actions', () => {
    const openBlock = vi.fn();
    const { event, bubbled } = dispatchClick(
      '<button class="review-action"><span data-type="block-ref" data-id="20260401010101-abcdefg">概念</span></button>',
      '[data-type="block-ref"]',
      { openBlock },
    );

    expect(openBlock).toHaveBeenCalledWith('20260401010101-abcdefg');
    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toBe(false);
  });

  it('routes external links through callback or default window opener', () => {
    const openExternal = vi.fn();
    const explicit = dispatchClick(
      '<a href="https://example.com">外链</a>',
      'a',
      { openExternal },
    );

    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(explicit.event.defaultPrevented).toBe(true);

    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fallback = dispatchClick(
      '<span data-type="a" data-href="https://fallback.example">外链</span>',
      '[data-type="a"]',
      {},
    );

    expect(windowOpen).toHaveBeenCalledWith('https://fallback.example', '_blank', 'noopener,noreferrer');
    expect(fallback.event.defaultPrevented).toBe(true);
  });

  it('routes asset links through callback or default window opener', () => {
    const openAsset = vi.fn();
    const explicit = dispatchClick(
      '<span data-type="a" data-href="assets/paper.pdf">附件</span>',
      '[data-type="a"]',
      { openAsset },
    );

    expect(openAsset).toHaveBeenCalledWith('assets/paper.pdf');
    expect(explicit.event.defaultPrevented).toBe(true);

    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);
    const fallback = dispatchClick(
      '<a href="/assets/image.png">图片</a>',
      'a',
      {},
    );

    expect(windowOpen).toHaveBeenCalledWith('/assets/image.png', '_blank', 'noopener,noreferrer');
    expect(fallback.event.defaultPrevented).toBe(true);
  });

  it('keeps unsafe targets inert', () => {
    const unsafe = vi.fn();
    const { event } = dispatchClick('<a href="javascript:alert(1)">bad</a>', 'a', {
      onUnsafeTarget: unsafe,
    });

    expect(unsafe).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'unsafe',
      href: 'javascript:alert(1)',
    }));
    expect(event.defaultPrevented).toBe(true);
  });
});
