type BrowserTranslate = (key: string, fallback: string) => string;

export type BrowserActionLabelInput = {
  id: string;
  label: string;
};

export type BrowserActionResultSummary = {
  skipped: number;
  updated: number;
};

export type BrowserAddToQueueResult = {
  added: number;
  message: string;
};

const ACTION_LABELS: Record<string, { fallback: string; key: string }> = {
  'review-subset': { key: 'reviewSubset', fallback: 'Review Subset' },
  open: { key: 'openInTab', fallback: 'Open' },
  postpone: { key: 'postpone', fallback: 'Postpone' },
  advance: { key: 'advance', fallback: 'Advance' },
  spread: { key: 'spread', fallback: 'Spread' },
  reset: { key: 'resetCard', fallback: 'Reset' },
  suspend: { key: 'suspend', fallback: 'Suspend' },
  unsuspend: { key: 'restore', fallback: 'Restore' },
  'remove-from-queue': { key: 'removeFromQueue', fallback: 'Remove from Queue' },
  'remove-from-current-queue': { key: 'removeFromQueue', fallback: 'Remove from Queue' },
  'delete-card': { key: 'deleteCard', fallback: '取消闪卡' },
  'add-to-queue': { key: 'addToQueueMenu', fallback: '加入队列' },
  'add-to-retrieval-queue': { key: 'addToRetrievalQueue', fallback: '提取练习' },
  'add-to-retrieval-queue-all': { key: 'addToRetrievalQueueAll', fallback: '提取练习（含今日已复习）' },
  'add-to-incremental-queue': { key: 'addToIncrementalQueue', fallback: '渐进学习' },
  'add-to-incremental-queue-all': { key: 'addToIncrementalQueueAll', fallback: '渐进学习（含今日已复习）' },
  'add-to-final-drill-queue': { key: 'addToFinalDrillQueue', fallback: '刻意练习' },
  'add-to-filter-group-queue': { key: 'addToFilterGroupQueue', fallback: 'Filter Group Review' },
  'add-to-neural-roam-queue': { key: 'addToNeuralRoamQueue', fallback: '神经漫游' },
  'insert-at': { key: 'insertAt', fallback: 'Insert at' },
  'set-priority': { key: 'setPriority', fallback: 'Set Priority' },
  'auto-sort': { key: 'autoSortQueue', fallback: 'Auto Sort' },
};

const ACTIONS_REQUIRING_RELOAD = new Set([
  'remove-from-queue',
  'remove-from-current-queue',
  'delete-card',
  'insert-at',
  'set-priority',
  'spread',
  'auto-sort',
  'reset',
  'suspend',
  'unsuspend',
  'postpone',
  'advance',
]);

const ACTIONS_REQUIRING_FORCE_REFRESH = new Set([
  'delete-card',
  'postpone',
  'advance',
]);

export function getBrowserActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return fallback;
}

export function getBrowserActionLabel(action: BrowserActionLabelInput, t: BrowserTranslate): string {
  const entry = ACTION_LABELS[action.id];
  if (!entry) {
    return action.label;
  }
  return t(entry.key, action.label || entry.fallback);
}

export function parseBrowserAddToQueueResult(actionId: string, result: unknown): BrowserAddToQueueResult | null {
  if (!actionId.startsWith('add-to-') || typeof result !== 'object' || result === null) {
    return null;
  }

  const addResult = result as { added?: unknown; message?: unknown };
  const added = typeof addResult.added === 'number' ? addResult.added : Number.NaN;
  if (!Number.isFinite(added)) {
    return null;
  }

  return {
    added,
    message: typeof addResult.message === 'string' ? addResult.message : '',
  };
}

export function summarizeBrowserActionResult(result: unknown): BrowserActionResultSummary {
  const actionResult =
    typeof result === 'object' && result !== null
      ? (result as { skipped?: unknown; updated?: unknown })
      : undefined;

  const updated = Number(
    typeof actionResult?.updated === 'number'
      ? actionResult.updated
      : Array.isArray(actionResult?.updated)
        ? actionResult.updated.length
        : 0,
  );
  const skipped = Number(
    typeof actionResult?.skipped === 'number'
      ? actionResult.skipped
      : Array.isArray(actionResult?.skipped)
        ? actionResult.skipped.length
        : 0,
  );

  return { updated, skipped };
}

export function shouldReloadAfterBrowserAction(actionId: string): boolean {
  return ACTIONS_REQUIRING_RELOAD.has(actionId);
}

export function shouldForceRefreshAfterBrowserAction(actionId: string): boolean {
  return ACTIONS_REQUIRING_FORCE_REFRESH.has(actionId);
}
