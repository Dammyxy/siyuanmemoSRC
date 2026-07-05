## Context

Recent Review grading work removed several known hot-path costs, but the latest live log still shows slow `review.feedback` calls dominated by host SQLite effects:

- worker `review.feedback` duration: roughly 1.3-1.4s
- slowest host effect: `sqlite.readJSON` / `sqlite.readBinary`, roughly 600-700ms
- host total: roughly 900-1000ms
- `preMerge=none mainDb=none`

This proves the current bottleneck is inside the Review feedback handler, not the pre-request main database merge. It does not prove which persisted file is being read. The existing timing scope already records `slowestHostEffect.path` and `storageClass`, but the copyable slow summary only prints effect kind and duration.

## Goals / Non-Goals

**Goals:**

- Make slow Review feedback logs identify the concrete host effect path and storage class.
- Keep the logged summary compact enough for real plugin console copy/paste.
- Preserve existing timing attribution semantics and fail-closed persistence behavior.
- Make the next diagnostic loop able to choose between delta manifest, open segment, sealed segment, main database, diagnostics, or unrelated SQLite storage.

**Non-Goals:**

- No SQLite delta cache or host bridge cache change.
- No Review scheduling, queue membership, or counter behavior change.
- No domain sync safety decision change.
- No production data migration.
- No reliance on expanded browser console object fields for the primary evidence.

## Decisions

### Decision 1: Extend the copyable slow summary, not just structured payloads

The key evidence must appear in the plain summary string because copied plugin logs collapse nested objects. The summary should include the slowest host effect's `path` and `storageClass` next to `host=<kind> <duration>ms`.

Alternative considered: rely on the existing structured `slowestHostEffect` object. Rejected because the user's copied logs only preserved the summary string and lost nested object details.

### Decision 2: Keep observability owned at the worker transport summary seam

`BrowserSrsBackendWorkerTransport` already builds the Review feedback slow summary from worker timing diagnostics. The narrow change should format existing host-effect evidence there before crossing into user-facing logs.

Alternative considered: add new storage-layer logs in SQLite persistence. Rejected because it would scatter diagnosis across storage internals and may add noise to every read/write instead of only slow Review feedback.

### Decision 3: Use path classification only for diagnosis, not behavior

The diagnostic output should help operators classify the root cause, but it must not change cache invalidation, repair, diagnostics, or sync-safety branching.

Alternative considered: immediately optimize the most likely SQLite path. Rejected because current logs are path-blind and would make the next fix speculative.

### Decision 4: Treat `review.session.feedback` as a first-class timing method

The latest slow logs are emitted from the renderer `session-runtime-answer` step, which waits on the worker `review.session.feedback` RPC. The worker timing envelope and copyable summary therefore need to cover `review.session.feedback`, not only the nested `review.feedback` mutation call. The summary should keep the same shape as the existing `review.feedback` slow summary, but include session-layer steps for commit, advance, and total time.

Alternative considered: rely on the existing nested `review.feedback` transaction/queue-impact steps. Rejected because it cannot distinguish worker queue delay, pre-request lifecycle, session runtime overhead, and handler time when the outer RPC is slow.

## Risks / Trade-offs

- Path may contain long plugin storage names -> Mitigation: include the path in copyable logs and allow later implementation to shorten only if full paths are too noisy.
- Additional log fields may expose local storage layout -> Mitigation: only log in existing slow Review feedback diagnostics, not every feedback call.
- Timing attribution may still group async host effects under `review.feedback` -> Mitigation: include path/storage class first; if ambiguity remains, follow with top host-effect list instrumentation in this same capability.
- `review.session.feedback` diagnostics may expose pre-request lifecycle cost that was previously hidden by the renderer-only `session-runtime-answer` log -> Mitigation: keep this diagnostic-only and use the copied summary to decide the follow-up behavior change.

## Migration Plan

1. Add a focused test or assertion around slow summary formatting.
2. Include `slowestHostEffect.path` and `storageClass` in the Review feedback slow summary.
3. Optionally include a compact top-host-effects list if one slowest path is insufficient.
4. Build and deploy the plugin, rerun a slow Review grading session, and classify the path.

Rollback strategy: revert the summary formatting change. Runtime behavior and persisted data are unaffected.

## Open Questions

- Should the first implementation include only the slowest host effect path, or include the top 3 host effects immediately?
- Should paths be logged as full relative storage paths or compact basenames with storage class?
