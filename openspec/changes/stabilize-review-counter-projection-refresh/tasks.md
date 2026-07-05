## 1. Counter Readiness

- [x] 1.1 Add a session-runtime counter initialization contract.
- [x] 1.2 Route SRS v2 Review stats/counter reads through the runtime before projection.

## 2. Regression Coverage

- [x] 2.1 Cover runtime counter initialization without projection reads.
- [x] 2.2 Cover initial `UnifiedQueueStrategy.getStats()` while projection counters are stale.

## 3. Validation And Cleanup

- [ ] 3.1 Run focused Review queue tests.
- [ ] 3.2 Run boundary/build/OpenSpec validation and update debt ledger.
- [ ] 3.3 Clean live plugin storage artifacts only after code validation.
