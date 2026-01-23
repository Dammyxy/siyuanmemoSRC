import type { QueueEvent } from './types';

export interface QueueMonitor {
  onEvent(event: QueueEvent): void;
}

export class ConsoleQueueMonitor implements QueueMonitor {
  onEvent(event: QueueEvent): void {
    if ((process.env as any)?.DEV_MODE !== 'true') return;
    if (event.ok) {
      console.debug('[FSRS][Queue]', event.op, event.queueId, {
        durationMs: event.durationMs,
        sizeBefore: event.sizeBefore,
        sizeAfter: event.sizeAfter,
      });
    } else {
      console.debug('[FSRS][Queue]', event.op, event.queueId, {
        durationMs: event.durationMs,
        sizeBefore: event.sizeBefore,
        sizeAfter: event.sizeAfter,
        error: event.error,
      });
    }
  }
}

