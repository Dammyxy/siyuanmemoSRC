/**
 * CardsDeletedEvent - 批量卡片删除事件
 * 
 * @description
 * 当多张 Card 被批量删除时发布的领域事件。
 * 用于批量同步到 Riff 等外部系统，避免频繁触发单个删除事件。
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

export class CardsDeletedEvent extends DomainEvent {
  public readonly deleteIntent: CardDeleteIntent;
  public readonly confirmDangerousNativeDelete: boolean;
  public readonly ownershipProof?: NativeHardDeleteOwnershipProof;
  public readonly requestedBy?: string;

  constructor(
    aggregateId: string,
    public readonly cardIds: string[],
    public readonly blockIds: string[],
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
    return 'CardsDeleted';
  }
}
