## 1. Slow Summary Evidence

- [x] 1.1 Trace the active `review.feedback` slow summary path from worker timing payload to `BrowserSrsBackendWorkerTransport`.
- [x] 1.2 Add or update focused coverage for summary formatting when `slowestHostEffect` has `path` and `storageClass`.
- [x] 1.3 Add explicit formatting for missing host-effect path so copied logs do not imply the wrong file.
- [x] 1.4 Include the slowest host effect path and storage class in the copyable slow Review feedback summary.

## 2. Root-Cause Classification Loop

- [x] 2.1 Build and deploy the plugin with the diagnostic summary change.
- [ ] 2.2 Rerun a slow Review grading session and capture copied console logs.
- [ ] 2.3 Classify the dominant host path as delta manifest, open segment, sealed segment, main database, diagnostics, or other SQLite storage.
- [ ] 2.4 Create the follow-up fix change for the confirmed root path.

## 3. Validation

- [x] 3.1 Run targeted tests for the transport/timing summary formatting.
- [x] 3.2 Run `pnpm run check:boundaries` or the relevant fallback-boundary check.
- [x] 3.3 Run `pnpm build`.
- [x] 3.4 Validate `diagnose-review-feedback-host-effect-path` with OpenSpec strict validation.

## 4. Session Feedback Layered Timing

- [x] 4.1 Extend the change artifacts to cover `review.session.feedback` layered timing diagnostics.
- [x] 4.2 Add focused coverage for copyable slow `review.session.feedback` timing summaries.
- [x] 4.3 Record worker/session inner steps for `review.session.feedback` without changing rating behavior.
- [x] 4.4 Run focused tests, boundary checks, build, and strict OpenSpec validation.

## 5. Frontend Feedback Layered Timing

- [x] 5.1 Add focused coverage for copyable frontend `queue.onFeedback` timing summaries.
- [x] 5.2 Split runtime-backed Review feedback into `session-runtime-answer`, cursor/counter sync, and `consume-advance` layers.
- [x] 5.3 Run focused tests, boundary checks, build, and strict OpenSpec validation.
- [ ] 5.4 Rebuild/reload and classify whether the remaining frontend gap is transport wait or next-card preparation.

## 6. Consume Advance Substep Timing

- [x] 6.1 Add focused coverage for nested `consume-advance` timing evidence.
- [x] 6.2 Split `consume-advance` into prepare-card, CDF refresh, nextDues, state replacement, cursor sync, and pending counter steps.
- [x] 6.3 Run focused tests, boundary checks, build, and strict OpenSpec validation.
- [ ] 6.4 Rebuild/reload and classify whether `consume-advance` is dominated by CDF live relation refresh or scheduler nextDues.
