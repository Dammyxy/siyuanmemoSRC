> Superseded on 2026-07-16 by `review-domain-sync-independence`: domain-sync diagnostics are passive and cannot block Review or open a conflict dialog. This design is historical only.

## Context

Domain sync exists to protect users who review or edit cards from more than one SiYuan endpoint and then bring those states back together. The current failure is twofold: repair preview cannot build a plan because worker SQLite calls `this.fnv1a32(...)` without defining that method, and Review entry treats broad repairable status as a global hard stop even when diagnostics have no cleanup source and no current-card risk.

## Goals / Non-Goals

**Goals:**
- Make repair preview deterministic and non-throwing for repairable domain sync evidence.
- Keep hard safety gates for real cross-source conflicts and current-card review-history drift.
- Allow Review when repairable drift is known to be non-mutating for the current action, such as reps count lag or other-card drift.

**Non-Goals:**
- Remove the domain sync feature.
- Delete durable truth, review history, or card data.
- Redesign manual sync conflict direction resolution.

## Decisions

- Use a private worker SQLite `fnv1a32` helper instead of importing a duplicated ledger-local function. This keeps hashing owned by the service methods that already persist repair plans and domain sync operations, without broad module churn.
- Keep `repairable` as a diagnostic state, but make Review safety reason-aware. `review-history-newer-than-card-state` remains blocking when it can affect Review; `review-event-count-exceeds-card-reps` alone is allowed because it means review history already has events and card reps trail derived state.
- Keep existing manual repair UI reachable. The dialog remains the place to preview/apply repair; the change only prevents a preview crash and avoids overblocking Review.

## Risks / Trade-offs

- Repairable drift may still be shown while Review is allowed → mitigated by keeping blocking for current-card/newer-history and by preserving manual repair access.
- Global entry without a current card has less context → mitigated by blocking only when newer-history evidence exists or diagnostics are incomplete/truncated.
