/**
 * CardCreatedEvent - 卡片创建事件
 * 
 * @description
 * 当 Card 被创建时发布的领域事件。
 */

import { DomainEvent } from './DomainEvent';

export class CardCreatedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly cardId: string,
    public readonly faceIndex: number,
    occurredOn?: Date
  ) {
    super(aggregateId, occurredOn);
  }

  getEventName(): string {
    return 'CardCreated';
  }
}
