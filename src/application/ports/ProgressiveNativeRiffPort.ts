export interface ProgressiveNativeRiffPort {
  readonly BUILTIN_DECK_ID: string;
  addRiffCards(deckID: string, blockIDs: string[]): Promise<{ name: string; size: number }>;
}
