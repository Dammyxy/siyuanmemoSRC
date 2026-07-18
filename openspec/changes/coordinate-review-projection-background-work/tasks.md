## 1. Coordinator Module

- [x] 1.1 Add focused tests for Review surface priority, activity subscriptions, idempotent lifecycle, work coalescing, transition release, and disposal.
- [x] 1.2 Implement `ReviewProjectionWorkCoordinator` with lifecycle handles, observable snapshots, stable-key pending work, and transition diagnostics.
- [x] 1.3 Register and expose the coordinator through `ApplicationContext` with disposal coverage.

## 2. Review Surface Lifecycle

- [x] 2.1 Wire Review dialog register, close, and destroy paths to coordinator lifecycle handles and extend manager tests.
- [x] 2.2 Wire Review tab register, activity, focus, and unregister paths to coordinator lifecycle handles and extend manager tests.
- [x] 2.3 Remove DialogManager and TabManager active Review queue polling getters and the corresponding `IDialogManager` contract.

## 3. Browser Projection Work

- [x] 3.1 Subscribe `SRSBrowser.vue` to the coordinator activity snapshot with component cleanup.
- [x] 3.2 Replace 750 ms Review warmup rescheduling with coordinator-owned per-queue pending work and add no-poll/coalescing tests.
- [x] 3.3 Replace the Browser deferred queue-count Boolean/watch with one coordinator-owned idle catch-up key and add focused coverage.

## 4. Projection Diagnostics And Language

- [x] 4.1 Add failing tests for repeated, changed, and ready-reset queue projection non-ready diagnostics.
- [x] 4.2 Implement per-queue semantic non-ready signature tracking in `QueueProjectionRuntime`.
- [x] 4.3 Add the Review Projection Work Coordinator term and relationships to `CONTEXT.md`.

## 5. Validation

- [x] 5.1 Run affected coordinator, manager, Browser warmup/count, and queue projection tests.
- [x] 5.2 Run `pnpm run check:boundaries`, filter TypeScript diagnostics for changed files, and run `pnpm build`.
- [x] 5.3 Run strict OpenSpec validation and record final task completion.
