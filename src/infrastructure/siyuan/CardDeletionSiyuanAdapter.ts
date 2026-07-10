import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';
import { getBlockAttrs, setBlockAttrs } from './api';

export class CardDeletionSiyuanAdapter implements CardDeletionSiyuanPort {
  async getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return getBlockAttrs(blockId);
  }

  async setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    await setBlockAttrs(blockId, attrs);
  }
}
