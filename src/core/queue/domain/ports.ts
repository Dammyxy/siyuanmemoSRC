export interface BlockAttributeWritePort {
  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
}

export interface UserNotificationPort {
  notify(message: string): Promise<void>;
}

export interface LeechActionEffectsPort extends BlockAttributeWritePort, UserNotificationPort {}

export interface QueuePersistencePort {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): Promise<void>;
}

export interface AutoFailedCardSinkPort {
  addAutoFailed(cardId: string): Promise<void>;
}

export interface NeuralRoamCardTypeResolverPort {
  resolveCardType(blockId: string): Promise<'item' | 'topic'>;
}

export const NOOP_QUEUE_PERSISTENCE: QueuePersistencePort = {
  get() {
    return null;
  },
  async set(): Promise<void> {
    return;
  },
};

export const NOOP_AUTO_FAILED_CARD_SINK: AutoFailedCardSinkPort = {
  async addAutoFailed(): Promise<void> {
    return;
  },
};

export const NOOP_LEECH_ACTION_EFFECTS: LeechActionEffectsPort = {
  async notify(): Promise<void> {
    return;
  },
  async setBlockAttrs(): Promise<void> {
    return;
  },
};
