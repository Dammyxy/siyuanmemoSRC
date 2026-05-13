import type { FSRSCard } from '@/types/card';
import {
  buildMemoryItemSnapshot,
  buildQueueSnapshotRowFromPayload,
  buildSourceContentProjectionFromCard,
  type QueueCardFirstReviewMode,
} from '@/types/memory-content-payload-seam';
import type { QueueSnapshotRow } from '@/types/queue-browser';

export type { QueueCardFirstReviewMode };

export type QueueCardProjectionOptions = {
  firstReviewMode?: QueueCardFirstReviewMode;
  queueIndex?: number;
};

export interface QueueCardProjection extends QueueSnapshotRow {
  note: string;
}

export function buildQueueCardProjection(
  card: FSRSCard,
  options: QueueCardProjectionOptions = {},
): QueueCardProjection {
  const memory = buildMemoryItemSnapshot(card, options);
  const source = buildSourceContentProjectionFromCard(card);
  return {
    ...buildQueueSnapshotRowFromPayload(memory, source),
    note: source.note,
  };
}

export function buildQueueSnapshotRow(
  card: FSRSCard,
  options: QueueCardProjectionOptions = {},
): QueueSnapshotRow {
  const memory = buildMemoryItemSnapshot(card, options);
  const source = buildSourceContentProjectionFromCard(card);
  return buildQueueSnapshotRowFromPayload(memory, source);
}
