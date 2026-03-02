import type { QueueType } from '@/types/unified-data-source';

export function shouldRefreshQueueData(
  activeQueueId: string | null | undefined,
  activeQueueType: QueueType | null,
  affectedQueueTypes: QueueType[] | null,
): boolean {
  if (!activeQueueId) {
    return false;
  }

  if (affectedQueueTypes === null) {
    return true;
  }

  if (activeQueueType === null) {
    return true;
  }

  return affectedQueueTypes.includes(activeQueueType);
}
