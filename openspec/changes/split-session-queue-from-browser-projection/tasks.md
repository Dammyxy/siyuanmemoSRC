## 1. Exploration and Ownership Map

- [x] 1.1 Trace Review feedback through `update-state` and identify Browser/projection side effects.
- [x] 1.2 Map current Browser queue projection warmup/repair owners.
- [x] 1.3 Define SessionQueueIndex and BrowserProjectionIndex Interface responsibilities.

## 2. Tests and Diagnostics

- [x] 2.1 Add diagnostics test separating `session-queue`, `browser-projection`, `projection-repair`, and `storage` timing.
- [x] 2.2 Add Review test proving post-feedback next card does not require Browser projection warmup.
- [x] 2.3 Add Browser test proving projection-backed Browser reads still fail closed when projection owner unavailable.

## 3. Implementation

- [x] 3.1 Introduce SessionQueueIndex naming around worker Review session frontier/lookahead.
- [x] 3.2 Introduce BrowserProjectionIndex naming around Browser queue/read-model projection access.
- [x] 3.3 Move Browser projection repair/warmup scheduling out of blocking Review `update-state`.
- [x] 3.4 Keep explicit handoff from projection snapshot to session queue at session start.

## 4. Docs and Validation

- [x] 4.1 Update `CONTEXT.md` with SessionQueueIndex and BrowserProjectionIndex terms.
- [x] 4.2 Update `ARCHITECTURE.md` Review/Browser flow diagrams.
- [x] 4.3 Update `docs/DDD_RESCAN_BACKLOG.md`.
- [x] 4.4 Run focused Review and Browser projection tests.
- [x] 4.5 Run `pnpm run check:boundaries`.
- [x] 4.6 Run `pnpm build`.
- [x] 4.7 Run `openspec validate split-session-queue-from-browser-projection --strict`.
