import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  createdBlockIds: [] as string[],
}));

vi.mock('siyuan', () => ({
  Protyle: class MockProtyle {
    protyle = {
      gutter: {},
      wysiwyg: {},
    };

    disable = vi.fn();
    enable = vi.fn();
    destroy = vi.fn();

    constructor(_app: unknown, _host: HTMLElement, options: { blockId: string; after?: (protyle: unknown) => void }) {
      mockState.createdBlockIds.push(options.blockId);
      options.after?.(this);
    }
  },
}));

import BrowserPreview from '../BrowserPreview.vue';
import type { BrowserCard } from '../types';

function createCard(overrides: Partial<BrowserCard> = {}): BrowserCard {
  return {
    id: overrides.id ?? 'card-1',
    blockId: overrides.blockId ?? 'block-1',
    deckId: overrides.deckId ?? 'deck-1',
    content: overrides.content ?? 'content',
    fullContent: overrides.fullContent ?? 'content',
    state: overrides.state ?? 0,
    stateLabel: overrides.stateLabel ?? 'New',
    due: overrides.due ?? new Date('2026-03-07T00:00:00.000Z'),
    dueFormatted: overrides.dueFormatted ?? 'today',
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 1,
    retrievability: overrides.retrievability ?? 1,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    lastReview: overrides.lastReview ?? null,
    lastReviewFormatted: overrides.lastReviewFormatted ?? '-',
    interval: overrides.interval ?? 0,
    firstReview: overrides.firstReview ?? null,
    firstReviewFormatted: overrides.firstReviewFormatted ?? '-',
    priority: overrides.priority ?? 0,
    suspended: overrides.suspended ?? false,
    meta: overrides.meta ?? {},
  };
}

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

describe('BrowserPreview', () => {
  beforeEach(() => {
    mockState.createdBlockIds.length = 0;

    const breadcrumbMap: Record<string, Array<Record<string, string>>> = {
      'doc-1': [
        { id: 'doc-1', name: 'Document Title', type: 'NodeDocument' },
      ],
      'doc-root': [
        { id: 'doc-root', name: 'Root Document', type: 'NodeDocument' },
      ],
      'block-1': [
        { id: 'doc-1', name: 'Document Title', type: 'NodeDocument' },
        { id: 'heading-1', name: '1. Intro', type: 'NodeHeading' },
        { id: 'block-1', name: 'Current Block', type: 'NodeParagraph' },
      ],
      'block-2': [
        { id: 'doc-2', name: 'Second Document', type: 'NodeDocument' },
        { id: 'block-2', name: 'Second Block', type: 'NodeParagraph' },
      ],
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

      if (url.endsWith('/api/block/getBlockBreadcrumb')) {
        return {
          json: async () => ({
            code: 0,
            data: breadcrumbMap[String(body.id || '')] ?? [],
          }),
        };
      }

      if (url.endsWith('/api/filetree/getDoc')) {
        return {
          json: async () => ({
            code: 0,
            data: body.id === 'doc-1'
              ? { box: 'box-1', path: '/parent-doc.sy/doc-1.sy' }
              : body.id === 'doc-2'
                ? { box: 'box-1', path: '/doc-2.sy' }
              : body.id === 'doc-root'
                ? { box: 'box-1', path: '/doc-root.sy' }
              : {},
          }),
        };
      }

      if (url.endsWith('/api/query/sql')) {
        return {
          json: async () => ({
            code: 0,
            data: [
              {
                id: 'parent-doc',
                content: 'Parent Document',
                hpath: '/Parent Document',
                path: '/parent-doc.sy',
                type: 'NodeDocument',
              },
            ],
          }),
        };
      }

      if (url.endsWith('/api/notebook/lsNotebooks')) {
        return {
          json: async () => ({
            code: 0,
            data: {
              notebooks: [
                { id: 'box-1', name: 'Notebook One' },
              ],
            },
          }),
        };
      }

      return {
        json: async () => ({ code: 0, data: [] }),
      };
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows document parent path in breadcrumb and document title in the meta area', async () => {
    const wrapper = mount(BrowserPreview, {
      props: {
        app: {} as never,
        card: createCard({
          blockId: 'doc-1',
          content: 'Document Title',
          fullContent: 'Document Title',
          meta: {
            isDocument: true,
            blockType: 'd',
          },
        }),
        mode: 'dialog',
        size: 360,
        i18n: {
          preview: 'Preview',
          jumpToBlock: 'Jump to Block',
        },
      },
    });

    await settle();

    const breadcrumbItems = wrapper.findAll('.card-breadcrumb__item');
    expect(breadcrumbItems).toHaveLength(2);
    expect(breadcrumbItems[0]?.text()).toContain('Notebook One');
    expect(breadcrumbItems[1]?.text()).toContain('Parent Document');
    expect(wrapper.get('.preview__document-title').text()).toBe('Document Title');
    expect(mockState.createdBlockIds).toEqual(['doc-1']);

    await wrapper.get('button[title="Jump to Block"]').trigger('click');
    expect(wrapper.emitted('jump')?.[0]).toEqual(['doc-1']);
  });

  it('falls back to the current document breadcrumb when a root document has no parent path', async () => {
    const wrapper = mount(BrowserPreview, {
      props: {
        app: {} as never,
        card: createCard({
          blockId: 'doc-root',
          content: 'Root Document',
          fullContent: 'Root Document',
          meta: {},
        }),
        mode: 'dialog',
        size: 360,
        i18n: {
          preview: 'Preview',
          jumpToBlock: 'Jump to Block',
        },
      },
    });

    await settle();

    const breadcrumbItems = wrapper.findAll('.card-breadcrumb__item');
    expect(breadcrumbItems).toHaveLength(2);
    expect(breadcrumbItems[0]?.text()).toContain('Notebook One');
    expect(breadcrumbItems[1]?.text()).toContain('Root Document');
    expect(wrapper.get('.preview__document-title').text()).toBe('Root Document');
    expect(mockState.createdBlockIds).toEqual(['doc-root']);
  });

  it('enters temporary ancestor preview and returns to the selected card', async () => {
    const wrapper = mount(BrowserPreview, {
      props: {
        app: {} as never,
        card: createCard({
          blockId: 'block-1',
          content: 'Current Block',
          fullContent: 'Current Block',
          meta: {
            blockType: 'p',
          },
        }),
        mode: 'dialog',
        size: 360,
        i18n: {
          preview: 'Preview',
          jumpToBlock: 'Jump to Block',
          previewTemporary: 'Temporary Preview',
          previewBackToCurrentCard: 'Back to Current Card',
        },
      },
    });

    await settle();

    const breadcrumbs = wrapper.findAll('.card-breadcrumb__item');
    expect(breadcrumbs).toHaveLength(3);
    expect(breadcrumbs[0]?.text()).toContain('Notebook One');
    expect(breadcrumbs[1]?.text()).toContain('Document Title');
    expect(breadcrumbs[2]?.text()).toContain('Intro');

    await breadcrumbs[0]!.trigger('click');
    await settle();

    expect(wrapper.find('.preview__meta-badge').exists()).toBe(false);
    expect(mockState.createdBlockIds.at(-1)).toBe('block-1');

    await breadcrumbs[1]!.trigger('click');
    await settle();

    expect(wrapper.get('.preview__meta-badge').text()).toBe('Temporary Preview');
    expect(wrapper.get('.preview__document-title').text()).toBe('Document Title');
    expect(wrapper.get('.card-breadcrumb__item--active').text()).toContain('Document Title');
    expect(mockState.createdBlockIds.at(-1)).toBe('doc-1');

    await wrapper.get('button[title="Jump to Block"]').trigger('click');
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['doc-1']);

    await wrapper.get('.preview__meta-return').trigger('click');
    await settle();

    expect(wrapper.find('.preview__meta-badge').exists()).toBe(false);
    expect(wrapper.find('.card-breadcrumb__item--active').exists()).toBe(false);
    expect(mockState.createdBlockIds.at(-1)).toBe('block-1');
  });

  it('resets temporary preview state when the selected card changes', async () => {
    const wrapper = mount(BrowserPreview, {
      props: {
        app: {} as never,
        card: createCard({
          blockId: 'block-1',
          content: 'Current Block',
          fullContent: 'Current Block',
          meta: {
            blockType: 'p',
          },
        }),
        mode: 'dialog',
        size: 360,
        i18n: {
          previewTemporary: 'Temporary Preview',
          previewBackToCurrentCard: 'Back to Current Card',
        },
      },
    });

    await settle();
    await wrapper.findAll('.card-breadcrumb__item')[1]!.trigger('click');
    await settle();

    expect(wrapper.find('.preview__meta-badge').exists()).toBe(true);

    await wrapper.setProps({
      card: createCard({
        blockId: 'block-2',
        content: 'Second Block',
        fullContent: 'Second Block',
        meta: {
          blockType: 'p',
        },
      }),
    });
    await settle();

    expect(wrapper.find('.preview__meta-badge').exists()).toBe(false);
    expect(wrapper.find('.card-breadcrumb__item--active').exists()).toBe(false);
    expect(wrapper.findAll('.card-breadcrumb__item')).toHaveLength(2);
    expect(wrapper.findAll('.card-breadcrumb__item')[0]?.text()).toContain('Notebook One');
    expect(wrapper.findAll('.card-breadcrumb__item')[1]?.text()).toContain('Second Document');
    expect(mockState.createdBlockIds.at(-1)).toBe('block-2');
  });

  it('reuses the existing preview instance when the selected block does not change', async () => {
    const wrapper = mount(BrowserPreview, {
      props: {
        app: {} as never,
        card: createCard({
          blockId: 'block-1',
          content: 'Current Block',
          fullContent: 'Current Block',
          meta: {
            blockType: 'p',
          },
        }),
        mode: 'dialog',
        size: 360,
        i18n: {},
      },
    });

    await settle();

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const initialFetchCalls = fetchMock.mock.calls.length;
    const initialCreated = [...mockState.createdBlockIds];

    await wrapper.setProps({
      card: createCard({
        id: 'card-1b',
        blockId: 'block-1',
        content: 'Current Block Updated',
        fullContent: 'Current Block Updated',
        meta: {
          blockType: 'p',
        },
      }),
    });
    await settle();

    expect(mockState.createdBlockIds).toEqual(initialCreated);
    expect(fetchMock.mock.calls).toHaveLength(initialFetchCalls);
    expect(wrapper.findAll('.card-breadcrumb__item')).toHaveLength(3);
  });
});
