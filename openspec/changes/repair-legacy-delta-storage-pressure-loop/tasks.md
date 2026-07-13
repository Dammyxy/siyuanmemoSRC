## 1. Stop Startup Storage Amplification

- [x] 1.1 Add a public compaction regression test proving fully uncovered legacy candidates produce no persistent writes or deletes
- [x] 1.2 Add compaction plan/result fields for reclaimable and retained entries, bytes, status, and stable no-progress reason
- [x] 1.3 Return `no-progress-uncovered` before replacement segment writes when active storage cannot shrink
- [x] 1.4 Add a `WorkerSqliteDatabaseService.load` regression proving hard-pressure startup does not synchronously relocate legacy delta
- [x] 1.5 Record content-safe startup and compaction diagnostics for no-progress outcomes

## 2. Implement Real Worker File Effects

- [x] 2.1 Add red protocol and transport tests for scoped `sqlite.deleteFile` and `sqlite.listFiles` host effects
- [x] 2.2 Implement Browser host execution for delete and scoped directory inventory with structured failures
- [x] 2.3 Make SQLite file adapters advertise delete/list only when the underlying bridge capability exists
- [x] 2.4 Verify deletion by absence and retain cleanup checkpoints on missing, timed-out, or unverifiable effects

## 3. Adopt Legacy Delta Into Canonical Truth

- [x] 3.1 Add characterization fixtures for legacy Card/Schedule, Queue, Review, Undo, tombstone, metadata, and unsupported entry shapes
- [x] 3.2 Implement a pure deterministic legacy adoption planner with explicit supported and unsupported outcomes
- [x] 3.3 Implement resumable immutable replacement generation and verified manifest switch for adopted journal entries
- [x] 3.4 Feed adopted contiguous mutations through existing Truth Promotion and block coverage on incomplete verification
- [x] 3.5 Add restart integration tests covering crashes before and after manifest publication and successful projection rebuild from truth

## 4. Clean Manifest-Proven Orphans

- [x] 4.1 Implement protected-path inventory from the latest verified manifest, cleanup checkpoint, and in-progress recovery generation
- [x] 4.2 Implement bounded file/byte orphan deletion with pre-delete revalidation and per-path outcomes
- [x] 4.3 Add real-scale tests proving active files are never deleted and cleanup resumes across bounded batches
- [x] 4.4 Reclassify storage pressure after each successful cleanup batch and retain the write gate until writable evidence passes

## 5. Run Recovery After Startup Readiness

- [x] 5.1 Extend backend load readiness with a content-safe storage-pressure recovery descriptor
- [x] 5.2 Add a deduplicated background-work job and phase/progress status for adoption, promotion, compaction, cleanup, and reclassification
- [x] 5.3 Submit recovery from ApplicationContext only after shell readiness through the narrow backend recovery interface
- [x] 5.4 Add lifecycle tests for duplicate descriptors, bounded yielding, retryable failure, terminal failure, and writable restoration

## 6. Validate And Deploy

- [x] 6.1 Run focused delta, Worker service, protocol, truth lifecycle, background-work, and ApplicationContext test suites
- [ ] 6.2 Run type checking, production build, and strict OpenSpec validation
- [ ] 6.3 Produce a dry-run inventory for the live store and confirm the orphan allowlist before enabling deletion
- [ ] 6.4 Deploy the repaired plugin build and verify restart duration, zero delta amplification, recovery progress, and final storage pressure
- [ ] 6.5 Update architecture and debt documentation with recovery ownership and remaining segment-size/concurrency follow-up
