## 1. Feedback Loop

- [x] 1.1 Add a regression test for missing manifest-path sealed segment with exact-checksum legacy candidate recovery
- [x] 1.2 Add a regression test for missing manifest-path sealed segment with mismatched legacy candidate fail-closed
- [x] 1.3 Add a regression test proving existing manifest-path sealed checksum mismatch remains non-repairable
- [x] 1.4 Add or extend Review feedback result mapping coverage for unrecoverable sealed segment durability failure

## 2. Sealed Segment Recovery

- [x] 2.1 Add a small sealed-segment recovery probe in `SqliteDeltaCheckpointLayer`
- [x] 2.2 Validate alternate candidate bytes with exact checksum and byte size before replay
- [x] 2.3 Persist or normalize the validated segment back to the manifest path after successful recovery
- [x] 2.4 Emit explicit diagnostics for missing, mismatched, and unrecoverable sealed segment states

## 3. Safety Guardrails

- [x] 3.1 Keep manifest-path sealed checksum mismatch fail-hard
- [x] 3.2 Refuse to clear sealed segments without checkpoint coverage
- [x] 3.3 Ensure current incident shape remains blocked when no matching segment source exists

## 4. Docs And Validation

- [x] 4.1 Update `docs/DDD_RESCAN_BACKLOG.md` with the storage durability delta
- [x] 4.2 Update `ARCHITECTURE.md` only if runtime ownership wording changes
- [x] 4.3 Run focused SQLite persistence tests
- [x] 4.4 Run `pnpm run check:boundaries`
- [x] 4.5 Run `pnpm build`
- [x] 4.6 Run `openspec validate repair-sqlite-delta-sealed-segment-recovery --strict`
