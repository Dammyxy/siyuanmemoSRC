/**
 * CardReviewedEvent - 卡片复习事件
 * 
 * @description
 * 当 Card 被复习时发布的领域事件。
 */

import { DomainEvent } from '@/core/shared/domain/events/DomainEvent';

export class CardReviewedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly cardId: string,
    public readonly rating: number,
    public readonly nextDue: number,
    occurredOn?: Date
  ) {
    super(aggregateId, occurredOn);
  }

  getEventName(): string {
    return 'CardReviewed';
  }
}
