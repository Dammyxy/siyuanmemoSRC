## 1. Characterize Frontier Continuity

- [x] 1.1 Add pure frontier regressions for genesis and an already-matching active epoch
- [x] 1.2 Add the observed same-device transition regression with prior coverage 403 and current-epoch first sequence 404
- [x] 1.3 Add fail-closed regressions for conflicting predecessor states, uncovered foreign-epoch entries, unsupported versions, and non-contiguous allocation

## 2. Implement The Verified Mutation Frontier Module

- [x] 2.1 Add the versioned device frontier record, content-safe diagnostics, failure classification, and verified file store
- [x] 2.2 Implement frontier initialization and per-epoch promotion-state migration evidence without rewriting old states or mutation envelopes
- [x] 2.3 Implement cached formal-mutation admission plus monotonic journal and coverage observation

## 3. Integrate Worker Promotion And Recovery

- [x] 3.1 Compose the frontier runtime from `WorkerSqliteDatabaseService` using supplied identity, delta, truth-state, and file-effect dependencies
- [x] 3.2 Make Truth Promotion consume and advance device frontier coverage while preserving ordered publication and durability receipts
- [x] 3.3 Replace unconditional one-second retry with retryable capped continuation and terminal recovery-required handling
- [x] 3.4 Expose frontier readiness through startup/reload write gating and maintenance diagnostics without changing public success result shapes
- [x] 3.5 Preserve deterministic legacy-adoption recovery and prior epoch reconciliation behavior with compatibility tests

## 4. Validate The Change

- [x] 4.1 Run focused frontier, promotion, Worker storage, startup recovery, and legacy adoption test suites
- [x] 4.2 Run type checking, boundary checks, production build, and strict OpenSpec validation
- [x] 4.3 Update architecture or debt documentation only where verified frontier ownership makes current wording stale
