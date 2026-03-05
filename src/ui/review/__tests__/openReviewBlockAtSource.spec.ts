import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Constants, openTab } from 'siyuan';
import { openReviewBlockAtSource } from '../openReviewBlockAtSource';

vi.mock('siyuan', () => ({
  openTab: vi.fn(),
  Constants: {
    CB_GET_FOCUS: 'cb-get-focus',
  },
}));

const openTabMock = vi.mocked(openTab);

describe('openReviewBlockAtSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Constants as { CB_GET_FOCUS?: string }).CB_GET_FOCUS = 'cb-get-focus';
    openTabMock.mockResolvedValue({} as never);
  });

  it('adds focus action by default', async () => {
    await openReviewBlockAtSource({
      app: {} as never,
      blockId: 'block-1',
    });

    expect(openTab).toHaveBeenCalledWith({
      app: {},
      doc: {
        id: 'block-1',
        action: ['cb-get-focus'],
      },
    });
  });

  it('passes right-side position', async () => {
    await openReviewBlockAtSource({
      app: {} as never,
      blockId: 'block-2',
      position: 'right',
    });

    expect(openTab).toHaveBeenCalledWith({
      app: {},
      doc: {
        id: 'block-2',
        action: ['cb-get-focus'],
      },
      position: 'right',
    });
  });

  it('passes openNewTab', async () => {
    await openReviewBlockAtSource({
      app: {} as never,
      blockId: 'block-3',
      openNewTab: true,
    });

    expect(openTab).toHaveBeenCalledWith({
      app: {},
      doc: {
        id: 'block-3',
        action: ['cb-get-focus'],
      },
      openNewTab: true,
    });
  });

  it('passes openInNewWindow', async () => {
    await openReviewBlockAtSource({
      app: {} as never,
      blockId: 'block-4',
      openInNewWindow: true,
    });

    expect(openTab).toHaveBeenCalledWith({
      app: {},
      doc: {
        id: 'block-4',
        action: ['cb-get-focus'],
      },
      openInNewWindow: true,
    });
  });

  it('passes zoomIn when provided', async () => {
    await openReviewBlockAtSource({
      app: {} as never,
      blockId: 'block-5',
      zoomIn: false,
    });

    expect(openTab).toHaveBeenCalledWith({
      app: {},
      doc: {
        id: 'block-5',
        action: ['cb-get-focus'],
        zoomIn: false,
      },
    });
  });

  it('does nothing when blockId is empty', async () => {
    await openReviewBlockAtSource({
      app: {} as never,
      blockId: '',
    });

    expect(openTab).not.toHaveBeenCalled();
  });

  it('falls back to literal action when Constants is missing', async () => {
    (Constants as { CB_GET_FOCUS?: string }).CB_GET_FOCUS = '';

    await openReviewBlockAtSource({
      app: {} as never,
      blockId: 'block-6',
    });

    expect(openTab).toHaveBeenCalledWith({
      app: {},
      doc: {
        id: 'block-6',
        action: ['cb-get-focus'],
      },
    });
  });

  it('waits for openTab promise resolution', async () => {
    let resolveOpenTab: ((value: never) => void) | null = null;
    openTabMock.mockImplementationOnce(() =>
      new Promise((resolve) => {
        resolveOpenTab = resolve as (value: never) => void;
      })
    );

    let completed = false;
    const promise = openReviewBlockAtSource({
      app: {} as never,
      blockId: 'block-7',
    }).then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);

    resolveOpenTab?.({} as never);
    await promise;
    expect(completed).toBe(true);
  });
});
