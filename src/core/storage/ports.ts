import type { FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';
import type { Result } from '@/types/result';
import type { SchedulingWriteSource } from '@/core/scheduler/schedulingStateCleanliness';

export interface CardStorageWriteTransaction {
  readonly token: symbol;
  readonly label: string;
}

export interface CardStorageMutationOptions {
  transaction?: CardStorageWriteTransaction;
  suppressAutosave?: boolean;
}

export interface CardStorageUpdateOptions {
  transaction?: CardStorageWriteTransaction;
  preferIncomingScheduling?: boolean;
  schedulingWriteSource?: SchedulingWriteSource;
  suppressAutosave?: boolean;
  suppressDueIndexSort?: boolean;
}

/**
 * Minimal read contract for FSRS card storage consumers.
 */
export interface CardReadPort {
  getCard(cardId: string): FSRSCard | undefined;
  getCardByBlockId?(blockId: string): FSRSCard | undefined;
  getAllCards(): FSRSCard[];
  queryCards(query?: StructuredCardQuery): FSRSCard[];
}

/**
 * Minimal write contract for FSRS card storage consumers.
 */
export interface CardWritePort {
  setCard(card: FSRSCard): void;
  saveCards(): Promise<void>;
  /**
   * Legacy and unified storage implementations expose different delete signatures.
   * Consumers should treat this as "fire + await if promise" and normalize externally.
   */
  deleteCard?(cardId: string, options?: CardStorageMutationOptions): unknown | Promise<unknown>;
  removeCard?(cardId: string): boolean;
}

/**
 * Optional side-channel for review logs.
 */
export interface ReviewLogWritePort {
  addReviewLog?(log: unknown): Promise<void>;
}

/**
 * Optional side-channel for plugin file persistence.
 */
export interface PluginFilePort {
  readPluginFile?(fileName: string): Promise<string | null>;
  writePluginFile?(fileName: string, content: string): Promise<void>;
}

export interface BrowserCardStoragePort extends CardReadPort {}

export interface CardTypeMarkerStoragePort extends CardReadPort, CardWritePort {
  queryInconsistentCardTypeMarkerIds?(): string[];
}

export interface DeleteFSRSCardStoragePort extends CardReadPort {
  runWriteTransaction?<T>(
    label: string,
    operation: (transaction: CardStorageWriteTransaction) => Promise<T> | T,
    transaction?: CardStorageWriteTransaction,
  ): Promise<T>;
  deleteCard(cardId: string, options?: CardStorageMutationOptions): unknown | Promise<unknown>;
  deleteCards(cardIds: readonly string[], options?: CardStorageMutationOptions): unknown | Promise<unknown>;
  removeCard?(cardId: string): boolean;
}

export interface UpdateFSRSCardStoragePort extends CardReadPort {
  updateCard(card: FSRSCard, options?: CardStorageUpdateOptions): unknown | Promise<unknown>;
  batchUpdateCards(cards: FSRSCard[], options?: CardStorageUpdateOptions): unknown | Promise<unknown>;
}

export interface CardApplicationStoragePort extends UpdateFSRSCardStoragePort, DeleteFSRSCardStoragePort {
}

export interface ExtractMetaStoragePort extends Pick<CardReadPort, 'getCard'> {}

export type OptionalDeleteResult = Result<void> | void | boolean | null | undefined;
