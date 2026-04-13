import type { ProgressiveNativeRiffPort } from '@/application/ports/ProgressiveNativeRiffPort';
import { addRiffCards, BUILTIN_DECK_ID } from '@/core/siyuan/riff';

export class ProgressiveNativeRiffAdapter implements ProgressiveNativeRiffPort {
  readonly BUILTIN_DECK_ID = BUILTIN_DECK_ID;

  async addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }> {
    return addRiffCards(deckID, blockIDs);
  }
}
