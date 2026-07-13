## Why

SiYuanMemo can enter a destructive startup loop when an existing installation contains legacy SQLite delta entries without journal sequences: every hard-pressure startup rewrites the entire uncovered delta, silently fails to delete superseded segments, remains hard-pressure read-only, and consumes tens of megabytes per restart. The observed store already contains 3,867 orphan files and about 719 MiB of unreachable delta evidence, so the loop must be stopped before ordinary startup or Review can be considered safe.

## What Changes

- Detect coverage compaction that cannot reclaim any entry and return an explicit no-progress result without writing replacement segments.
- Make SQLite delta deletion a real Browser Worker host effect with verified success or failure; remove the adapter behavior that presents a missing delete capability as successful.
- Add a fail-closed legacy delta adoption flow that deterministically converts supported unjournaled Card/Schedule, Queue, Review, Undo, tombstone, and metadata effects into verified canonical truth before publishing coverage.
- Keep storage-pressure startup fast and read-only while adoption or cleanup is pending, and expose recovery work through the existing background-work lifecycle/status surface.
- Add bounded orphan inventory and cleanup that deletes only files proven unreachable from the current verified manifest/checkpoint and records every skipped or failed path.
- Add phase and outcome diagnostics for startup evidence, pressure planning, adoption, compaction, and orphan cleanup so no-progress loops are visible without inspecting filesystem timestamps.
- Preserve hard-pressure mutation gating until adoption and compaction produce storage evidence below the accepted writable threshold.

## Capabilities

### New Capabilities

- `legacy-delta-pressure-recovery`: Fail-closed adoption of unjournaled legacy delta, no-progress compaction prevention, and bounded manifest-proven orphan cleanup.

### Modified Capabilities

- `worker-sqlite-runtime-families`: Hard-pressure startup returns readable state without synchronously repeating non-progressing relocation, while Worker-owned recovery retains mutation authority.
- `kernel-companion-background-work-status`: Legacy delta adoption and orphan cleanup are visible, deduplicated recovery jobs with bounded progress and terminal failure evidence.
- `application-context-composition-interface`: Read-only storage-pressure startup can submit explicit recovery descriptors after the shell is ready without enabling ordinary writes.

## Impact

- Worker storage: `worker/db/SqliteDatabaseService.ts`, SQLite delta checkpoint/compaction, truth publication/reconciliation modules, and storage inventory/pressure diagnostics.
- Worker transport: Browser Worker protocol, worker entry persistence bridge, browser transport host-effect execution, and FileService deletion.
- Application lifecycle: startup readiness/deferred descriptors, background-work kinds/status, and post-ready recovery coordination.
- Persistent data: no format downgrade and no blind deletion; legacy coverage and orphan cleanup require verified manifests, deterministic adoption evidence, and bounded resumable operations.
- Tests: public `db.load`, delta compaction, Worker host-effect transport, recovery background lifecycle, restart reconstruction, and real-scale fixture regressions.
