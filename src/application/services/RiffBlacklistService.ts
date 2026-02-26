import { createLogger } from '@/utils/logger';

const logger = createLogger('RiffBlacklistService');

export interface RiffBlacklistServiceConfig {
  enabled: boolean;
}

export interface RiffBlacklistStoragePort {
  addToRiffBlacklist(blockID: string): void;
  removeFromRiffBlacklist(blockID: string): void;
  getRiffBlacklist(): Set<string>;
}

const DEFAULT_CONFIG: RiffBlacklistServiceConfig = {
  enabled: true,
};

export class RiffBlacklistService {
  private config: RiffBlacklistServiceConfig;
  private storage: RiffBlacklistStoragePort;

  constructor(
    storage: RiffBlacklistStoragePort,
    config: RiffBlacklistServiceConfig = DEFAULT_CONFIG,
  ) {
    this.config = config;
    this.storage = storage;
  }

  updateConfig(config: Partial<RiffBlacklistServiceConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  async addToBlacklist(blockId: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.assertValidBlockId(blockId);
    this.storage.addToRiffBlacklist(blockId);
    logger.info(`Added to blacklist: ${blockId}`);
  }

  async removeFromBlacklist(blockId: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.assertValidBlockId(blockId);
    this.storage.removeFromRiffBlacklist(blockId);
    logger.info(`Removed from blacklist: ${blockId}`);
  }

  async isInBlacklist(blockId: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    this.assertValidBlockId(blockId);
    return this.storage.getRiffBlacklist().has(blockId);
  }

  async getBlacklist(): Promise<Set<string>> {
    if (!this.config.enabled) {
      return new Set();
    }

    return new Set(this.storage.getRiffBlacklist());
  }

  async filterBlacklist<T extends { id: string }>(items: T[]): Promise<T[]> {
    if (!this.config.enabled) {
      return items;
    }

    const blacklist = await this.getBlacklist();
    const filtered = items.filter(item => !blacklist.has(item.id));
    const filteredCount = items.length - filtered.length;
    if (filteredCount > 0) {
      logger.info(`Filtered ${filteredCount} blacklisted items`);
    }
    return filtered;
  }

  async cleanupBlacklist(validBlockIds: Set<string>): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }

    const blacklist = await this.getBlacklist();
    const toRemove = Array.from(blacklist).filter(id => !validBlockIds.has(id));
    for (const id of toRemove) {
      await this.removeFromBlacklist(id);
    }

    if (toRemove.length > 0) {
      logger.info(`Cleaned ${toRemove.length} items from blacklist`);
    }
    return toRemove.length;
  }

  async getBlacklistSize(): Promise<number> {
    if (!this.config.enabled) {
      return 0;
    }

    const blacklist = await this.getBlacklist();
    return blacklist.size;
  }

  async clearBlacklist(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const blacklist = await this.getBlacklist();
    for (const id of blacklist) {
      await this.removeFromBlacklist(id);
    }
  }

  private assertValidBlockId(blockId: string): void {
    if (typeof blockId !== 'string' || blockId.trim().length === 0) {
      throw new Error('Invalid block ID');
    }
  }
}
