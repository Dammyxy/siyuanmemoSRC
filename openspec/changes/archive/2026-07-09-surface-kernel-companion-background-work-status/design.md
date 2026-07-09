## Context

The Kernel Companion Background Work registry already records job kind, state, reason, timestamps, attempt count, diagnostics, and errors. It is intentionally lifecycle-only. As more work kinds use it, direct registry records become too raw for UI/kernel companion diagnostics and too easy for callers to interpret differently.

This change adds a read-model Module over registry records. It should increase Depth by giving callers a small, stable status Interface while keeping the registry implementation and work handlers private.

## Goals / Non-Goals

**Goals:**

- Add a read-only status Module that normalizes background-work job records for diagnostics consumers.
- Cover current work kinds: Review truth backfill, Xiuyuan startup sync, and kernel transaction action polling.
- Preserve terminal and in-flight states: accepted, running, completed, failed, deferred, canceled.
- Keep status content safe: no card content, block content, SQL payloads, or private host-effect data.
- Add focused tests for status normalization, filtering, terminal errors, and unavailable/deferred diagnostics.
- Add a narrow backend/client read path only if needed to expose the status Module beyond application memory.

**Non-Goals:**

- No durable registry persistence.
- No UI redesign.
- No scheduler/job runner rewrite.
- No new background-work kinds unless required for tests.
- No broad backend RPC family refactor.

## Decisions

1. **Status read model sits beside the registry.**

   The registry remains the lifecycle owner. The status Module reads cloned registry records and maps them into a stable diagnostic shape.

   Alternative rejected: add more presentation/status methods directly to the registry. That would widen the lifecycle Interface and make callers depend on registry implementation details.

2. **Read-only status cannot mutate work.**

   The status Module may filter, sort, summarize, and redact diagnostics. It must not submit, cancel, defer, retry, or shutdown jobs.

3. **Expose one narrow family if crossing backend/client seam.**

   If application or kernel companion consumers need RPC access, add only a background-work status read method/facet. Do not reopen the completed backend RPC family modularization except for this narrow family hook.

4. **Diagnostics are content-safe by construction.**

   Work-kind-specific diagnostics should expose counters, state, reason, and unavailable/error evidence, not source content or SQL/body payloads.

## Risks / Trade-offs

- A status Module can become shallow if it only returns `registry.status()`. Mitigate by owning normalization, redaction, sorting/filtering, and work-kind summaries.
- Without durable persistence, status disappears on reload. That remains acceptable for this slice because the goal is runtime diagnostics, not audit history.
- Adding a backend read method may touch contracts/client tests. Keep it minimal and do not mix with broader client family reshaping.

