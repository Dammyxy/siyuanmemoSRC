import type { FSRSCard } from '@/types/card';
import type { BatchCardDeleteResult, BatchCardMutationResult, CardMutationOptions, QueueType } from './queue-core';
import type { CardFilter } from './browser-contracts';

export interface IDataRouter {
  getCard(cardId: string): Promise<FSRSCard>;
  getCards(filter?: CardFilter): Promise<FSRSCard[]>;
  updateCard(card: FSRSCard, options?: CardMutationOptions): Promise<void>;
  refreshCommittedBackendReviewCard?(card: FSRSCard): Promise<void>;
  batchUpdateCards?(cards: FSRSCard[], options?: CardMutationOptions): Promise<BatchCardMutationResult>;
  deleteCard(cardId: string): Promise<void>;
  batchDeleteCards?(cardIds: string[]): Promise<BatchCardDeleteResult>;
  getAvailableQueueTypes(): QueueType[];
  getContextMenuOptions(): ContextMenuOption[];
}

export interface ContextMenuOption {
  id: string;
  label: string;
  icon?: string;
  enabled?: boolean;
}

function resolveMenuLabel(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

export function getAdvancedModeContextMenuOptions(i18n?: Record<string, string>): ContextMenuOption[] {
  return [
    { id: 'open', label: resolveMenuLabel(i18n, 'openInTab', 'Open') },
    { id: 'delete', label: resolveMenuLabel(i18n, 'deleteCard', 'Delete') },
    { id: 'add-to-final-drill', label: resolveMenuLabel(i18n, 'addToFinalDrillQueue', 'Add to Deliberate Practice') },
    { id: 'switch-scheduler', label: resolveMenuLabel(i18n, 'switchScheduler', 'Switch Scheduler') },
    { id: 'modify-card-type', label: resolveMenuLabel(i18n, 'modifyCardType', 'Modify Card Type') },
    { id: 'set-priority', label: resolveMenuLabel(i18n, 'setPriority', 'Set Priority') },
  ];
}
