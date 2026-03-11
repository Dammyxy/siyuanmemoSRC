import { describe, expect, it, vi } from 'vitest';
import { handoffNeuralNavigationToReviewSurface } from '../reviewSurfaceHandoff';

describe('handoffNeuralNavigationToReviewSurface', () => {
  it('returns tab when an existing neural review tab syncs successfully', async () => {
    const openNeuralRoamDialog = vi.fn();
    const syncExistingNeuralReviewTabToCurrentNode = vi.fn().mockResolvedValue('synced');

    await expect(
      handoffNeuralNavigationToReviewSurface(
        {
          tabManager: { syncExistingNeuralReviewTabToCurrentNode },
          dialogManager: { openNeuralRoamDialog },
        },
        { fallbackNodeId: 'node-1' },
      ),
    ).resolves.toBe('tab');

    expect(syncExistingNeuralReviewTabToCurrentNode).toHaveBeenCalledWith({
      fallbackNodeId: 'node-1',
      focus: true,
    });
    expect(openNeuralRoamDialog).not.toHaveBeenCalled();
  });

  it('falls back to dialog when no neural review tab is available', async () => {
    const openNeuralRoamDialog = vi.fn().mockResolvedValue(undefined);

    await expect(
      handoffNeuralNavigationToReviewSurface(
        {
          tabManager: {
            syncExistingNeuralReviewTabToCurrentNode: vi.fn().mockResolvedValue('missing'),
          },
          dialogManager: { openNeuralRoamDialog },
        },
        { fallbackNodeId: 'node-2' },
      ),
    ).resolves.toBe('dialog');

    expect(openNeuralRoamDialog).toHaveBeenCalledTimes(1);
  });

  it('returns none when no tab exists and dialog fallback is unavailable', async () => {
    await expect(
      handoffNeuralNavigationToReviewSurface({
        tabManager: {
          syncExistingNeuralReviewTabToCurrentNode: vi.fn().mockResolvedValue('missing'),
        },
        dialogManager: null,
      }),
    ).resolves.toBe('none');
  });

  it('returns failed and skips dialog fallback when tab sync fails', async () => {
    const openNeuralRoamDialog = vi.fn();

    await expect(
      handoffNeuralNavigationToReviewSurface({
        tabManager: {
          syncExistingNeuralReviewTabToCurrentNode: vi.fn().mockResolvedValue('failed'),
        },
        dialogManager: { openNeuralRoamDialog },
      }),
    ).resolves.toBe('failed');

    expect(openNeuralRoamDialog).not.toHaveBeenCalled();
  });
});
