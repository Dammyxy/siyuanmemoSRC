## 1. Kernel Lease Policy

- [x] 1.1 Add failing kernel tests for hidden desktop primary-app empty-lease acquire, hidden document-window rejection, and `std` desktop browser rejection.
- [x] 1.2 Implement the narrow kernel hidden-acquire exception for canonical desktop primary-app and reject non-primary desktop surfaces.
- [x] 1.3 Confirm kernel companion still does not write `siyuanmemo.db` and active primary-app leases remain protected from hidden requesters.

## 2. Frontend Runtime Recovery

- [x] 2.1 Add failing `FrontendInstanceRuntime` tests for hidden canonical primary empty-lease recovery and hidden follower/document-window rejection.
- [x] 2.2 Implement role-bound hidden primary-app recovery while preserving backend-worker-unhealthy demotion.
- [x] 2.3 Tighten ordinary desktop browser frontend eligibility so it cannot become desktop writer in `std` desktop kernel policy.

## 3. Stale Follower Write Recovery

- [x] 3.1 Add failing `ReviewCommitUseCase` tests proving stale follower primary-app recovers before local review feedback, while non-primary follower still fails closed.
- [x] 3.2 Implement Review feedback stale follower recovery without local fallback for ineligible surfaces.
- [x] 3.3 Add failing `KernelTransactionActionPump` tests proving no-active-writer relay attempts runtime recovery and uses local dequeue only after writer mode is restored.
- [x] 3.4 Implement ActionPump recovery plus bounded no-active-writer warning/backoff.

## 4. Documentation And Debt Ledger

- [x] 4.1 Update `ARCHITECTURE.md` to describe desktop primary-app role binding, hidden empty-lease recovery, and mobile unchanged behavior.
- [x] 4.2 Update `docs/DDD_RESCAN_BACKLOG.md` with the production debt delta and deferred Docker/browser-only writer policy.
- [x] 4.3 Keep the investigation report aligned with the implemented behavior.

## 5. Validation

- [x] 5.1 Run focused writer policy/runtime/review/action-pump tests.
- [x] 5.2 Run `openspec validate stabilize-desktop-primary-writer-lease --strict`.
- [x] 5.3 Run `node scripts/check-hidden-fallbacks.cjs` or `pnpm run check:boundaries`.
- [x] 5.4 Run `pnpm build`.
