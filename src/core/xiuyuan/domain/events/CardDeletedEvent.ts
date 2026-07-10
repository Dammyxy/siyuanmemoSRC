/**
 * CardDeletedEvent - 卡片删除事件
 * 
 * @description
 * 当 Card 被删除时发布的领域事件。
 */

import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';

export class CardDeletedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly cardId: string,
    public readonly blockId: string | null,
    occurredOn?: Date
  ) {
    super(aggregateId, occurredOn);
  }

  getEventName(): string {
    return 'CardDeleted';
  }
}
