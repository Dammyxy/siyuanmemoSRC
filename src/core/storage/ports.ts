import type { FSRSCard } from '@/types/card';
import type { Result } from '@/types/result';

/**
 * Minimal read contract for FSRS card storage consumers.
 */
export interface CardReadPort {
  getCard(cardId: string): FSRSCard | undefined;
  getCardByBlockId?(blockId: string): FSRSCard | undefined;
  getAllCards(): FSRSCard[];
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
  deleteCard?(cardId: string): unknown | Promise<unknown>;
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

export interface CardTypeMarkerStoragePort extends CardReadPort, CardWritePort {}

export interface DeleteFSRSCardStoragePort extends CardReadPort, CardWritePort {
  deleteCard?(cardId: string): unknown | Promise<unknown>;
  removeCard?(cardId: string): boolean;
}

export interface UpdateFSRSCardStoragePort extends CardReadPort, CardWritePort {
  updateCard?(card: FSRSCard): unknown | Promise<unknown>;
}

export interface CardApplicationStoragePort extends UpdateFSRSCardStoragePort, DeleteFSRSCardStoragePort {
  save?(): Promise<unknown>;
}

export interface ExtractMetaStoragePort extends Pick<CardReadPort, 'getCard'> {}

export type OptionalDeleteResult = Result<void> | void | boolean | null | undefined;
