# Architecture Decision Registry

This is the authoritative registry for SiYuanMemo architecture decisions. The repository historically created two unrelated `ADR-001...` sequences; a bare ADR number is therefore ambiguous and must not be used.

## Governance

- **Runtime Architecture series**: `docs/ADR-*.md`. This is the active, canonical series. New decisions continue this sequence.
- **Legacy DDD series**: `docs/adr/ADR-*.md`. This series is frozen; it remains as historical rationale and receives only status or supersession metadata.
- Cite a decision as `Runtime ADR-002` or `Legacy DDD ADR-002`, and include its link. Do not cite only `ADR-002`.
- Accepted decision text is historical evidence. When a decision changes, add a new Runtime ADR and update only status/supersession metadata on the old record.
- ADRs record decisions and trade-offs, not a continuously edited implementation checklist. Current implementation belongs in [ARCHITECTURE.md](../ARCHITECTURE.md), active OpenSpec changes, tests, and boundary guards.
- Status values are `Proposed`, `Accepted`, `Partially Superseded`, `Superseded`, and `Deprecated`.

## Runtime Architecture series

| Qualified ID | Decision | Status | Current scope |
|---|---|---|---|
| [Runtime ADR-001](./ADR-001-runtime-split.md) | Runtime Split | Accepted | UI Shell, SrsBackendWorker, and Kernel Sidecar ownership split remains current. |
| [Runtime ADR-002](./ADR-002-sql-worker-authority.md) | SQL Worker Authority | Partially Superseded by Runtime ADR-006 | Worker persistence authority and canonical truth model remain current; its Device Identity section is no longer valid. |
| [Runtime ADR-003](./ADR-003-kernel-sidecar-coordinator.md) | Kernel Sidecar Coordinator | Accepted | Kernel non-DB-writer boundary remains current; cross-end active-writer policy is explicitly provisional. |
| [Runtime ADR-004](./ADR-004-no-ui-sql.md) | No UI SQL | Accepted | Current and enforced by boundary guards. |
| [Runtime ADR-005](./ADR-005-browser-read-model-contract.md) | Browser Read Model Contract | Accepted | Current Browser read boundary. |
| [Runtime ADR-006](./ADR-006-truth-device-identity-authority.md) | Installation-local Truth Device Identity Authority | Accepted | Replaces only Runtime ADR-002's browser-authority Device Identity decision. |

## Legacy DDD series

| Qualified ID | Decision | Status | Current scope |
|---|---|---|---|
| [Legacy DDD ADR-001](./adr/ADR-001-trait-pattern.md) | Trait pattern for queue capabilities | Superseded | Trait interfaces and `getTrait()` were retired. |
| [Legacy DDD ADR-002](./adr/ADR-002-observer-pattern.md) | Observer pattern for cache invalidation | Partially Superseded | Subscription-driven invalidation remains a useful concept; the Sequencer/ObservableDataSource design was retired. |
| [Legacy DDD ADR-003](./adr/ADR-003-abstraction-layers.md) | Provider–SessionManager–Sequencer layers | Superseded | Those concrete layers were retired. |
| [Legacy DDD ADR-004](./adr/ADR-004-xiuyuan-card-source.md) | Xiuyuan card-source abstraction | Partially Superseded | Xiuyuan remains a domain concept; the recorded storage phases, Riff ownership, and concrete implementation model are historical. |
| [Legacy DDD ADR-005](./adr/ADR-005-native-riff-read-only-import-source.md) | Native Riff as a read-only explicit import source | Accepted | Current integration boundary. |

## Verification snapshot

Last reviewed: 2026-07-17.

The current runtime series was checked against production composition and these passing guards:

- `scripts/check-no-ui-sql.cjs`
- `scripts/check-no-kernel-db-owner.cjs`
- `scripts/check-storage-writer-authority.cjs`

The legacy retirement evidence is recorded in [DDD_RESCAN_BACKLOG.md](./DDD_RESCAN_BACKLOG.md). This section is a dated verification snapshot, not a substitute for runtime tests or current OpenSpec work.
