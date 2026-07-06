## 1. Exploration and Ownership Map

- [ ] 1.1 Trace Review feedback through `update-state` and identify Browser/projection side effects.
- [ ] 1.2 Map current Browser queue projection warmup/repair owners.
- [ ] 1.3 Define SessionQueueIndex and BrowserProjectionIndex Interface responsibilities.

## 2. Tests and Diagnostics

- [ ] 2.1 Add diagnostics test separating `session-queue`, `browser-projection`, `projection-repair`, and `storage` timing.
- [ ] 2.2 Add Review test proving post-feedback next card does not require Browser projection warmup.
- [ ] 2.3 Add Browser test proving projection-backed Browser reads still fail closed when projection owner unavailable.

## 3. Implementation

- [ ] 3.1 Introduce SessionQueueIndex naming around worker Review session frontier/lookahead.
- [ ] 3.2 Introduce BrowserProjectionIndex naming around Browser queue/read-model projection access.
- [ ] 3.3 Move Browser projection repair/warmup scheduling out of blocking Review `update-state`.
- [ ] 3.4 Keep explicit handoff from projection snapshot to session queue at session start.

## 4. Docs and Validation

- [ ] 4.1 Update `CONTEXT.md` with SessionQueueIndex and BrowserProjectionIndex terms.
- [ ] 4.2 Update `ARCHITECTURE.md` Review/Browser flow diagrams.
- [ ] 4.3 Update `docs/DDD_RESCAN_BACKLOG.md`.
- [ ] 4.4 Run focused Review and Browser projection tests.
- [ ] 4.5 Run `pnpm run check:boundaries`.
- [ ] 4.6 Run `pnpm build`.
- [ ] 4.7 Run `openspec validate split-session-queue-from-browser-projection --strict`.
