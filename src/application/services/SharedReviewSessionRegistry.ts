type DisposableSessionLike = {
  isDisposed?: () => boolean;
  subscribeDispose?: (listener: () => void) => () => void;
  dispose?: () => void;
};

type RegisteredSharedReviewSession = {
  session: DisposableSessionLike;
  unsubscribeDispose: (() => void) | null;
};

function normalizeSessionId(value: unknown): string {
  return String(value || '').trim();
}

function isLiveSession(session: DisposableSessionLike | null | undefined): session is DisposableSessionLike {
  if (!session) {
    return false;
  }
  if (typeof session.isDisposed !== 'function') {
    return true;
  }
  return session.isDisposed() !== true;
}

export class SharedReviewSessionRegistry {
  private readonly sessions = new Map<string, RegisteredSharedReviewSession>();

  hasSession(sessionId: string): boolean {
    return this.getSession(sessionId) !== null;
  }

  getSession<TSession = unknown>(sessionId: string): TSession | null {
    const normalizedId = normalizeSessionId(sessionId);
    if (!normalizedId) {
      return null;
    }

    const existing = this.sessions.get(normalizedId);
    if (!existing || !isLiveSession(existing.session)) {
      this.unregisterSession(normalizedId, existing?.session);
      return null;
    }

    return existing.session as TSession;
  }

  registerSession<TSession extends DisposableSessionLike>(sessionId: string, session: TSession): TSession {
    const normalizedId = normalizeSessionId(sessionId);
    if (!normalizedId) {
      throw new Error('sharedReviewSessionId is required');
    }

    const liveExisting = this.getSession<TSession>(normalizedId);
    if (liveExisting) {
      return liveExisting;
    }

    const unsubscribeDispose = typeof session.subscribeDispose === 'function'
      ? session.subscribeDispose(() => {
          this.unregisterSession(normalizedId, session);
        })
      : null;

    this.sessions.set(normalizedId, {
      session,
      unsubscribeDispose,
    });

    return session;
  }

  getOrCreateSession<TSession extends DisposableSessionLike>(
    sessionId: string,
    factory: () => TSession,
  ): TSession {
    const existing = this.getSession<TSession>(sessionId);
    if (existing) {
      return existing;
    }

    return this.registerSession(sessionId, factory());
  }

  unregisterSession(sessionId: string, session?: DisposableSessionLike | null): void {
    const normalizedId = normalizeSessionId(sessionId);
    if (!normalizedId) {
      return;
    }

    const existing = this.sessions.get(normalizedId);
    if (!existing) {
      return;
    }

    if (session && existing.session !== session) {
      return;
    }

    existing.unsubscribeDispose?.();
    this.sessions.delete(normalizedId);
  }

  disposeSession(sessionId: string): void {
    const normalizedId = normalizeSessionId(sessionId);
    if (!normalizedId) {
      return;
    }

    const existing = this.sessions.get(normalizedId);
    if (!existing) {
      return;
    }

    this.unregisterSession(normalizedId, existing.session);
    existing.session.dispose?.();
  }

  dispose(): void {
    for (const [sessionId, entry] of Array.from(this.sessions.entries())) {
      this.unregisterSession(sessionId, entry.session);
      entry.session.dispose?.();
    }
  }
}
