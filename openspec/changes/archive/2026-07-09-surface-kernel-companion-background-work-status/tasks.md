## 1. Status Contract

- [x] 1.1 Add focused tests for normalized status across current job kinds.
- [x] 1.2 Add tests for kind filtering and stable ordering.
- [x] 1.3 Add tests proving status reads do not mutate registry lifecycle state.
- [x] 1.4 Add tests for diagnostic redaction/content-safe output.

## 2. Status Read Module

- [x] 2.1 Implement a read-only Kernel Companion Background Work status Module beside the registry.
- [x] 2.2 Normalize accepted/running/completed/failed/deferred/canceled states into the status read model.
- [x] 2.3 Normalize safe diagnostics for Review truth backfill, Xiuyuan startup sync, and kernel transaction action polling.
- [x] 2.4 Keep submit/cancel/defer/shutdown out of the status Interface.

## 3. Optional Backend/Client Read Path

- [x] 3.1 Decide whether the first implementation needs backend/client access or application-local status is enough.
- [x] 3.2 If needed, add a narrow background-work status contract/facet without reopening broad backend RPC family reshaping.
- [x] 3.3 Add client/runtime tests for unavailable/fail-closed status reads.

## 4. Documentation And Validation

- [x] 4.1 Update `CONTEXT.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md` with status read-model ownership and deferred durable/UI debt.
- [x] 4.2 Run focused background-work registry/status tests.
- [x] 4.3 Run hidden-fallback and boundary checks if backend/client files are touched.
- [x] 4.4 Run `openspec validate surface-kernel-companion-background-work-status --strict`.
- [x] 4.5 Run `git diff --check` and `pnpm build`.
