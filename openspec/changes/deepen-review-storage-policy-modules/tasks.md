## 1. Review Feedback Storage Envelope

- [x] 1.1 Add a focused Review Feedback Storage Envelope module with typed diagnostic dependencies and result input.
- [x] 1.2 Move `BackendReviewFeedbackStorageState` assembly out of `WorkerSqliteDatabaseService`.
- [x] 1.3 Move Review feedback SQL delta diagnostic read/wrap logic behind the envelope module.
- [x] 1.4 Preserve current Review feedback mutation ownership: journal append/mark, truth candidate creation, SQL projection writes, and persistence remain worker-owned.

## 2. Storage Policy Catalog

- [x] 2.1 Add a contracts storage policy catalog module for MessagePack truth schemas/storage policies and SQL projection schemas/policies.
- [x] 2.2 Re-export catalog-owned constants/types/functions from `packages/contracts/src/backend-rpc.ts` to preserve import compatibility.
- [x] 2.3 Keep catalog module contract-only with no worker/runtime/filesystem imports.
- [x] 2.4 Preserve existing policy values and SQL-first storage semantics.

## 3. Tests

- [x] 3.1 Add focused Review Feedback Storage Envelope tests for committed envelope, pending journal, queue impact mapping, and SQLite delta diagnostics failure.
- [x] 3.2 Keep or extend backend contract tests proving storage policy exports and values remain compatible from `backend-rpc.ts`.
- [x] 3.3 Run focused worker Review feedback/storage tests covering the extracted envelope path.

## 4. Documentation And Validation

- [x] 4.1 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred debt, including the prior bootstrap deferrals now handled or still deferred.
- [x] 4.2 Update `ARCHITECTURE.md` only if Review storage or contract policy ownership text materially changes.
- [x] 4.3 Run `openspec validate deepen-review-storage-policy-modules --strict`.
- [x] 4.4 Run focused envelope/contract tests.
- [x] 4.5 Run `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, `pnpm build`, and `git diff --check`.
