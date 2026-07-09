export type NativeRiffImportRestoreCandidate = Readonly<{
  blockId: string;
  nativeCardId: string;
  deckId?: string;
  cardId?: string;
  xiuyuanId?: string;
}>;

export type NativeRiffImportRestoreResult = Readonly<{
  removedExclusion: boolean;
  removedCardTombstoneIds: readonly string[];
  removedXiuyuanTombstoneIds: readonly string[];
}>;

export interface NativeRiffImportRestorePort {
  restoreCandidate(
    candidate: NativeRiffImportRestoreCandidate,
  ): Promise<NativeRiffImportRestoreResult>;
}
