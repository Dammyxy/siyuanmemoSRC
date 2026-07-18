## 1. Contracts and incident fixture

- [x] 1.1 Add versioned preview, authority-publication intent, continuity plan, staged apply, phase-receipt, backup-receipt, and status contracts with content-safe diagnostics.
- [x] 1.2 Capture a deterministic redacted incident fixture proving missing current/previous authority, incomplete temp-local identity, predecessor coverage 403, the intact original `f771...` sequence-404 envelope, durable current-epoch `4afa...` evidence, journal allocation, manifests, durability receipt, and current recovery state.
- [x] 1.3 Add invariant tests that hash and compare every immutable mutation identity field before and after recovery.

## 2. Evidence inventory and planning

- [x] 2.1 Implement a read-only Worker evidence inventory over missing/current/previous installation authority input, temp-local diagnostics, Frontier, journal/delta, predecessor promotion states, truth manifests, receipts, and recovery state.
- [x] 2.2 Implement deterministic authority-candidate proof plus same-device adjacency validation for one unique uncovered sequence immediately after verified predecessor coverage.
- [x] 2.3 Implement staged content-addressed plan generation and revalidation with explicit blockers for authority, device, epoch, sequence, mutation, manifest, receipt, or allocation ambiguity.
- [x] 2.4 Add tests proving preview performs zero writes and every stale/ambiguous plan rejection leaves all bytes unchanged.

## 3. Recovery authority and lifecycle

- [x] 3.1 Add dedicated Worker-owned recovery preview/apply/status RPCs plus an application authority-publication coordinator that can execute only a certified intent.
- [x] 3.2 Compose authority apply with the Kernel identity initialization fence and active writer authority; compose continuity apply with the recovery operation fence and Truth Promotion exclusive publication gate.
- [x] 3.3 Require and verify a pre-apply backup/export receipt bound to the approved plan hash.
- [x] 3.4 Persist idempotent validated, installation-authority-published, original-epoch-published, Frontier-transitioned, and restart-verified phase receipts.
- [x] 3.5 Add interruption/restart tests at every phase boundary and reject competing operation IDs.
- [x] 3.6 Require authority apply to stop after exact read-back and accept continuity apply only from a fresh post-restart plan bound to the verified authority revision/hash.

## 4. Original-epoch publication

- [x] 4.1 Route the certified sequence-404 entry through existing truth publication configured for its unchanged original epoch and stable output identities.
- [x] 4.2 Verify already-published or newly-published logical outputs and manifest checksums before advancing original-epoch coverage.
- [x] 4.3 Add tests for partial output, manifest interruption, exact idempotent retry, and duplicate Review fact prevention.
- [x] 4.4 Add negative tests proving epoch rebind, sequence skip/renumber, payload rewrite, direct watermark write, and synthetic coverage are impossible.

## 5. Frontier transition and readiness

- [x] 5.1 Re-read the current installation authority after original-epoch coverage verifies and reject authority revision/epoch drift or incompatible current-epoch journal evidence.
- [x] 5.2 Reinitialize the normal Frontier from verified original-epoch coverage 404, record the evidence-backed transition to the current epoch, and preserve next sequence 405.
- [x] 5.3 Require ordinary `db.reload` or restart classification to verify authority, Frontier, journal, truth, delta, projection, and writable readiness before completing recovery.
- [x] 5.4 Add integration tests proving ordinary startup never auto-recovers and Review admission remains closed until normal writable readiness succeeds.

## 6. Validation and live rollout

- [x] 6.1 Add boundary guards preventing normal startup, Review, generic maintenance, or browser code from invoking recovery apply implicitly.
- [x] 6.2 Run focused Frontier, Truth Promotion, storage recovery, journal immutability, RPC, restart, and duplicate-output suites plus typecheck/build/boundary/OpenSpec validation.
- [x] 6.3 Execute preview and apply against a copied installation, archive before/after hashes and receipts, and prove restart reaches next journal sequence 405 without changing the sequence-404 envelope.
- [ ] 6.4 After explicit approval and a verified live backup, apply to the damaged installation and record final writable readiness; otherwise leave Review writes disabled.
