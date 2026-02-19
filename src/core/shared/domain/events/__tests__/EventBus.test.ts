/**
 * EventBus unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../EventBus';
import { DomainEvent } from '../DomainEvent';

// Test event classes
class TestEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly data: string
  ) {
    super(aggregateId);
  }

  getEventName(): string {
    return 'TestEvent';
  }
}

class AnotherTestEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly value: number
  ) {
    super(aggregateId);
  }

  getEventName(): string {
    return 'AnotherTestEvent';
  }
}

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus(false);
  });

  describe('subscribe', () => {
    it('should subscribe to event successfully', () => {
      const handler = vi.fn();
      
      eventBus.subscribe('TestEvent', handler);
      
      expect(eventBus.getSubscriberCount('TestEvent')).toBe(1);
    });

    it('should support multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);
      
      expect(eventBus.getSubscriberCount('TestEvent')).toBe(2);
    });
  });

  describe('publish', () => {
    it('should call all subscribers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);
      
      const event = new TestEvent('agg-1', 'test data');
      await eventBus.publish(event);
      
      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should handle async handlers', async () => {
      const handler = vi.fn(async (event: TestEvent) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return event.data;
      });
      
      eventBus.subscribe('TestEvent', handler);
      
      const event = new TestEvent('agg-1', 'test data');
      await eventBus.publish(event);
      
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should not affect other handlers when one fails', async () => {
      const handler1 = vi.fn(() => {
        throw new Error('Handler 1 failed');
      });
      
      const handler2 = vi.fn();
      
      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);
      
      const event = new TestEvent('agg-1', 'test data');
      
      await expect(eventBus.publish(event)).resolves.not.toThrow();
      expect(handler2).toHaveBeenCalledWith(event);
    });
  });

  describe('publishAll', () => {
    it('should publish all events in order', async () => {
      const handler = vi.fn();
      
      eventBus.subscribe('TestEvent', handler);
      
      const events = [
        new TestEvent('agg-1', 'data 1'),
        new TestEvent('agg-2', 'data 2'),
        new TestEvent('agg-3', 'data 3'),
      ];
      
      await eventBus.publishAll(events);
      
      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, events[0]);
      expect(handler).toHaveBeenNthCalledWith(2, events[1]);
      expect(handler).toHaveBeenNthCalledWith(3, events[2]);
    });
  });

  describe('clear', () => {
    it('should clear all subscriptions', () => {
      const handler = vi.fn();
      
      eventBus.subscribe('TestEvent', handler);
      eventBus.subscribe('AnotherTestEvent', handler);
      
      expect(eventBus.getSubscribedEvents().length).toBe(2);
      
      eventBus.clear();
      
      expect(eventBus.getSubscribedEvents().length).toBe(0);
    });
  });

  describe('event data integrity', () => {
    it('should contain all necessary properties', async () => {
      let capturedEvent: TestEvent | null = null;
      
      const handler = vi.fn((event: TestEvent) => {
        capturedEvent = event;
      });
      
      eventBus.subscribe('TestEvent', handler);
      
      const event = new TestEvent('agg-123', 'test data');
      await eventBus.publish(event);
      
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent!.aggregateId).toBe('agg-123');
      expect(capturedEvent!.data).toBe('test data');
      expect(capturedEvent!.eventId).toBeDefined();
      expect(capturedEvent!.occurredOn).toBeInstanceOf(Date);
      expect(capturedEvent!.getEventName()).toBe('TestEvent');
    });

    it('should support toJSON serialization', async () => {
      const event = new TestEvent('agg-123', 'test data');
      const json = event.toJSON();
      
      expect(json.eventId).toBeDefined();
      expect(json.eventName).toBe('TestEvent');
      expect(json.aggregateId).toBe('agg-123');
      expect(json.occurredOn).toBeDefined();
      expect(json.data).toBe('test data');
    });
  });
});
