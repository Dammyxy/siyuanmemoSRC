import type { NativeRiffCompatibilityPort } from '@/application/ports/NativeRiffCompatibilityPort';
import { addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';

export class NativeRiffCompatibilityAdapter implements NativeRiffCompatibilityPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;

  async addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return addRiffCards(deckID, blockIDs);
  }
}
