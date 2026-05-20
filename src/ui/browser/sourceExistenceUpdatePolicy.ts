export type SourceExistenceStatusLike = {
  exists: boolean | null;
};

export function shouldReloadQueueAfterSourceExistenceUpdate(input: {
  activeQueueId?: string | null;
  statuses: SourceExistenceStatusLike[];
}): boolean {
  const activeQueueId = String(input.activeQueueId || '').trim();
  if (!activeQueueId) {
    return false;
  }
  return input.statuses.some((status) => status.exists === false);
}
