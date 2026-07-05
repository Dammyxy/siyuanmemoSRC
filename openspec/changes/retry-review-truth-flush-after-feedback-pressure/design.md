## Context

The transport currently suppresses SiYuan persistence host effects (`truth.writeJSON` / `truth.writeBinary`) while Review feedback requests are active. That is correct for preventing background persistence from competing with the hot commit. The failure is that queued Review truth flush treats the suppression error as a finished pending error instead of retrying after pressure clears.

## Design

1. Classify `review.feedback suppressed SiYuan persistence host effect <kind>` as a retryable pressure error in the Review truth flush scheduler.
2. When queued flush hits this pressure error, keep journal entries queued, avoid recording it as a terminal pending truth flush failure, and re-arm the flush timer with a short backoff.
3. Ensure retry is bounded by existing timer/queue mechanics, not an immediate busy loop.
4. Keep all Review committed-success durability semantics unchanged: synchronous feedback commit remains fail-closed where required; deferred truth flush only retries queued truth entries.

## Non-Goals

- No new fallback storage path.
- No stale snapshot fallback.
- No native DB owner or kernel writer.
- No broad kernel handler latency redesign in this change.
