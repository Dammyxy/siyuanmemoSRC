## Why

A real Review rating was durably journaled as sequence 404 under identity epoch `f771...`, after predecessor epoch coverage reached 403. A later browser-origin identity loss generated epoch `4afa...`; the Verified Mutation Frontier correctly refuses to cover or promote the unchanged foreign-epoch mutation. Live acceptance then proved that the new installation-local authority file is absent and the surviving temp-local record contains only a device ID, so recovery must establish a certified installation authority before it can repair journal continuity. Neither step can be replaced by an identity rewrite or retry loop.

## What Changes

- Add a dedicated recovery workflow that inventories missing/current/previous installation authority evidence, the original journal envelope, predecessor coverage, truth manifests, and existing Frontier evidence before proposing any mutation.
- Add an explicit authority-recovery phase that may publish the installation authority only from a Worker-certified, content-addressed identity proof; browser caches, temp-local device ID, `System.ID`, synchronized truth, timestamps, or operator-entered values cannot independently choose the authority.
- Define a typed recovery plan that can prove a same-device epoch transition at the exact 403 to 404 boundary while preserving mutation ID, original identity epoch, journal sequence, payload, required truth outputs, and idempotency evidence.
- Require preview, deterministic validation, backup/export evidence, explicit staged apply, authority read-back verification, restart reclassification, and a fresh continuity preview before Review writes can be re-enabled.
- Make recovery idempotent and resumable; partial publication must remain recovery-required and must never create competing coverage or a duplicate truth fact.
- Reject recovery when device ownership, predecessor coverage, sequence adjacency, mutation content, or truth non-publication cannot be proven.
- Explicitly forbid rebinding epoch `f771...` to `4afa...`, skipping or renumbering sequence 404, fabricating coverage, rewriting the Review rating, or adopting a guessed Truth Device Identity.

## Capabilities

### New Capabilities

- `foreign-epoch-journal-continuity-recovery`: Evidence inventory, preview/apply protocol, exact multi-epoch Frontier transition proof, immutable mutation preservation, idempotent publication, and post-recovery write admission.

### Modified Capabilities

None.

## Impact

- Installation Truth Device Identity recovery coordination, Worker Verified Mutation Frontier, Truth Promotion, SQLite delta/journal evidence readers, storage recovery classification, and recovery diagnostics.
- Backend recovery RPC contracts and an explicit user-invoked recovery surface; ordinary startup and Review paths remain fail closed.
- The damaged installation remains read-only until this separate change is implemented and its acceptance evidence passes.
