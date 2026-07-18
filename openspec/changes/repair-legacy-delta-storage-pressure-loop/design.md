## Context

The active SQLite delta manifest can contain entries written before mutation envelopes and journal sequences were required. Coverage compaction currently treats every such entry as uncovered, writes an equivalent replacement segment set, publishes the replacement manifest, and then asks an optional file adapter to delete the superseded segments. In the Browser Worker transport that adapter advertises `deleteFile` even though the host bridge has no delete effect, so deletion resolves successfully without changing the filesystem.

This creates two coupled failures under hard storage pressure. Startup synchronously relocates the complete active delta through sequential SiYuan HTTP host effects, and every restart leaves the prior active set as unreachable files. The observed installation has 221 active sealed segments (about 40.7 MiB) and 3,867 unreachable segment files (about 719 MiB). The temporary SQLite projection is not canonical authority, while the active legacy delta is still required to reconstruct Card/Schedule, Queue, Review, Undo, tombstone, and metadata effects that have not all been published to canonical truth.

The recovery crosses the delta store, Browser Worker host-effect protocol, truth promotion, storage-pressure classifier, background-work lifecycle, and ApplicationContext startup coordination. It must therefore be fail-closed, restart-safe, bounded, and observable.

## Goals / Non-Goals

**Goals:**

- Stop all storage-amplifying no-progress compaction before it writes replacement files.
- Make Worker file deletion and inventory explicit capabilities whose failures propagate to the caller.
- Adopt supported legacy delta evidence into the existing ordered journal and canonical truth pipeline without trusting temporary SQLite as source authority.
- Keep startup responsive and readable while hard-pressure recovery runs after readiness.
- Delete only bounded, manifest-proven unreachable files after active evidence is verified.
- Keep ordinary mutations blocked until adoption, truth verification, compaction, and pressure reclassification succeed.
- Expose phase, progress, retry, unsupported evidence, and terminal failure diagnostics.

**Non-Goals:**

- Raising storage-pressure thresholds or the Worker startup timeout.
- Blindly deleting the active delta or the existing orphan set.
- Treating the temporary SQLite database as canonical truth.
- Changing review scheduling behavior or sync conflict policy.
- General delta format redesign or segment-size tuning beyond what is required for recovery correctness.

## Decisions

### Plan compaction before any relocation write

`compactCoveredSegments` will first read and verify candidate segments and classify each entry as covered or retained. The plan will include candidate bytes, reclaimable entries/bytes, retained entries/bytes, and the projected replacement segment count. If no entry is reclaimable, or the plan cannot reduce active storage, the operation will return `status: no-progress` with reason `no-progress-uncovered` and will not call `writeBinary`, publish a manifest, or delete a file.

This guard belongs in the delta checkpoint rather than only in startup orchestration because compaction can be invoked from maintenance and tests as well as startup. Raising the hard limit or retrying with a longer timeout would preserve the destructive behavior and is rejected.

### Require real host capabilities

The Browser Worker protocol will add explicit `sqlite.deleteFile` and `sqlite.listFiles` host effects. The browser-side executor will use the existing SiYuan file service and return structured success or failure. The Worker bridge will expose a capability only when the corresponding effect is implemented; adapters must not install a function that silently returns when the underlying capability is absent.

Deletion remains after manifest publication and verification. A failed deletion leaves the cleanup checkpoint intact so the next recovery resumes cleanup without relocating entries again. Listing is scoped to the SQLite delta directory and normalized paths; callers cannot enumerate arbitrary storage roots through this recovery API.

`coverage-compaction` and `legacy-adoption` checkpoints are cleanup journals after an authoritative manifest switch, not delta replay sources. If a process stops after deleting superseded files but before clearing the checkpoint, volatile projection startup ignores those cleanup-only paths and resumes from the active replacement segments. SiYuan `getFile` JSON error envelopes returned with a successful HTTP status are classified before binary decode so an absent cleanup path cannot masquerade as corrupt MessagePack.

### Adopt legacy evidence by deterministic segment rewrite

Recovery will read only manifest-referenced, checksum-verified delta entries. A pure planner classifies every unjournaled entry from its label, table set, primary keys, rows, and operations. Supported entries receive:

- a deterministic mutation ID derived from canonicalized legacy entry evidence;
- the verified local truth device ID and identity epoch;
- contiguous journal sequences reserved from the manifest frontier;
- affected aggregate identifiers and required truth outputs derived by an explicit table/label mapping;
- a journaled durability receipt whose operations exactly match the original delta changes.

The planner will support only operation shapes that the current truth publisher can encode and verify. Review evidence can use the generic review truth record carrying the complete operation set. Card/Schedule and Queue evidence must satisfy the existing compactable canonical encoders. Undo, tombstone, and metadata labels are supported only when their table/row shape maps unambiguously to one of those truth outputs. Unknown tables, ambiguous aggregate identities, schema mismatches, or incomplete rows produce `unsupported-evidence` and no destructive state transition.

For an accepted plan, recovery writes a deterministic replacement generation, verifies every replacement segment, and atomically switches the manifest with a cleanup checkpoint for the prior active paths. A crash before the switch leaves only deterministic unreachable files; a crash after the switch resumes deletion from the checkpoint. It never mutates sealed segment files in place.

The rewritten entries then flow through the existing ordered Truth Promotion publisher. Coverage advances only after every required canonical output is replay-verified. Normal coverage compaction can then remove the adopted journal entries. This reuses existing truth validation instead of introducing a second authority path.

An interrupted installation can contain deterministic `LEGACY_DELTA_ADOPTED` receipts produced under an earlier identity epoch for the same device. Recovery may correct that provisional identity only when the receipt is still `journaled`, has no truth generation, exactly matches a fresh deterministic adoption of the source entry, and the old epoch promotion state proves the sequence is not covered. The correction preserves the mutation ID and journal sequence. Formal mutations, another device, covered old-epoch receipts, or unverifiable adoption evidence remain blocking; recovery never skips their journal position.

### Separate startup readiness from recovery completion

`db.load` will reconstruct readable state and classify pressure, but hard-pressure startup will not synchronously adopt, relocate, or clean the full store. It returns a recovery descriptor identifying legacy adoption, compaction, and orphan cleanup work. ApplicationContext submits that descriptor through the existing post-ready background-work coordinator after the shell is ready.

The renderer backend client records the latest complete `db.load` / `db.reload` readiness disposition. Review and Browser repair gates derive write capability from that disposition rather than from truth identity alone, because verified identity does not imply writable storage.

The storage mode remains `read-only-storage-pressure` while recovery is pending, running, retryable, or terminally blocked. A completed job re-reads the manifest and inventory, verifies truth coverage, runs bounded cleanup, and reclassifies pressure. Writable mode is restored only when the classifier returns an accepted writable status.

### Make orphan cleanup manifest-proven and bounded

Cleanup lists files only under `sqlite-delta/v2`, builds a protected set from the verified current manifest, open segment, active checkpoint, and in-progress adoption generation, and considers only normalized segment filenames outside that set. Each run deletes at most a configured file and byte budget. Before each deletion it rechecks that the path is not protected by the latest verified manifest.

The result records deleted, skipped, failed, and remaining counts/bytes. A list failure, path normalization failure, manifest verification failure, or delete verification failure stops the batch and keeps the job retryable or terminally failed. The initial deployment will not automatically remove files outside this manifest-proven set.

### Report one deduplicated recovery job

Background work will expose a storage-pressure recovery job keyed by truth identity and active manifest generation. Its phases are `planning`, `adopting`, `promoting-truth`, `compacting`, `cleaning-orphans`, `reclassifying`, and terminal `completed` or `failed`. Repeated startup descriptors join the same job rather than starting concurrent adoption or cleanup.

Diagnostics contain paths, counts, byte totals, classifications, and error codes, but no note content or serialized row bodies.

## Risks / Trade-offs

- **Legacy evidence cannot be classified safely** -> Keep storage readable but read-only, report the first unsupported entry and aggregate counts, and retain all evidence for a future explicit migrator.
- **Replacement generation temporarily needs additional disk space** -> Plan required bytes before writing, use bounded batches/generations, and stop with `insufficient-recovery-headroom` rather than partially switching the manifest.
- **Crash leaves new unreachable files before manifest publication** -> Use deterministic generation paths and include them in the next manifest-proven orphan inventory.
- **Host delete reports success without actual deletion** -> Re-list or read after delete and treat continued existence as failure; never clear the cleanup checkpoint on unverifiable deletion.
- **Partial truth publication** -> Reuse idempotency keys and ordered Truth Promotion; coverage advances only after replay verification for every mutation in the contiguous batch.
- **Recovery repeatedly retries a deterministic failure** -> Persist phase/error/retry evidence and move the background job to terminal failure after the existing bounded retry policy.
- **Large inventories remain expensive** -> Scope listing to one directory, cap each cleanup batch by files and bytes, and yield between batches after startup readiness.

## Migration Plan

1. Deploy the no-progress compaction guard and host-effect capability checks first. This immediately stops new amplification while preserving read-only access.
2. Deploy real delete/list host effects with protocol and integration tests. Do not run orphan cleanup until deletion can be verified end to end.
3. Enable legacy adoption planning in diagnostics-only mode and validate supported/unsupported counts against real-scale fixtures.
4. Enable post-ready adoption and truth promotion. Keep the write gate closed until coverage and active compaction complete.
5. Enable bounded manifest-proven orphan cleanup, initially with conservative file/byte budgets.
6. Reclassify pressure after every completed batch; restore writable behavior only after all recovery invariants pass.

Rollback disables background adoption/cleanup descriptors but retains the no-progress guard and hard-pressure write gate. Newly published canonical truth is append-only and idempotent, so rollback does not require deleting it. Manifest checkpoints remain resumable by the prior safe cleanup logic.

## Open Questions

- The exact supported legacy table/label matrix will be fixed by characterization tests before adoption writes are enabled. Any shape without a proven canonical encoder remains unsupported.
- Segment-size and bounded-read concurrency tuning should be proposed separately after correctness recovery, using startup profiles from the repaired store.
