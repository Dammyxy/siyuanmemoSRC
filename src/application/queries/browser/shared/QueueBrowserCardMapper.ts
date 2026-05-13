import type { FSRSCard } from '@/types/card';
import {
  buildBrowserCardFromPayload,
  buildMemoryItemSnapshot,
  buildSourceContentProjectionFromCard,
  type QueueCardFirstReviewMode,
} from '@/types/memory-content-payload-seam';
import type { BrowserCard } from '@/types/browser';

export type { QueueCardFirstReviewMode };

export type QueueBrowserCardMapOptions = {
  firstReviewMode?: QueueCardFirstReviewMode;
  queueIndex?: number;
  blockType?: string | null;
};

export function mapQueueFsrsCardToBrowserCard(
  card: FSRSCard,
  options?: QueueBrowserCardMapOptions,
): BrowserCard {
  const memory = buildMemoryItemSnapshot(card, {
    firstReviewMode: options?.firstReviewMode,
    queueIndex: options?.queueIndex,
  });
  const source = buildSourceContentProjectionFromCard(card, {
    blockType: options?.blockType,
    existence: options?.blockType === 'missing' ? 'missing' : undefined,
  });

  return buildBrowserCardFromPayload(memory, source, { meta: card.meta });
}
