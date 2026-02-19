/**
 * CardDeletedEvent - 卡片删除事件
 * 
 * @description
 * 当 Card 被删除时发布的领域事件。
 */

import { DomainEvent } from './DomainEvent';

export class CardDeletedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly cardId: string,
    occurredOn?: Date
  ) {
    super(aggregateId, occurredOn);
  }

  getEventName(): string {
    return 'CardDeleted';
  }
}
