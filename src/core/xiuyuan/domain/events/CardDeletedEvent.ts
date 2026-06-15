/**
 * CardDeletedEvent - 卡片删除事件
 * 
 * @description
 * 当 Card 被删除时发布的领域事件。
 */

import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';
import {
  CARD_DELETE_INTENTS,
  isCardDeleteIntentOptions,
  normalizeCardDeleteIntent,
  type CardDeleteIntent,
  type CardDeleteIntentOptions,
  type NativeHardDeleteOwnershipProof,
} from './CardDeleteIntent';

export class CardDeletedEvent extends DomainEvent {
  public readonly deleteIntent: CardDeleteIntent;
  public readonly confirmDangerousNativeDelete: boolean;
  public readonly ownershipProof?: NativeHardDeleteOwnershipProof;
  public readonly requestedBy?: string;

  constructor(
    aggregateId: string,
    public readonly cardId: string,
    public readonly blockId: string | null,
    deleteIntentOrOccurredOn?: CardDeleteIntent | CardDeleteIntentOptions | Date,
    occurredOn?: Date
  ) {
    super(
      aggregateId,
      deleteIntentOrOccurredOn instanceof Date ? deleteIntentOrOccurredOn : occurredOn,
    );
    const deleteOptions = isCardDeleteIntentOptions(deleteIntentOrOccurredOn)
      ? deleteIntentOrOccurredOn
      : undefined;
    this.deleteIntent = deleteOptions
      ? normalizeCardDeleteIntent(deleteOptions.deleteIntent)
      : deleteIntentOrOccurredOn instanceof Date
        ? CARD_DELETE_INTENTS.localTombstone
        : normalizeCardDeleteIntent(deleteIntentOrOccurredOn);
    this.confirmDangerousNativeDelete = deleteOptions?.confirmDangerousNativeDelete === true;
    this.ownershipProof = deleteOptions?.ownershipProof;
    this.requestedBy = typeof deleteOptions?.requestedBy === 'string' && deleteOptions.requestedBy.trim()
      ? deleteOptions.requestedBy.trim()
      : undefined;
  }

  getEventName(): string {
    return 'CardDeleted';
  }
}
