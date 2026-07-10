import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { DataAccessFacade } from '../DataAccessFacade';

describe('DataAccessFacade local card deletion', () => {
  it('delegates only the local card identity when retired delete-sync settings remain readable', async () => {
    const cardService = {
      deleteFSRSCard: vi.fn(async () => ok({ deleted: true })),
    };
    const storage = {
      getSettings: vi.fn(() => ({
        riffIntegration: {
          deleteSync: { enabled: true },
        },
      })),
    };
    const settingsService = {
      getSettings: vi.fn(() => ({
        riffIntegration: {
          deleteSync: { enabled: true },
        },
      })),
    };
    const applicationContext = {};
    const plugin = {
      getContext: vi.fn(() => applicationContext),
    };

    const facade = new DataAccessFacade(
      cardService as never,
      storage as never,
      plugin as never,
      settingsService as never,
      {} as never,
      { getExistingBlockIds: vi.fn(async () => new Set<string>()) },
    );
    facade.setApplicationContext(applicationContext as never);

    await facade.deleteCard('card-1');

    expect(cardService.deleteFSRSCard).toHaveBeenCalledWith({
      cardId: 'card-1',
    });
  });
});
