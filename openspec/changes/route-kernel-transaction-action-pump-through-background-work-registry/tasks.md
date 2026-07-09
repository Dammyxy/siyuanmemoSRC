## 1. Contract

- [x] 1.1 Extend Kernel Companion Background Work kinds and diagnostics for kernel transaction action polling
- [x] 1.2 Add tests proving polling jobs surface accepted/running/completed/canceled/deferred lifecycle states

## 2. Action Pump

- [x] 2.1 Inject the shared background work registry into `KernelTransactionActionPump`
- [x] 2.2 Replace direct polling interval ownership with registry-submitted polling jobs
- [x] 2.3 Preserve wake, empty/backend/writer backoff, deferred native Riff upsert, AutoCard handoff, and requeue behavior
- [x] 2.4 Ensure dispose cancels active polling jobs and suppresses late follow-up scheduling

## 3. Wiring And Docs

- [x] 3.1 Wire ActionPump to the shared registry in `ApplicationContext`
- [x] 3.2 Update architecture/context/backlog docs for the new lifecycle owner and deferred durable status debt

## 4. Validation

- [x] 4.1 Run focused registry and ActionPump tests
- [x] 4.2 Run hidden-fallback, boundary, OpenSpec, diff, and build validation
