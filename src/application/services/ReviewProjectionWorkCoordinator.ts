import { QueueType } from '@/types/unified-data-source';
import { createLogger } from '@/utils/logger';

export type ReviewProjectionSurfaceKind = 'dialog' | 'tab';

export interface ReviewProjectionActivitySnapshot {
  active: boolean;
  activeQueueType: QueueType | null;
  surfaceId: string | null;
  surfaceKind: ReviewProjectionSurfaceKind | null;
  revision: number;
}

export interface ReviewProjectionSurfaceHandle {
  markActive(): void;
  release(): void;
}

export interface ReviewProjectionWorkRequest {
  key: string;
  queueType: QueueType | null;
  run: () => Promise<void> | void;
}

export type ReviewProjectionWorkScheduleResult = 'started' | 'deferred' | 'coalesced';

export interface ReviewProjectionWorkCoordinatorLogger {
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  trace?(message: string, context?: unknown): void;
}

interface ReviewSurfaceRecord {
  token: symbol;
  surfaceId: string;
  surfaceKind: ReviewProjectionSurfaceKind;
  queueType: QueueType | null;
  activeOrdinal: number;
}

interface PendingReviewProjectionWork extends ReviewProjectionWorkRequest {}

const logger = createLogger('ReviewProjectionWorkCoordinator');

const INITIAL_SNAPSHOT: ReviewProjectionActivitySnapshot = Object.freeze({
  active: false,
  activeQueueType: null,
  surfaceId: null,
  surfaceKind: null,
  revision: 0,
});

export class ReviewProjectionWorkCoordinator {
  private readonly surfaces = new Map<string, ReviewSurfaceRecord>();
  private readonly subscribers = new Set<(snapshot: ReviewProjectionActivitySnapshot) => void>();
  private readonly pendingWork = new Map<string, PendingReviewProjectionWork>();
  private snapshot = INITIAL_SNAPSHOT;
  private activationOrdinal = 0;
  private disposed = false;

  constructor(
    private readonly activityLogger: ReviewProjectionWorkCoordinatorLogger = logger,
  ) {}

  activateSurface(input: {
    surfaceId: string;
    surfaceKind: ReviewProjectionSurfaceKind;
    queueType: QueueType | null;
  }): ReviewProjectionSurfaceHandle {
    if (this.disposed) {
      return this.createNoopHandle();
    }
    const surfaceId = String(input.surfaceId || '').trim();
    if (!surfaceId) {
      throw new Error('Review projection surface id must not be empty');
    }
    const key = this.buildSurfaceKey(input.surfaceKind, surfaceId);
    const token = Symbol(key);
    this.surfaces.set(key, {
      token,
      surfaceId,
      surfaceKind: input.surfaceKind,
      queueType: input.queueType,
      activeOrdinal: ++this.activationOrdinal,
    });
    this.publishEffectiveSnapshot();

    let released = false;
    return {
      markActive: () => {
        if (released || this.disposed) {
          return;
        }
        const surface = this.surfaces.get(key);
        if (!surface || surface.token !== token) {
          return;
        }
        surface.activeOrdinal = ++this.activationOrdinal;
        this.publishEffectiveSnapshot();
      },
      release: () => {
        if (released || this.disposed) {
          return;
        }
        released = true;
        const surface = this.surfaces.get(key);
        if (!surface || surface.token !== token) {
          return;
        }
        this.surfaces.delete(key);
        this.publishEffectiveSnapshot();
      },
    };
  }

  getSnapshot(): ReviewProjectionActivitySnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: ReviewProjectionActivitySnapshot) => void): () => void {
    if (this.disposed) {
      return () => undefined;
    }
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  scheduleWork(request: ReviewProjectionWorkRequest): ReviewProjectionWorkScheduleResult {
    if (this.disposed) {
      return 'deferred';
    }
    const key = String(request.key || '').trim();
    if (!key) {
      throw new Error('Review projection work key must not be empty');
    }
    const work: PendingReviewProjectionWork = {
      key,
      queueType: request.queueType,
      run: request.run,
    };
    if (this.isWorkEligible(work)) {
      this.pendingWork.delete(key);
      this.startWork(work);
      return 'started';
    }
    const result = this.pendingWork.has(key) ? 'coalesced' : 'deferred';
    this.pendingWork.set(key, work);
    this.activityLogger.trace?.('[ReviewProjectionWorkCoordinator] Browser projection work deferred', {
      key,
      queueType: work.queueType,
      activeQueueType: this.snapshot.activeQueueType,
      coalesced: result === 'coalesced',
    });
    return result;
  }

  cancelWork(key: string): void {
    this.pendingWork.delete(String(key || '').trim());
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.pendingWork.clear();
    this.subscribers.clear();
    this.surfaces.clear();
  }

  private buildSurfaceKey(kind: ReviewProjectionSurfaceKind, surfaceId: string): string {
    return `${kind}:${surfaceId}`;
  }

  private createNoopHandle(): ReviewProjectionSurfaceHandle {
    return {
      markActive: () => undefined,
      release: () => undefined,
    };
  }

  private resolveEffectiveSurface(): ReviewSurfaceRecord | null {
    let selected: ReviewSurfaceRecord | null = null;
    for (const surface of this.surfaces.values()) {
      if (!selected) {
        selected = surface;
        continue;
      }
      const surfacePriority = surface.surfaceKind === 'dialog' ? 1 : 0;
      const selectedPriority = selected.surfaceKind === 'dialog' ? 1 : 0;
      if (
        surfacePriority > selectedPriority
        || (
          surfacePriority === selectedPriority
          && surface.activeOrdinal > selected.activeOrdinal
        )
      ) {
        selected = surface;
      }
    }
    return selected;
  }

  private publishEffectiveSnapshot(): void {
    const effective = this.resolveEffectiveSurface();
    const nextIdentity = {
      active: effective !== null,
      activeQueueType: effective?.queueType ?? null,
      surfaceId: effective?.surfaceId ?? null,
      surfaceKind: effective?.surfaceKind ?? null,
    };
    if (
      this.snapshot.active === nextIdentity.active
      && this.snapshot.activeQueueType === nextIdentity.activeQueueType
      && this.snapshot.surfaceId === nextIdentity.surfaceId
      && this.snapshot.surfaceKind === nextIdentity.surfaceKind
    ) {
      return;
    }
    const previous = this.snapshot;
    this.snapshot = Object.freeze({
      ...nextIdentity,
      revision: previous.revision + 1,
    });
    this.activityLogger.info('[ReviewProjectionWorkCoordinator] Review activity changed', {
      previous,
      current: this.snapshot,
    });
    for (const listener of this.subscribers) {
      try {
        listener(this.snapshot);
      } catch (error) {
        this.activityLogger.warn('[ReviewProjectionWorkCoordinator] Review activity listener failed', {
          error,
        });
      }
    }
    this.releaseEligibleWork();
  }

  private isWorkEligible(work: PendingReviewProjectionWork): boolean {
    if (!this.snapshot.active) {
      return true;
    }
    return work.queueType !== null && work.queueType === this.snapshot.activeQueueType;
  }

  private releaseEligibleWork(): void {
    const eligible: PendingReviewProjectionWork[] = [];
    for (const [key, work] of this.pendingWork) {
      if (!this.isWorkEligible(work)) {
        continue;
      }
      this.pendingWork.delete(key);
      eligible.push(work);
    }
    for (const work of eligible) {
      this.startWork(work);
    }
  }

  private startWork(work: PendingReviewProjectionWork): void {
    void Promise.resolve()
      .then(() => work.run())
      .catch((error) => {
        this.activityLogger.warn('[ReviewProjectionWorkCoordinator] Browser projection work failed', {
          key: work.key,
          queueType: work.queueType,
          error,
        });
      });
  }
}
