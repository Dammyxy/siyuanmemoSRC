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

## 3. Classification by Ownership Bucket (RM024)

### 3.1 Application-owned command boundary (current truth, not cutover-complete)

- Xiuyuan direct-SQL usecases and shared scanners/resolvers listed in 2.1.
- AutoCard scanner SQL in `AutoCardHandler.ts:3102`.
- Menu/dialog orchestration SQL in `BlockMenuHandler.ts` and `DialogManager.ts` listed in 2.5.

Reason:
- These call sites live in active application orchestration and still hold read/decision responsibilities needed by current product behavior.
- They are not backend-worker command ownership yet.

### 3.2 Compatibility read

- Browser fallback compatibility-read was already explicitly retained in R4 (`BrowserApplicationService` + allowlist entry `cutover-browser-fallback-compat-read`).
- R5 inventory targets above are **not** newly reclassified as Browser-style compatibility read in this round.

### 3.3 Deferred debt

- Progressive and Topic-derived direct `@/core/siyuan/block` imports remain boundary debt.
- Xiuyuan/AutoCard/Menu/Dialog direct SQL remains migration debt relative to old Phase 6 cutover wording.

### 3.4 Backend command

- No newly inventoried path in this R5 list is currently backend-command owned end-to-end.
- Existing backend-command ownership for AutoCard decision/execute remains in separate P6 chain and does not automatically cover these read/helper paths.

## 4. Blocked Task List and Acceptance Impact (RM025)

This round chooses the allowed RM025 branch: **create blocked list with acceptance impact**.

### BLK-P6-01 Progressive boundary cleanup

- Scope: remove direct `@/core/siyuan/block` helper dependency from `ProgressiveReadingService` via explicit application port + infrastructure adapter.
- Acceptance impact if open: old Phase 6 ownership cutover remains not accepted.

### BLK-P6-02 Topic-derived boundary cleanup

- Scope: remove direct `@/core/siyuan/block` helper dependency from `TopicDerivedItemService` via explicit application port + infrastructure adapter.
- Acceptance impact if open: Topic-derived still has application->core/siyuan boundary leak.

### BLK-P6-03 Xiuyuan SQL traversal migration

- Scope: Xiuyuan usecases/scanners/resolvers in section 2.1 migrate direct SQL traversal behind explicit query port boundaries (or backend command ownership where appropriate).
- Acceptance impact if open: cannot claim old Phase 6 Progressive/Xiuyuan/Topic-derived migration complete.

### BLK-P6-04 AutoCard scanner SQL boundary migration

- Scope: move scanner SQL read in `AutoCardHandler.ts:3102` behind explicit query boundary with runtime policy/ownership declaration.
- Acceptance impact if open: AutoCard side scanner still partly tied to direct host SQL in application layer.

### BLK-P6-05 Menu/Dialog SQL read boundary migration

- Scope: replace direct SQL reads in `BlockMenuHandler` and `DialogManager` with query boundary service usage.
- Acceptance impact if open: command orchestration still includes direct host SQL calls, blocking strict boundary acceptance.

Exit criterion for old Phase 6 acceptance claim:
- BLK-P6-01 through BLK-P6-05 closed, or each converted into explicit compatibility-read entries with owner + removal condition and corresponding acceptance wording downgrade.
