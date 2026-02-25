import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';
import { getBlockAttrs, setBlockAttrs } from './api';
import { BUILTIN_DECK_ID, removeRiffCards } from '@/core/siyuan/riff';

export class CardDeletionSiyuanAdapter implements CardDeletionSiyuanPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;

  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }

  async removeRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return removeRiffCards(deckID, blockIDs);
  }
}
