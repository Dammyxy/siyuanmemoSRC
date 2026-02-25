import { pushErrMsg } from '@/infrastructure/siyuan/api';
import type { ErrorNotificationPort } from '@/core/scheduler/ports';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SiyuanErrorNotificationAdapter');

/**
 * Infrastructure adapter: push scheduler errors to SiYuan notification center.
 */
export class SiyuanErrorNotificationAdapter implements ErrorNotificationPort {
  async notifyError(message: string): Promise<void> {
    try {
      await pushErrMsg(message);
    } catch (error) {
      // Never block domain flow because notification channel fails.
      logger.error('Failed to push error notification:', { message, error });
    }
  }
}
