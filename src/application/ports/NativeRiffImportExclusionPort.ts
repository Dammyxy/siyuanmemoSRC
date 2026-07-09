export type NativeRiffImportExclusionSource = 'legacy-blacklist' | 'user';

export type NativeRiffImportExclusion = Readonly<{
  version: 1;
  blockId: string;
  nativeCardId?: string;
  deckId?: string;
  excludedAt: number;
  source: NativeRiffImportExclusionSource;
  reason?: string;
}>;

export type SaveNativeRiffImportExclusionInput = Readonly<{
  blockId: string;
  nativeCardId?: string;
  deckId?: string;
  source: NativeRiffImportExclusionSource;
  reason?: string;
}>;

export interface NativeRiffImportExclusionPort {
  findExclusion(blockId: string): Promise<NativeRiffImportExclusion | null>;
  hasExclusion(blockId: string): Promise<boolean>;
  saveExclusion(
    input: SaveNativeRiffImportExclusionInput,
  ): Promise<NativeRiffImportExclusion>;
  removeExclusion(blockId: string): Promise<boolean>;
}
