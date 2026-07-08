## Context

SiYuanMemo already defines BrowserProjectionIndex as the Browser-facing projection owner and SessionQueueIndex / SRS Review Kernel as active Review session owners. Current review entry still lets each UI surface prepare queues independently, then asks worker session start to read the current generation for a queue type. That keeps the projection identity implicit and lets Browser freshness side effects decide which cards a review session sees.

The Anki-style target is: queue construction/admission happens before review starts; answer handling mutates the same admitted queue/session; Browser refresh does not become the hidden review queue owner.

## Goals / Non-Goals

**Goals:**
- One Review Admission Module owns projection freshness checks and materialization before review starts.
- Projection-backed review sessions carry an explicit admission ticket from entrypoint to worker.
- Worker session start reads rows from the admitted `policyHash + generation`.
- Missing or stale admission evidence blocks review instead of falling back to a stale ready generation.
- Tests cover topbar/browser entry equivalence at the admission seam and worker explicit projection use.

**Non-Goals:**
- Do not rewrite scheduler algorithms.
- Do not move feedback commit, undo journal, or delta sync ownership.
- Do not change NeuralRoam advance-backed review.
- Do not add compatibility fallback to stale projection reads.

## Decisions

1. **Review Admission Module as application seam**

   `ReviewAdmissionModule` will live in application services and expose one interface: admit a review session for a queue type and entry surface. It hides readiness request construction, queue lookup, materialization, retry/readiness verification, and ticket shaping.

   Alternative rejected: add materialization calls in every UI entrypoint. That keeps entry complexity shallow and repeats policy knowledge.

2. **Ticket, not queueType lookup**

   The admission result will carry `queueType`, `projectionPolicyHash`, `projectionGeneration`, and `entrySurface`. Downstream modules pass this ticket without rebuilding policy identity.

   Alternative rejected: pass only `forceRefresh`. That still leaves worker selecting "latest ready" by queue type and does not prove both entrypoints share the same projection.

3. **Fail closed for projection-backed SRS sessions**

   Retrieval Practice and Incremental Learning worker-backed sessions require an explicit projection ticket once routed through admission. If the ticket is missing or invalid on this path, worker returns unavailable/throws at session start rather than serving stale rows.

   Alternative rejected: worker fallback to `readGeneration(queueType)`. That is the root stale-projection seam.

4. **Keep static subset / NeuralRoam paths out of admission**

   Static subset, filter transfer, final drill, and NeuralRoam have different session ownership. The first pass admits only projection-backed SRS queues.

## Risks / Trade-offs

- Admission materialization can add start latency when projection is stale → bounded to review open, not feedback hot path, and logs show explicit admission timing.
- Existing tests that start worker sessions directly may need explicit tickets → update tests to reflect active contract.
- Queue projection readiness request must stay canonical with Browser projection policy → centralize request construction in admission module.
