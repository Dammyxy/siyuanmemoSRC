export interface XiuyuanRiffBlacklistRuntimeDeps<TRiffCard extends { id: string }> {
  filterBlacklist: (cards: TRiffCard[]) => Promise<TRiffCard[]>;
  getBlacklist: () => Promise<Set<string>>;
}

export class XiuyuanRiffBlacklistRuntime<TRiffCard extends { id: string }> {
  constructor(private readonly deps: XiuyuanRiffBlacklistRuntimeDeps<TRiffCard>) {}

  async filterCandidates(input: {
    enabled: boolean;
    cards: TRiffCard[];
  }): Promise<{
    cards: TRiffCard[];
    skippedCount: number;
  }> {
    if (!input.enabled) {
      return {
        cards: input.cards,
        skippedCount: 0,
      };
    }
    const beforeFilterCount = input.cards.length;
    const cards = await this.deps.filterBlacklist(input.cards);
    return {
      cards,
      skippedCount: beforeFilterCount - cards.length,
    };
  }

  async planCleanup(activeRiffBlockIds: Set<string>): Promise<string[]> {
    const blacklist = await this.deps.getBlacklist();
    return Array.from(blacklist).filter((blockId) => !activeRiffBlockIds.has(blockId));
  }
}
