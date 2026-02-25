import type { QueueEvent } from './types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueueMonitor');

export interface QueueMonitor {
  onEvent(event: QueueEvent): void;
}

export class ConsoleQueueMonitor implements QueueMonitor {
  onEvent(event: QueueEvent): void {
    if ((process.env as any)?.DEV_MODE !== 'true') return;

    if (event.ok) {
      logger.debug('[Queue]', event.op, event.queueId, {
        durationMs: event.durationMs,
        sizeBefore: event.sizeBefore,
        sizeAfter: event.sizeAfter,
      });
      return;
    }

    logger.debug('[Queue]', event.op, event.queueId, {
      durationMs: event.durationMs,
      sizeBefore: event.sizeBefore,
      sizeAfter: event.sizeAfter,
      error: event.error,
    });
  }
}
