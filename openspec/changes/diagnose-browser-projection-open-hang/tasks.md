## 1. Diagnostic Contract

- [x] 1.1 Create OpenSpec proposal, design, and diagnostic requirements for Browser projection open and unload hang evidence.
- [x] 1.2 Validate OpenSpec change strictly before closing.

## 2. Projection And Browser Diagnostics

- [x] 2.1 Add QueueProjection Runtime non-ready snapshot diagnostic with cache state, freshness, validity, counters, and capped ids.
- [x] 2.2 Add BrowserApplicationService diagnostics for unavailable queue pages and passive queue count unavailability.
- [x] 2.3 Add focused tests for QueueProjection Runtime and Browser queue-count diagnostic payloads.

## 3. Unload Pending Work Diagnostics

- [x] 3.1 Extend backend worker transport diagnostics with capped pending request summaries.
- [x] 3.2 Log pending backend work during worker transport disposal.
- [x] 3.3 Add ApplicationContext unload checkpoints with backend transport diagnostics before Review truth flush and transport disposal.
- [x] 3.4 Add focused worker transport diagnostic tests.

## 4. Documentation And Validation

- [x] 4.1 Append DDD backlog delta describing diagnostic-only scope and deferred root fix.
- [x] 4.2 Run focused tests, hidden-fallback check, boundary check, diff check, build, and OpenSpec strict validation.
