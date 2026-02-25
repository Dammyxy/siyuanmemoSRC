import { pushMsg, setBlockAttrs } from '@/infrastructure/siyuan/api';
import type { LeechActionEffectsPort } from '@/core/queue/domain/ports';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SiyuanLeechActionEffectsAdapter');

export class SiyuanLeechActionEffectsAdapter implements LeechActionEffectsPort {
  async notify(message: string): Promise<void> {
    try {
      await pushMsg(message);
    } catch (error) {
      logger.error('Failed to send leech notification:', { message, error });
    }
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    try {
      await setBlockAttrs(blockId, attrs);
    } catch (error) {
      logger.error('Failed to set leech block attrs:', { blockId, attrs, error });
      throw error;
    }
  }
}
