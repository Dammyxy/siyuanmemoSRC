# P6 Scope Reconciliation (R5 RM022-RM025)

Date: 2026-05-06
Runtime root: `.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`

## 1. Scope Decision

Current executable P6 still means the AutoCard-first milestone plus the old Phase 6 boundary closure. It is not a blanket claim that every Xiuyuan / Progressive / Topic-derived write now runs inside the backend worker.

Implemented in this closure round:

- `BackendKernel` now handles `p6.ownership.query` and `p6.ownership.command` instead of returning `METHOD_NOT_FOUND`.
- Read ownership reports return `compatibility-read` with `diagnosticEventId`.
- Side-effect ownership reports return `writer-relay` with `diagnosticEventId`.
- Old direct application host SQL/helper debts listed in the previous reconciliation pass are now moved behind explicit application contracts.

Still staged:

- Broad Xiuyuan / Progressive / Topic-derived write ownership is not claimed as backend-command complete.
- The staged write owner is `writer-relay`; current application services still execute the domain-specific side effects on the active writer surface.

## 2. Boundary Closure Inventory

Current scan result for the old direct-SQL/helper debt:

```powershell
rg -n "siyuanApi\.sql\(" src/application
# no matches

rg -n "@/core/siyuan/block" src/application
# no matches
```

Application-layer host reads now use:

- `src/application/ports/HostBlockQueryPort.ts`
- `src/infrastructure/siyuan/HostBlockQuerySiyuanAdapter.ts`
- `src/application/services/BlockAttrContract.ts`
- `src/application/services/ProgressiveAttrContract.ts`

`kernel.js` remains DB-free:

```powershell
rg -n "siyuanmemo\.db|sqlite|better-sqlite|sql\(" kernel.js
# no matches
```

## 3. Executable Owner Table

| Surface | Previous Debt | Current Owner | Boundary Change | Status | Acceptance Impact |
|---|---|---|---|---|---|
| Xiuyuan shared scanners/resolvers | Direct `siyuanApi.sql(...)` in shared scanners/resolvers | Application explicit query boundary | Host traversal moved behind shared query ports/adapters | done | Direct host SQL no longer blocks old Phase 6 boundary closure |
| Xiuyuan card creation usecases | Direct SQL traversal inside creation usecases | Application command + explicit query boundary | Creation flow uses shared host query contracts instead of raw SQL | done | Backend-command write ownership remains staged, but direct SQL debt is closed |
| Progressive (`ProgressiveReadingService`) | Direct `@/core/siyuan/block` attr import | Application attr contract | Progressive attrs come from `ProgressiveAttrContract` / `BlockAttrContract` | done | Helper boundary debt closed |
| Topic-derived (`TopicDerivedItemService`) | Direct `@/core/siyuan/block` attr import | Application attr contract | Topic-derived attrs come from `ProgressiveAttrContract` | done | Helper boundary debt closed |
| AutoCard scanner | Direct `siyuanApi.sql(...)` scanner read | Application explicit query boundary | Scanner read uses `HostBlockQueryPort` | done | AutoCard P6 read boundary closed |
| BlockMenu | Direct manager SQL | Application explicit query boundary | Manager reads use `HostBlockQueryPort` | done | Manager host SQL debt closed |
| DialogManager | Direct manager SQL / inline SQL pass-through | Application explicit query boundary | Dialog reads use `HostBlockQueryPort`; no generic SQL string port remains in application | done | Dialog host SQL debt closed |
| DataAccessFacade | Direct SQL missing-block filter | Compatibility read through explicit application query boundary | Missing-block filtering uses `HostBlockQueryPort.getExistingBlockIds` | done | Allowlist entry removed |
| Cleanup / scan services | Direct app service SQL reads | Application explicit query boundary | `BlockAttrCleanupService` and `DocumentPostCreationScanService` use semantic host query methods | done | Service SQL debt closed |
| P6 ownership RPC | Missing backend handlers | Backend compatibility/relay report | `p6.ownership.query` -> `compatibility-read`; `p6.ownership.command` -> `writer-relay` | done | No `METHOD_NOT_FOUND`; staged writes are explicitly named |

## 4. Validation Evidence

- `pnpm exec vitest run worker/__tests__/BackendKernel.test.ts --reporter=dot`
- `pnpm exec vitest run src/application/services/__tests__/BlockAttrCleanupService.test.ts src/application/services/__tests__/DocumentPostCreationScanService.test.ts src/application/queries/__tests__/DataAccessFacade.missing-block-filter.test.ts src/application/queries/__tests__/DataAccessFacade.limit-cap-regression.test.ts src/application/queries/__tests__/DataAccessFacade.update-card-regression.test.ts --reporter=dot`
- `pnpm exec vitest run src/application/handlers/__tests__/NativeRiffSyncTriggerHandler.test.ts src/application/services/__tests__/TopicDerivedItemService.test.ts --reporter=dot`
- `pnpm run check:boundaries`
- `pnpm build`
- `git diff --check`

## 5. Remaining Staged Debt

Old Phase 6 direct boundary closure is complete for this branch. The remaining staged item is broader command ownership: deciding which Xiuyuan / Progressive / Topic-derived side effects should later become backend-worker commands instead of writer-relayed application commands.
