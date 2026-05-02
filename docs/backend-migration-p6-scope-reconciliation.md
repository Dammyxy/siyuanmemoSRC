# P6 Scope Reconciliation (R5 RM022-RM025)

Date: 2026-05-02
Runtime root: `.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`

## 1. P6 Scope Decision (RM022)

Decision: current executable P6 in this branch is **AutoCard-first milestone**, not full old Phase 6 cutover.

- Old roadmap wording in `docs/backend-migration-spec.md` says Phase 6 is Progressive/Xiuyuan/Topic-derived migration.
- Current implemented P6 chain in `ARCHITECTURE.md` and recent task deltas is focused on `autocard.decision.resolve` and `autocard.execute` writer/worker routing.
- Therefore this remediation round treats old Phase 6 Progressive/Xiuyuan/Topic-derived ownership migration as **explicit deferred closure scope**, not done.

Acceptance impact:
- P6 can only be claimed as "AutoCard milestone complete".
- P6 cannot be claimed as "old Phase 6 ownership cutover complete" until blocked items below are closed.

## 2. Inventory: Direct SQL / Direct SiYuan Helper Usage (RM023)

### 2.1 Xiuyuan paths

Direct `siyuanApi.sql(...)` evidence:
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:112`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:135`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:176`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:186`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:197`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:211`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:220`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorCardsUseCase.ts:232`
- `src/application/usecases/xiuyuan/CreateConceptDescriptorAutoUseCase.ts:159`
- `src/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase.ts:80`
- `src/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase.ts:103`
- `src/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase.ts:140`
- `src/application/usecases/xiuyuan/CreateCdfMultilineCardsUseCase.ts:243`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:67`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:95`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:112`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:127`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:140`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:178`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:192`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:206`
- `src/application/usecases/xiuyuan/shared/CdfMultilineScanner.ts:229`
- `src/application/usecases/xiuyuan/shared/ConceptLocator.ts:143`
- `src/application/usecases/xiuyuan/shared/ListChildrenResolver.ts:44`
- `src/application/usecases/xiuyuan/shared/ListChildrenResolver.ts:57`
- `src/application/usecases/xiuyuan/shared/ListChildrenResolver.ts:69`
- `src/application/usecases/xiuyuan/shared/ListChildrenResolver.ts:82`
- `src/application/usecases/xiuyuan/shared/ListChildrenResolver.ts:95`

### 2.2 Progressive paths

Direct SiYuan helper import evidence:
- `src/application/services/ProgressiveReadingService.ts:30` imports `@/core/siyuan/block`.

No direct `siyuanApi.sql(...)` hit found in this file in current scan.

### 2.3 Topic-derived paths

Direct SiYuan helper import evidence:
- `src/application/services/TopicDerivedItemService.ts:18` imports `@/core/siyuan/block`.

No direct `siyuanApi.sql(...)` hit found in this file in current scan.

### 2.4 AutoCard scanner path

Direct `siyuanApi.sql(...)` evidence:
- `src/application/handlers/AutoCardHandler.ts:3102`

### 2.5 Menu/dialog manager paths

Direct `siyuanApi.sql(...)` evidence:
- `src/application/managers/BlockMenuHandler.ts:1446`
- `src/application/managers/BlockMenuHandler.ts:1542`
- `src/application/managers/DialogManager.ts:1616`
- `src/application/managers/DialogManager.ts:1689`
- `src/application/managers/DialogManager.ts:1980`

### 2.6 DataAccessFacade path

Direct `siyuanApi.sql(...)` evidence:
- `src/application/queries/DataAccessFacade.ts:899`

## 3. Classification by Ownership Bucket (RM024)

### 3.1 Application-owned command boundary (current truth, not cutover-complete)

- Xiuyuan direct-SQL usecases and shared scanners/resolvers listed in 2.1.
- AutoCard scanner SQL in `AutoCardHandler.ts:3102`.
- Menu/dialog orchestration SQL in `BlockMenuHandler.ts` and `DialogManager.ts` listed in 2.5.

Reason:
- These call sites live in active application orchestration and still hold read/decision responsibilities needed by current product behavior.
- They are not backend-worker command ownership yet.

### 3.2 Compatibility read

- `DataAccessFacade` read path remains compatibility-read scoped in current allowlist classification and has not been migrated to an explicit backend/application query boundary.

### 3.3 Deferred debt

- Progressive and Topic-derived direct `@/core/siyuan/block` imports remain boundary debt.
- Xiuyuan/AutoCard/Menu/Dialog direct SQL remains migration debt relative to old Phase 6 cutover wording.

### 3.4 Backend command

- No newly inventoried path in this R5 list is currently backend-command owned end-to-end.
- Existing backend-command ownership for AutoCard decision/execute remains in separate P6 chain and does not automatically cover these read/helper paths.

## 4. Executable Owner Table (R11 RM057)

| Surface | Evidence | Current Owner | Target Owner | Required Boundary Change | Execution Tasks | Validation Evidence | Status | Acceptance Impact |
|---|---|---|---|---|---|---|---|---|
| Xiuyuan shared scanners/resolvers (`CdfMultilineScanner`, `ConceptLocator`, `ListChildrenResolver`) | Section 2.1 lines, e.g. `CdfMultilineScanner.ts:67`, `ConceptLocator.ts:143`, `ListChildrenResolver.ts:44` | `application-command` | explicit query port (application) or backend command | Remove direct `siyuanApi.sql(...)`, inject query port in `src/application/usecases/xiuyuan/shared/` | `RM060`, `RM058`, `RM059`, `RM064` | `rg -n "siyuanApi\\.sql\\(" src/application/usecases/xiuyuan/shared` should be empty; focused tests pass | blocked | Old Phase 6 cannot be accepted while open |
| Xiuyuan card creation usecases (`CreateCdfMultilineCardsUseCase`, `CreateConceptDescriptorAutoUseCase`, `CreateConceptDescriptorCardsUseCase`) | Section 2.1 lines, e.g. `CreateCdfMultilineCardsUseCase.ts:80`, `CreateConceptDescriptorAutoUseCase.ts:159` | `application-command` | same ownership boundary as Xiuyuan shared ports | Remove direct SQL traversal from usecases and route through new shared boundary | `RM061`, `RM058`, `RM059`, `RM064` | `rg -n "siyuanApi\\.sql\\(" src/application/usecases/xiuyuan` limited to migrated exceptions only; tests pass | blocked | Xiuyuan ownership still leaks to host SQL |
| Progressive (`ProgressiveReadingService`) | Section 2.2, `ProgressiveReadingService.ts:30` (`@/core/siyuan/block`) | `application-command` with helper leak | explicit application port boundary | Replace direct helper import with injected port/adapter | `RM062`, `RM058`, `RM059`, `RM064` | `rg -n "from '@/core/siyuan/block'" src/application/services/ProgressiveReadingService.ts` should be empty; tests pass | blocked | Progressive path not cutover-complete |
| Topic-derived (`TopicDerivedItemService`) | Section 2.3, `TopicDerivedItemService.ts:18` (`@/core/siyuan/block`) | `application-command` with helper leak | explicit application port boundary | Replace direct helper import with injected port/adapter | `RM062`, `RM058`, `RM059`, `RM064` | `rg -n "from '@/core/siyuan/block'" src/application/services/TopicDerivedItemService.ts` should be empty; tests pass | blocked | Topic-derived path not cutover-complete |
| AutoCard scanner (`AutoCardHandler` scanner read) | Section 2.4, `AutoCardHandler.ts:3102` | `application-command` | explicit query boundary under runtime policy | Move scanner SQL read behind query port/service | `RM058`, `RM059`, follow-up under `RM060/RM061` scope split | `rg -n "siyuanApi\\.sql\\(" src/application/handlers/AutoCardHandler.ts` scanner call removed or explicitly re-owned | blocked | AutoCard ownership claim remains partial |
| BlockMenu | Section 2.5, `BlockMenuHandler.ts:1446`, `:1542` | `application-command` | explicit query boundary | Replace direct SQL calls with query boundary service | `RM058`, `RM059`, follow-up in old Phase 6 closure | `rg -n "siyuanApi\\.sql\\(" src/application/managers/BlockMenuHandler.ts` should be empty or explicitly allowlisted with expiry | blocked | Manager layer still touches host SQL directly |
| DialogManager | Section 2.5, `DialogManager.ts:1616`, `:1689`, `:1980` | `application-command` | explicit query boundary | Replace direct SQL calls and inline SQL pass-through with bounded query service | `RM058`, `RM059`, follow-up in old Phase 6 closure | `rg -n "siyuanApi\\.sql\\(" src/application/managers/DialogManager.ts` should be empty or explicitly allowlisted with expiry | blocked | Dialog orchestration violates strict boundary |
| DataAccessFacade | Section 2.6, `DataAccessFacade.ts:899` | `compatibility-read` | explicit application query boundary (no direct SQL in facade) | Remove direct SQL call and keep read model behind query services/ports | `RM058`, `RM059`, `RM063`, `RM064` | `rg -n "siyuanApi\\.sql\\(" src/application/queries/DataAccessFacade.ts` removed; allowlist entry removed | blocked | Old Phase 6 acceptance remains blocked if retained without expiry |

Exit criterion for old Phase 6 acceptance claim:
- All rows above move to `done`, or are explicitly downgraded to bounded compatibility-read with owner, expiry/removal condition, and acceptance wording updated in `acceptance-review-p1-p9.md`.
