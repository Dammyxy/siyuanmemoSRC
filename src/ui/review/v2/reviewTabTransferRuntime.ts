import type {
  FilterGroupQueueSessionSnapshot,
  InitialReviewSessionState,
  ReviewTabTransferState,
} from '@/types/unified-data-source';
import type {
  ReviewQueueSessionSnapshot,
  ReviewTabRuntimeState,
} from '@/types/review-tab';
import type { ReviewHeaderVariant } from './types';
import type {
  ReviewTabOpenOptions,
  ReviewTabOpenPosition,
  ReviewOpenAsTabManager,
} from './reviewOpenAsCommands';

type ReviewTabTransferLogger = {
  warn?: (...args: unknown[]) => void;
};

type ReviewTabTransferRegistry = {
  getSession: <TSession = unknown>(sessionId: string) => TSession | null;
  registerSession: <TSession>(sessionId: string, session: TSession) => TSession;
};

export type ReviewTabTransferReference = {
  cardId?: string;
  blockId?: string;
};

export type ReviewTabTransferRuntimeDeps = {
  mode: string;
  queue: unknown;
  adapter: unknown;
  title?: string;
  headerVariant?: ReviewHeaderVariant;
  transferState?: ReviewTabTransferState;
  getSharedReviewSessionId: () => string;
  setSharedReviewSessionId: (sessionId: string) => void;
  createSharedReviewSessionId: () => string;
  getInitialSessionState: () => InitialReviewSessionState | undefined;
  getQueueSessionSnapshot: () => ReviewQueueSessionSnapshot | null;
  getFilterSessionSnapshot: () => FilterGroupQueueSessionSnapshot | null | undefined;
  getCurrentReference: () => ReviewTabTransferReference;
  isShowingAnswer: () => boolean;
  getReviewSessionController: () => unknown;
  isReviewSessionControllerLike: (value: unknown) => boolean;
  getSharedReviewSessionRegistry: () => ReviewTabTransferRegistry | null;
  getTabManager: () => Pick<ReviewOpenAsTabManager, 'openReviewTab'> | null | undefined;
  t: (key: string, fallback: string) => string;
  showMessage: (message: string, timeout?: number, type?: 'info' | 'error' | 'warning') => void;
  logger?: ReviewTabTransferLogger;
};

function cloneTransferStateWithSession(
  transferState: ReviewTabTransferState,
  session: InitialReviewSessionState | undefined,
): ReviewTabTransferState {
  if (transferState.kind === 'static-subset-session') {
    return {
      ...transferState,
      blockIds: [...transferState.blockIds],
      cardIds: transferState.cardIds ? [...transferState.cardIds] : undefined,
      session,
    };
  }

  return {
    ...transferState,
    session,
  };
}

function normalizeSharedReviewSessionId(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function createReviewTabTransferRuntime(deps: ReviewTabTransferRuntimeDeps) {
  function buildTransferState(): ReviewTabTransferState | undefined {
    const session = deps.getInitialSessionState();
    if (deps.transferState) {
      return cloneTransferStateWithSession(deps.transferState, session);
    }

    try {
      const filterSession = deps.getFilterSessionSnapshot();
      if (!filterSession) {
        return undefined;
      }
      return {
        kind: 'filter-group-session',
        filterSession,
        session,
      };
    } catch (error) {
      deps.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to serialize filter-group transfer state:', error);
      return undefined;
    }
  }

  function buildRuntimeState(): ReviewTabRuntimeState | null {
    if (deps.mode !== 'tab') {
      return null;
    }

    const reference = deps.getCurrentReference();
    const sharedReviewSessionId = normalizeSharedReviewSessionId(deps.getSharedReviewSessionId()) || undefined;
    return {
      version: 1,
      showAnswer: deps.isShowingAnswer() === true,
      sharedReviewSessionId,
      currentCardId: String(reference.cardId || '').trim() || undefined,
      currentBlockId: String(reference.blockId || '').trim() || undefined,
      session: deps.getInitialSessionState(),
      queueSnapshot: deps.getQueueSessionSnapshot(),
    };
  }

  function buildOpenOptions(overrides?: {
    position?: ReviewTabOpenPosition;
    sharedReviewSessionId?: string | null;
    reviewState?: ReviewTabRuntimeState | null;
  }): ReviewTabOpenOptions {
    const resolvedSharedReviewSessionId = overrides?.sharedReviewSessionId ?? deps.getSharedReviewSessionId();
    return {
      queue: deps.queue,
      adapter: deps.adapter,
      title: deps.title || deps.t('reviewTitle', 'Review'),
      headerVariant: deps.headerVariant,
      position: overrides?.position,
      sharedReviewSessionId: normalizeSharedReviewSessionId(resolvedSharedReviewSessionId),
      transferState: buildTransferState(),
      reviewState: overrides?.reviewState ?? buildRuntimeState(),
    };
  }

  function ensureSharedSessionPromotion(): string | null {
    const existingId = normalizeSharedReviewSessionId(deps.getSharedReviewSessionId());
    if (existingId) {
      const registry = deps.getSharedReviewSessionRegistry();
      const existing = registry?.getSession<unknown>(existingId);
      if (registry && !deps.isReviewSessionControllerLike(existing)) {
        registry.registerSession(existingId, deps.getReviewSessionController());
      }
      return existingId;
    }

    const registry = deps.getSharedReviewSessionRegistry();
    if (!registry) {
      return null;
    }

    const nextId = deps.createSharedReviewSessionId();
    const registered = registry.registerSession(nextId, deps.getReviewSessionController());
    if (!deps.isReviewSessionControllerLike(registered)) {
      return null;
    }

    deps.setSharedReviewSessionId(nextId);
    return nextId;
  }

  function openManagedSplit(position: ReviewTabOpenPosition): boolean {
    const tabManager = deps.getTabManager();
    if (typeof tabManager?.openReviewTab !== 'function') {
      deps.showMessage(deps.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return false;
    }

    const sharedReviewSessionId = ensureSharedSessionPromotion();
    if (!sharedReviewSessionId) {
      deps.showMessage(deps.t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
      return false;
    }

    const reviewState = buildRuntimeState();
    tabManager.openReviewTab(buildOpenOptions({
      position,
      sharedReviewSessionId,
      reviewState: reviewState
        ? { ...reviewState, sharedReviewSessionId }
        : reviewState,
    }));
    return true;
  }

  return {
    buildOpenOptions,
    buildRuntimeState,
    buildTransferState,
    ensureSharedSessionPromotion,
    openManagedSplit,
  };
}
