## Context

`诊断并修复卡片类型` is currently exposed from `BlockMenuHandler`, including preview, commit, and dialog rendering. The operation is global over SiYuanMemo-owned SRS card semantics, not scoped to the clicked block. Users discover the problem inside SRS Browser while filtering/listing cards, so Browser should own the primary repair entry.

The current Module is shallow at the wrong seam: `BlockMenuHandler.runRepairSrsCardSemanticsAction()` exposes global repair behavior through a block menu Interface. Deleting it would force preview/commit/dialog logic into any future Browser or Settings caller. The deepened Module should hide the repair flow behind one DialogManager Interface.

## Goals / Non-Goals

**Goals:**
- Surface SRS Card Semantics repair from the SRS Browser toolbar under a maintenance/diagnostic menu.
- Concentrate preview/commit/dialog behavior behind one shared DialogManager Interface.
- Keep repair explicit: preview first, commit only after user confirmation.
- Avoid duplicated Browser, Settings, and block-menu repair implementations.

**Non-Goals:**
- Change the repair inference rules or database schema.
- Add Settings as the primary entry in this change.
- Add automatic/background card-type repair.
- Add a compatibility fallback when repair service or storage is unavailable.

## Decisions

1. Put the primary entry in SRS Browser toolbar maintenance menu.
   - Rationale: Browser is the user-facing surface where wrong card types are visible and filterable.
   - Alternative considered: Settings maintenance. Rejected as primary because it is farther from the observed problem and less discoverable during triage.
   - Alternative considered: standalone toolbar button. Rejected because toolbar is already dense; a maintenance menu gives discoverability without crowding.

2. Move repair flow to DialogManager.
   - Rationale: DialogManager already owns Browser dialogs and global dialog lifecycles. Its Interface can expose `openSrsCardSemanticsRepairDialog()` while hiding preview/commit/dialog implementation.
   - Alternative considered: keep implementation in BlockMenuHandler and call it from Browser. Rejected because Browser would depend on a block-scoped Module for a global maintenance operation.

3. Remove the block-menu repair item as primary surface.
   - Rationale: The action is not block-scoped, so showing it next to block-local actions misleads users and keeps a shallow menu Module.
   - Alternative considered: leave duplicate entries. Rejected for now because duplicate global repair entries create maintenance and documentation drift.

## Risks / Trade-offs

- Browser toolbar gets another control -> use one icon-only maintenance menu on desktop and hide it on mobile unless explicitly wired later.
- Moving dialog code can break existing repair flow -> keep exact preview/commit sequence and add focused tests around DialogManager and Browser menu routing.
- Block-menu removal may surprise users who found it there -> Browser entry becomes primary and matches the problem-discovery surface.
