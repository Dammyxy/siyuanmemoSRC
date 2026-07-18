## 1. Compact Frontier Contract

- [x] 1.1 Add failing tests that new rating and skip journals persist ordered identities without frontier card objects.
- [x] 1.2 Add failing tests for schema-v1 normalization and malformed legacy evidence rejection.

## 2. Authoritative Undo Restoration

- [x] 2.1 Add failing restart-safe undo tests for exact current/lookahead/counter restoration from repository hydration.
- [x] 2.2 Add failing tests proving missing cards and current block mismatches fail closed without installing a partial session.

## 3. Runtime Implementation

- [x] 3.1 Introduce schema-v2 compact frontier types, builders, validation, and the one-way schema-v1 normalizer.
- [x] 3.2 Switch Review answer and skip journal writers to schema v2 while preserving complete before/after card evidence.
- [x] 3.3 Restore schedules before compact frontier hydration and rebuild session state only after all authoritative reads succeed.
- [x] 3.4 Normalize SQLite journal reads and adapt projection invalidation to compact current-block evidence.

## 4. Durability Budget And Validation

- [x] 4.1 Add a representative 113-card journal payload regression and require identity-only frontier JSON.
- [x] 4.2 Add a representative Review feedback SQLite delta regression below 65,536 bytes.
- [x] 4.3 Run focused Review/session/undo/delta tests and confirm the changed modules add no new TypeScript errors.
- [x] 4.4 Run `pnpm run check:boundaries`, `pnpm build`, and strict OpenSpec validation.
