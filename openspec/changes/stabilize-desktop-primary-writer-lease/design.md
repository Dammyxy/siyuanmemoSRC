## Context

Desktop SiYuan loads the plugin in multiple frontend renderers: the Electron primary app, document windows, QuickNote/enhance auxiliary windows, and sometimes browser-like frontends attached to the same desktop kernel. SiYuanMemo currently coordinates backend mutations through a frontend writer runtime: the kernel companion owns writer lease and relay queues, while the active frontend writer calls the backend Worker that owns SQL transactions.

The current code already prefers the primary app but does not fully bind desktop writer eligibility to it. Hidden primary-app runtimes cannot reacquire an empty lease, and some follower/no-writer paths relay commands before attempting primary recovery. In ordinary desktop use, this can leave `leaseHolder=null` after background timer throttling and make Review feedback fail.

Constraints remain unchanged:

- Kernel companion must not write `siyuanmemo.db`.
- Mobile runtime policy remains unchanged and is not part of this desktop change.
- Non-primary desktop surfaces must fail closed rather than performing hidden local fallback writes.
- Backend Worker health remains a prerequisite for holding a writer lease.

## Goals / Non-Goals

**Goals:**

- Make desktop `primary-app/canonical` the only ordinary desktop writer-eligible role.
- Keep `desktop-window`, QuickNote/enhance auxiliary windows, and ordinary desktop `browser-desktop` frontends out of desktop writer ownership.
- Let a hidden desktop primary-app writer reacquire an empty lease when backend Worker health is good.
- Recover Review feedback and kernel transaction action polling when they are stuck in follower/no-active-writer state and the local runtime is the desktop primary app.
- Keep failures explicit when recovery is not allowed.
- Reduce repeated no-active-writer action-pump warnings.

**Non-Goals:**

- Do not make `kernel.js` the SQL/database writer.
- Do not bind writer ownership to a single `instanceId` forever.
- Do not let document windows become fallback desktop writers.
- Do not change mobile write ownership behavior.
- Do not redesign the full writer relay protocol.

## Decisions

1. Desktop writer binding is role-based, not instance-based.

   The durable rule is "ordinary desktop primary app may write", not "the first runtime instance may write". Instance IDs change during reloads, and old hidden runtimes can linger until dispose or TTL expiry. Role binding survives reloads without pinning stale owners.

2. Hidden primary-app empty-lease recovery is allowed only for empty leases.

   A hidden desktop primary app may reacquire when the kernel reports no active lease. It must not steal another active primary-app owner. This directly addresses timer-throttled heartbeat expiry without adding cross-window takeover behavior.

3. Kernel keeps a narrow hidden-acquire exception.

   `writer.acquireLease` continues to reject hidden requesters by default. The exception is limited to a structured writer profile with `surfaceRole=primary-app` and `writerEligibility=canonical`, with no active lease. Document windows, auxiliary windows, unavailable profiles, and ordinary desktop browser frontends remain rejected.

4. Desktop browser frontends are not ordinary desktop writers.

   Existing `browser-desktop` policy is provisional. For ordinary desktop/std kernel use, this change treats browser frontends as non-writer for backend mutation ownership. Docker/browser-only strategy should be handled by a separate capability if needed.

5. Follower/no-writer recovery is attempted before relay failure becomes user-visible.

   Review feedback and kernel transaction action polling can observe a stale follower mode after lease expiry. These paths should ask the runtime to recover writer ownership before returning unavailable. If recovery succeeds and mode becomes writer, they use the local writer path; if not, they preserve explicit unavailable behavior.

6. Backoff is diagnostic, not fallback.

   ActionPump backoff only reduces repeated warnings for the same no-active-writer condition. It must not drop queued actions or write locally when recovery is not permitted.

## Risks / Trade-offs

- [Risk] Hidden primary-app reacquires while backend Worker is unhealthy. → Mitigation: `FrontendInstanceRuntime` already releases/demotes on unhealthy worker; recovery checks worker health before acquire.
- [Risk] Browser/Docker users need a writer without Electron primary app. → Mitigation: ordinary desktop `browser-desktop` is intentionally excluded; Docker/browser-only writer policy remains a future separate change.
- [Risk] Follower/no-writer recovery accidentally becomes local fallback. → Mitigation: recovery is limited to runtime ownership refresh; mutation proceeds locally only if runtime mode becomes writer.
- [Risk] Repeated warning backoff hides a real outage. → Mitigation: first state transition remains observable; repeated identical warnings are bounded while explicit unavailable events remain available.

## Migration Plan

1. Add regression tests for kernel hidden primary acquire, document-window rejection, and browser-desktop rejection.
2. Add frontend runtime tests for hidden primary empty-lease recovery and hidden follower rejection.
3. Add Review feedback and ActionPump tests for stale follower/no-active-writer recovery.
4. Implement kernel and frontend runtime policy changes.
5. Implement follower/no-writer recovery and warning backoff.
6. Update `ARCHITECTURE.md`, backlog, and investigation report.
7. Validate with focused tests, boundary checks, and build.

Rollback path: revert the new primary-app hidden-acquire exception and recovery tests. The existing preferred-primary behavior remains intact and all non-primary surfaces continue to fail closed.

## Open Questions

None for the ordinary desktop scope. Docker/browser-only writer ownership remains intentionally out of scope.
