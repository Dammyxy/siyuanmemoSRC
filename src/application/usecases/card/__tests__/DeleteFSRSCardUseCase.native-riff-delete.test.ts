import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import type { FSRSCard } from '@/types/card';
import { DeleteFSRSCardUseCase } from '../DeleteFSRSCardUseCase';
import type { DeleteFSRSCardStoragePort } from '@/core/storage/ports';
import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';

function createStorage(card: FSRSCard): DeleteFSRSCardStoragePort {
  return {
    getCard: vi.fn(() => card),
    getAllCards: vi.fn(() => [card]),
    queryCards: vi.fn(() => [card]),
    setCard: vi.fn(),
    saveCards: vi.fn(async () => undefined),
    deleteCard: vi.fn(async () => ok(undefined)),
  };
}

function createSiyuanPort(): CardDeletionSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    getBlockAttrs: vi.fn(async () => ({})),
    setBlockAttrs: vi.fn(async () => undefined),
    removeRiffCards: vi.fn(async () => ({ name: 'deck', size: 1 })),
  };
}

const card = {
  id: 'card-1',
  xiuyuanID: 'xy-1',
  blockId: 'block-1',
} as unknown as FSRSCard;

describe('DeleteFSRSCardUseCase native Riff delete gate', () => {
  it('rejects legacy deleteFromRiff without native-hard-delete confirmation', async () => {
    const storage = createStorage(card);
    const siyuanApi = createSiyuanPort();
    const useCase = new DeleteFSRSCardUseCase(storage, { siyuanApi });

    const result = await useCase.execute({
      cardId: 'card-1',
      deleteFromRiff: true,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.deletedFromRiff : undefined).toBe(false);
    expect(siyuanApi.removeRiffCards).not.toHaveBeenCalled();
  });

  it('hard-deletes native Riff only with explicit intent and dangerous confirmation', async () => {
    const storage = createStorage(card);
    const siyuanApi = createSiyuanPort();
    const useCase = new DeleteFSRSCardUseCase(storage, { siyuanApi });

    const result = await useCase.execute({
      cardId: 'card-1',
      deleteFromRiff: true,
      deleteIntent: 'native-hard-delete',
      confirmDangerousNativeDelete: true,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.deletedFromRiff : undefined).toBe(true);
    expect(siyuanApi.removeRiffCards).toHaveBeenCalledWith('builtin-deck', ['block-1']);
  });
});
