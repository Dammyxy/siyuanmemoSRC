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
