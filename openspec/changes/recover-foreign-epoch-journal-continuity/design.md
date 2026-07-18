## Context

The damaged installation has a verified predecessor promotion watermark at journal sequence 403, followed by a durable Review mutation at sequence 404 whose original envelope carries epoch `f771...`. Browser-origin identity loss later generated epoch `4afa...`. Live acceptance on 2026-07-17 proved that `/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json` and its previous-revision companion are absent. The surviving temp-local identity contains only a device ID and cannot satisfy the authority schema. Normal startup therefore first enters `identity-recovery-required`; after authority recovery it is still expected to encounter the uncovered foreign epoch before Truth Promotion can publish sequence 404.

The ordinary runtime cannot solve either state by retrying: it is deliberately prohibited from inventing a missing authority or promoting an uncovered foreign epoch. Recovery must first prove and publish one installation authority, require restart to reclassify it through the normal identity path, then prove and publish sequence 404 under its original epoch. Only then may the normal Frontier inherit verified coverage into the recovered authority. The installation remains read-only throughout this operation.

## Goals / Non-Goals

**Goals:**

- Prove one installation identity candidate from durable incident evidence and publish it through the installation authority port with exact read-back verification.
- Require restart and a fresh content-addressed preview after authority publication; the first-stage plan cannot silently continue against newly established authority state.
- Prove the exact same-device sequence 403 to 404 continuity from immutable local evidence.
- Publish sequence 404's required truth outputs under its original `f771...` envelope without changing any mutation identity field.
- Persist content-addressed recovery evidence and an idempotent terminal receipt.
- Rebuild a normal current-authority Frontier only after original-epoch truth coverage reaches 404.
- Keep interrupted, ambiguous, or partially published recovery fail closed and safely resumable.

**Non-Goals:**

- Inferring device ownership or choosing an authority epoch from synchronized truth, `System.ID`, browser caches, temp-local device ID, operator input, or file timestamps alone.
- Treating authority recovery as first-install generation or allowing normal startup to publish an authority for a non-empty installation.
- Rebinding epoch `f771...` to `4afa...`, changing sequence 404, replaying the user's rating as a new command, or fabricating a watermark.
- Making ordinary startup automatically repair foreign epochs.
- Repairing arbitrary gaps, conflicting sequence owners, corrupt payloads, or cross-device histories with the same command.

## Decisions

### 1. Use a staged recovery with Worker-certified authority publication

The recovery preview owns identity selection. It inventories missing/current/previous authority files, the incomplete temp-local record, content-bearing journal/delta envelopes, predecessor coverage, transition evidence, truth manifests, and recovery receipts. A candidate is admissible only when durable evidence uniquely binds one device ID and one intended current epoch to this incident. Browser and temp-local observations may corroborate or contradict that proof but cannot satisfy it by themselves.

When authority is absent and the proof is unique, the Worker emits an immutable `authorityPublicationIntent` inside the content-addressed plan. The application recovery coordinator may execute that exact intent through `SiyuanConfTruthDeviceIdentityAuthorityStore` while holding the Kernel identity initialization fence and active writer authority. It cannot alter the identity bytes or construct another candidate. Exact read-back verification persists an `installation-authority-published` phase receipt, after which apply stops and requires restart plus a new preview.

Alternative rejected: let renderer code reconstruct the authority from IndexedDB, localStorage, temp-local, `System.ID`, or user-entered IDs. That would recreate the browser-origin authority defect this architecture removed.

### 2. Keep continuity decisions in an explicit Worker-owned recovery module

Add a dedicated preview/apply/status RPC family whose Worker module owns evidence reads, validation, original-epoch promotion, receipt publication, and Frontier reinitialization. Browser/application code may request and display the operation but cannot construct a recovery plan or write storage files.

The sole exception is the certified installation-authority host effect described above; the Worker chooses and hashes its exact payload while the application supplies the existing authority file port. Ordinary `db.load`, Review admission, Truth Promotion scheduling, and storage maintenance remain blocked. Alternative rejected: teach normal Frontier initialization to accept foreign epochs, because that would turn a one-incident proof into a permanent implicit fallback.

### 3. Bind each apply stage to a content-addressed preview

Preview reads the missing/current/previous installation authority evidence, stored Frontier, all journal evidence at and around the gap, predecessor promotion state, relevant truth manifests, durability receipt, and current recovery state. It emits a versioned plan with evidence hashes, exact expected identities/sequences, authority disposition, blockers, and an operation ID. Apply requires that plan hash and re-reads every input under the recovery lock; any drift invalidates the plan.

An authority-publication plan is terminal for that startup. After read-back verification, restart must resolve the authority through the normal startup module, and a new preview must bind continuity recovery to the published revision/hash. This prevents a pre-authority plan from authorizing post-authority truth or Frontier changes.

This separates diagnosis from mutation and makes operator approval meaningful. Alternative rejected: apply directly from live files, because a changing manifest or authority could make the reviewed evidence differ from the mutated evidence.

### 4. Promote the immutable mutation under its original epoch first

When the plan proves same-device predecessor coverage 403 and the only next journal owner is the intact `f771...` sequence-404 envelope, the recovery module invokes the existing idempotent truth publication machinery configured for that original epoch. Required Review/Card/Queue outputs, mutation ID, idempotency key, payload hash, journal sequence, and truth manifest identity remain unchanged.

Only verified original-epoch truth publication may create coverage 404. No recovery code writes a coverage watermark directly. Alternative rejected: normalize the envelope to the current epoch before promotion, because it would erase the evidence the Frontier is designed to protect.

### 5. Transition to current authority only from verified coverage

After original-epoch coverage 404 verifies, the module re-reads the current installation authority and initializes the normal Frontier for that current epoch from the verified predecessor watermark. The existing transition record may inherit coverage 404 into the current epoch and set the next journal allocation to 405. This transition is allowed only when no conflicting current-epoch mutation or sequence allocation exists.

If the current authority changed since preview or already owns incompatible journal evidence, recovery stops after preserving the verified original-epoch publication and requires a new preview. It never overwrites the authority.

### 6. Serialize recovery and preserve restart safety

Authority apply acquires the Kernel identity initialization fence plus the existing single-writer/runtime authority. Continuity apply acquires the single-writer/runtime authority plus a recovery operation fence, prevents new formal mutations, and uses the Truth Promotion exclusive publication gate. Each phase writes a content-addressed receipt: validated, installation-authority-published when required, original-epoch-published, Frontier-transitioned, restart-verified. Repeating the same operation reuses verified outputs; a different plan cannot claim the same operation ID.

Alternative rejected: one large uncheckpointed function, because host interruption between truth publication and Frontier transition is expected and must not duplicate the Review fact.

### 7. Re-enable writes only through normal startup classification

Recovery apply never flips Review admission directly. It finishes by closing the Worker runtime and requiring `db.reload` or restart to validate the installation authority, journal allocation, truth outputs, Frontier, delta, and projection through ordinary gates. Only a normal writable readiness result completes the receipt.

## Risks / Trade-offs

- [Evidence needed for sequence 404 is missing or contradictory] -> Refuse apply and export a content-safe blocker report; do not broaden inference rules.
- [Authority candidate evidence is incomplete or contradictory] -> Refuse authority publication; temp-local or browser cache values remain diagnostics only.
- [Authority publication succeeds but restart classification fails] -> Stop before continuity recovery and retain the verified authority receipt plus normal startup blocker.
- [Truth output was partly published before the incident] -> Reuse manifest/idempotency evidence and verify exact logical output identity before appending anything.
- [Host stops after original-epoch promotion but before Frontier transition] -> Resume from the phase receipt and verified watermark; never replay the user command.
- [Current authority gains mutations before recovery] -> Keep formal writes disabled and reject the stale plan on re-read.
- [A generic multi-epoch API could become a bypass] -> Scope the first implementation to an exact adjacent, same-device, single-uncovered-mutation proof and require explicit plan/apply.

## Migration Plan

1. Add read-only evidence inventory and typed preview contracts with fixtures reproducing missing authority, incomplete temp-local identity, predecessor 403, foreign epoch 404, and durable `4afa...` transition evidence.
2. Add deterministic authority-candidate and continuity validators plus plan hashing; prove every rejected ambiguity leaves bytes unchanged.
3. Add fenced authority publication through the existing authority port, exact read-back verification, a phase receipt, and mandatory restart/new preview.
4. Add fenced, checkpointed original-epoch promotion using existing publication idempotency and exclusive gates.
5. Add verified Frontier transition/reinitialization and restart classification.
6. Exercise both stages against a copied installation first, compare hashes/receipts, then require an explicit backup/export before live apply.
7. Rollback means keeping the installation read-only and restoring the pre-apply copy only before a new authority or verified truth is published. After either durable publication, resume/complete the idempotent recovery; never delete verified output to simulate rollback.

## Open Questions

None for proposal readiness. Implementation must capture the exact real evidence hashes in an acceptance fixture before live apply.
