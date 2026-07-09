import type { NativeRiffLegacyBlacklistPort } from '@/application/ports/NativeRiffLegacyBlacklistPort';

type LegacyBlacklistStorage = Readonly<{
  getRiffBlacklist(): Set<string>;
  clearRiffBlacklist(): Promise<void>;
}>;

export class UnifiedStorageNativeRiffLegacyBlacklistAdapter
implements NativeRiffLegacyBlacklistPort {
  constructor(private readonly storage: LegacyBlacklistStorage) {}

  async listBlockIds(): Promise<readonly string[]> {
    return Array.from(this.storage.getRiffBlacklist());
  }

  async clear(): Promise<void> {
    await this.storage.clearRiffBlacklist();
  }
}
