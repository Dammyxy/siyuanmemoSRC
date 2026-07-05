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
