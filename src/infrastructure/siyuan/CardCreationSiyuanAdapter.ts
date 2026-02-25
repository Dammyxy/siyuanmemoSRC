import type { CardCreationSiyuanPort } from '@/application/ports/CardCreationSiyuanPort';
import { getBlockText } from '@/core/siyuan/block';

export class CardCreationSiyuanAdapter implements CardCreationSiyuanPort {
  async getBlockText(blockId: string): Promise<string> {
    return getBlockText(blockId);
  }
}
