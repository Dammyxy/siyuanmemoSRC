## 1. Regression Coverage

- [x] 1.1 Add Review session runtime coverage proving slow total flushes sub-threshold session steps
- [x] 1.2 Add coverage proving slow total records `session-feedback-unattributed-gap`
- [x] 1.3 Add quiet-path coverage proving fast feedback does not emit extra session timing

## 2. Implementation

- [x] 2.1 Buffer session feedback substep timings inside one feedback call
- [x] 2.2 Flush buffered substeps when `session-feedback-total` is slow
- [x] 2.3 Compute and record session unattributed gap when slow total exceeds measured substeps
- [x] 2.4 Preserve existing slow-summary channel and avoid new normal-path logs

## 3. Documentation

- [x] 3.1 Update architecture/backlog docs with the session gap diagnostic contract

## 4. Validation

- [x] 4.1 Run focused Review session timing tests
- [x] 4.2 Run OpenSpec validation, fallback/boundary checks, build, and diff checks
