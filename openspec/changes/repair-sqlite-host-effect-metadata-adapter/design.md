## Context

The Review feedback slow-path diagnostics cross two metadata Interfaces:

1. Runtime SQLite delta persistence uses a file-service Interface shaped as `{ diagnostics: { sqliteDeltaPurpose, sqliteDeltaSubstep } }`.
2. Worker host effects use a bridge Interface shaped as `{ purpose, substep }`.

The worker SQLite persistence Adapter forwarded metadata unchanged, so live logs collapsed the runtime evidence into `purpose=unknown substep=unknown`.

## Decision

Keep the fix inside `WorkerSqliteDatabaseService`'s SQLite persistence Adapter.

The Adapter is the right Seam because it is the only Module that knows both Interfaces. Runtime SQLite should keep its diagnostics naming local to SQLite delta ownership, while the worker bridge should keep its compact host-effect metadata. Callers should not learn both shapes.

## Alternatives Considered

- Host bridge fallback parsing: rejected because it pushes SQLite-specific diagnostics into the generic host-effect bridge and weakens locality.
- Runtime SQLite emitting bridge metadata directly: rejected because it would leak worker host-effect vocabulary into the infrastructure persistence Module.
- Review/queue timing rewrite: rejected because the broken evidence is below Review Feedback Advancement and does not change queue behavior.

## Risks / Trade-offs

- [Risk] Exporting the Adapter constructor slightly widens the module surface. Mitigation: the Adapter is already the real Seam under test, and the exported Interface is smaller than constructing a full worker database runtime.
- [Risk] Future metadata keys may be dropped. Mitigation: the normalizer is intentionally narrow; new durable evidence keys should be added at this Adapter Seam with tests.
