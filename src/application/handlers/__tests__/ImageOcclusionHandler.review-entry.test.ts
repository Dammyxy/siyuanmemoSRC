import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageOcclusionHandler } from '../ImageOcclusionHandler';

const apiMocks = vi.hoisted(() => ({
  getBlockAttrs: vi.fn(),
  getBlockKramdown: vi.fn(),
  setBlockAttrs: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Dialog: vi.fn(),
  showMessage: vi.fn(),
}));

vi.mock('@/infrastructure/siyuan/api', () => apiMocks);

describe('ImageOcclusionHandler review entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createHandler() {
    const dialogManager = {
      openRetrievalPracticeWithFilter: vi.fn().mockResolvedValue(undefined),
      openTemporaryDrill: vi.fn().mockResolvedValue(undefined),
    };
    const plugin = {
      i18n: {},
      isMobile: false,
      getContext: () => ({
        getDialogManager: () => dialogManager,
      }),
    };

    return {
      dialogManager,
      handler: new ImageOcclusionHandler(plugin as never) as unknown as {
        openImageOcclusionReviewAll: (blockId: string) => Promise<void>;
        openImageOcclusionTemporaryDrill: (blockId: string) => Promise<void>;
      },
    };
  }

  it('opens image-occlusion retrieval with exact tracked card ids', async () => {
    apiMocks.getBlockAttrs.mockResolvedValue({
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify(['card-mask-1', 'card-mask-2']),
    });
    const { handler, dialogManager } = createHandler();

    await handler.openImageOcclusionReviewAll('image-block-1');

    expect(dialogManager.openRetrievalPracticeWithFilter).toHaveBeenCalledWith({
      blockIds: ['image-block-1'],
      cardIds: ['card-mask-1', 'card-mask-2'],
      preferredCardId: 'card-mask-1',
      dueOnly: false,
    });
  });

  it('opens image-occlusion temporary drill with exact tracked card ids', async () => {
    apiMocks.getBlockAttrs.mockResolvedValue({
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify(['card-mask-2', 'card-mask-3']),
    });
    const { handler, dialogManager } = createHandler();

    await handler.openImageOcclusionTemporaryDrill('image-block-2');

    expect(dialogManager.openTemporaryDrill).toHaveBeenCalledWith(['image-block-2'], {
      cardIds: ['card-mask-2', 'card-mask-3'],
      preferredCardId: 'card-mask-2',
    });
  });
});
