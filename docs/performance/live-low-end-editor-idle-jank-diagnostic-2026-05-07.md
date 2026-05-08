# Low-End Editor Idle Jank Diagnostic

Date: 2026-05-07
OpenSpec change: `diagnose-low-end-editor-idle-jank`
Scope: ordinary SiYuan editor browsing/editing after SiYuanMemo is enabled, not SRS Browser first-row optimization.

## Root-Cause Gate

No AutoCard, Riff sync, KernelTransactionIngestHandler, KernelTransactionActionPump, writer relay, backend worker, Browser, or source-refresh production behavior may change for ordinary editor jank until the evidence matrix shows:

- matching plugin-off and plugin-on rows for the same action/data/profile;
- low-end reproduction, not only high-memory developer-machine smoke;
- renderer/input/scroll/heap jank in the plugin-on row above threshold;
- a same-timeline plugin span overlap owner, or a clear `SiYuan baseline/system/unknown` classification.

## Active Editor Path Under Investigation

```text
SiYuan editor transaction
  -> ws-main eventBus
  -> TransactionWebSocketService
  -> KernelTransactionIngestHandler
  -> backend worker transaction inbox/dequeue
  -> KernelTransactionActionPump
  -> AutoCardHandler / native Riff sync / writer relay
  -> renderer long task, input delay, scroll gap, heap/GC pressure
```

Browser is a variable in this diagnostic, not the primary target:

- `closed`: SRS Browser never opened or explicitly closed.
- `opened-once-then-closed`: Browser opened once so any residue can be measured after close.
- `open`: Browser remains open while ordinary editor work runs.

## Smoke Tool

Added script:

```powershell
node scripts/live-low-end-editor-smoke.cjs --self-check
node scripts/live-low-end-editor-smoke.cjs --label editor-on-closed-4x --plugin-state on --browser-state closed --cpu-rate 4 --profile-name developer-4x --actions plain-typing,marker-typing,continuous-scroll,large-doc-open,switch-documents,search,api-transaction-storm
```

The script reads the local SiYuan API token only for API calls and does not print it. Output is sanitized by `scripts/live-low-end-editor-smoke-utils.cjs`:

- masks document/block ids;
- redacts token, body, content, kramdown, markdown, prompt, answer, card content, and similar fields;
- reports counts/timings/non-content metadata only;
- removes temporary documents when possible.

Smoke utility tests cover privacy masking, threshold classification, overlap ownership, duplicate-event collapse, timed input-delay ownership, and multi-window span grouping:

```powershell
pnpm vitest run scripts/__tests__/live-low-end-editor-smoke-utils.test.ts
```

## Required Matrix

| Profile | Plugin | Browser state | CPU | VM cores / memory | Required status |
|---|---|---|---:|---|---|
| Developer baseline | off | closed | 1x | host | required |
| Developer baseline | on | closed | 1x | host | required |
| CPU simulated | off | closed | 4x | host | required |
| CPU simulated | on | closed | 4x | host | required |
| CPU simulated | off | closed | 6x | host | required |
| CPU simulated | on | closed | 6x | host | required |
| Browser residue | on | opened-once-then-closed | 1x/4x/6x | host | required |
| Browser open pressure | on | open | 1x/4x/6x | host | required |
| Low-memory VM | off/on | closed | 1x or host throttle | 2 core / 4GB | required or explicit blocker |
| Low-memory VM | off/on | closed | 1x or host throttle | 2 core / 8GB | required or explicit blocker |

## Required Editor Actions

| Action | Purpose |
|---|---|
| `plain-typing` | ordinary typing without intentional AutoCard marker |
| `marker-typing` | marker-heavy `>>` path without assuming AutoCard is root cause |
| `continuous-scroll` | browse note content and measure scroll frame gaps |
| `large-doc-open` | open/render large document |
| `switch-documents` | repeated document activation |
| `search` | editor/local search input latency |
| `idle-then-edit` | background idle pressure, then resume typing |
| `api-transaction-storm` | external transaction burst through SiYuan API |

## Thresholds

| Metric | Green | Yellow | Red |
|---|---:|---:|---:|
| input delay p95 | `<= 50 ms` | `> 50 ms` | `> 100 ms` |
| input delay max | `<= 100 ms` | `> 100 ms` | `> 250 ms` |
| scroll frame gap p95 | `<= 50 ms` | `> 50 ms` | `> 100 ms` |
| renderer longtask max | `<= 100 ms` | `> 100 ms` | `> 250 ms` |
| total blocking estimate per phase | `<= 150 ms` | `> 150 ms` | `> 500 ms` |
| heap usage ratio | `<= 70%` | `> 70%` | `> 85%` |
| plugin-on delta over plugin-off | `<= 20%` | `> 20%` | `> 50%` |

## Overlap Owner Classification

Red/yellow phases must classify the nearest overlapping owner:

- `AutoCard`
- `Riff sync`
- `KernelTransactionIngestHandler`
- `KernelTransactionActionPump`
- `writer relay`
- `backend worker`
- `Browser residue`
- `TransactionWebSocketService`
- `SiYuan baseline/system/unknown`

Slow async spans alone are not enough. The phase must show renderer/input/scroll/heap evidence and timing overlap before assigning SiYuanMemo root cause.

The classifier keeps both:

- `owner`: dominant overlapping plugin owner by overlapping span duration;
- `firstOwner`: earliest overlapping owner, useful for timing order but not enough by itself to name root cause.

## Preliminary Live Evidence

These rows were captured on the high-memory developer machine only. They validate that the smoke tooling can observe editor input delay, renderer longtasks, plugin runtime spans, Browser state, and privacy-safe metadata. They do not satisfy the root-cause gate because matching plugin-off rows, low-memory VM rows, full editor actions, and repeats are still missing.

| Label | Plugin | Browser | CPU | Action | Risk | Key metrics | Dominant overlap | Interpretation |
|---|---|---|---:|---|---|---|---|---|
| `editor-on-closed-plain-typing-1x-post-dedupe` | on | closed | 1x | plain typing | green | longtask max `0 ms`, TBT `0 ms`, input p95 `11.1 ms`, input max `14.4 ms` | none | No editor jank reproduced in this row. |
| `editor-on-closed-plain-typing-4x-post-dedupe` | on | closed | 4x | plain typing | green | longtask max `94 ms`, TBT `44 ms`, input p95 `36.4 ms`, input max `63.3 ms` | writer relay span overlapped a non-red/non-yellow window | Below threshold; not actionable. |
| `editor-on-closed-plain-typing-6x-timed-input` | on | closed | 6x | plain typing | red | longtask max `2901 ms`, TBT `10354 ms`, input p95 `384.5 ms`, input max `2925.8 ms` | writer relay `kernel.transaction.ingest` submit/wait around `5688 ms` plus short `ws-main` spans | Preliminary suspicious row only. Needs plugin-off 6x, repeat, final-tool rerun, and VM confirmation before any production fix. |

Discarded evidence:

- A previous parallel 4x/6x live run was discarded because CDP CPU throttling is renderer-global; parallel rows contaminate each other.
- `editor-on-closed-plain-typing-6x-final-tooling` timed out after `184 s` and was excluded. CPU throttle was manually reset to `1x` through CDP afterward. Treat the timeout as a tooling/runtime stress signal, not as root-cause proof.

## Current Evidence Gaps

- No plugin-off baseline has been captured for this new editor-focused matrix yet.
- No 2 core / 4GB VM row has been captured yet.
- No 2 core / 8GB VM row has been captured yet.
- No full 4x/6x ordinary editor action matrix has been captured yet; only plugin-on Browser-closed plain-typing sanity rows exist.
- Browser `opened-once-then-closed` ordinary editor residue still needs capture.
- Browser-open ordinary editor pressure still needs capture.
- Red/yellow rows need repeat runs before distinguishing a reproducible low-end problem from noise or one bad renderer state.
- Existing earlier reports remain useful context, but they cannot close this change because they mixed Browser-first work with editor smoke and did not include low-memory VM profiles.

## 2026-05-08 Update: Visible Renderer And Writer Lease Evidence

The smoke tool now activates the main SiYuan renderer before editor phases and records `rendererStateBefore` / `rendererStateAfter`. Hidden-renderer runs are no longer accepted as ordinary editor evidence by default because the live app can report `document.visibilityState = hidden` while CDP still dispatches input. Those hidden rows can create follower-mode writer relay errors that do not represent normal visible editor use.

Live check after activation:

- Before activation: `visibilityState=hidden`, `hasFocus=true`.
- After activation: `visibilityState=visible`, `hasFocus=true`.
- After the TTL fix, `writer.getLease` reported `expiresAt - lastHeartbeatAt` near `60000 ms`, confirming the frontend runtime default is restored.

### Confirmed Bug Fixed

Root cause found in `ApplicationContext.resolveKernelWriterLeaseTtlMs()`:

- Missing env read returned `''`.
- `Number('')` returned `0`.
- The resolver clamped `0` to the 3s minimum and passed that value to `FrontendInstanceRuntime`.
- Under 6x CPU or hidden/background timer throttling, the 2s heartbeat could miss the 3s lease window, leaving the editor runtime in follower/no-lease state and causing writer relay errors.

Fix:

- missing/blank `VITE_SIYUANMEMO_KERNEL_WRITER_LEASE_TTL_MS` now returns `undefined`;
- `FrontendInstanceRuntime` keeps its 60s default;
- explicit numeric TTL overrides still work.

Regression evidence:

- Before fix: `ApplicationContext.writer-relay.test.ts` failed with `expected 3000 to be undefined`.
- After fix: `ApplicationContext.writer-relay.test.ts` passed.

### Visible 6x Rows Captured

These rows are CPU-simulated on the high-memory developer machine. They do not replace the required 2 core / 4GB and 2 core / 8GB VM rows.

| Label | Plugin | Action | CPU | Renderer | Risk | Key metrics | Dominant overlap | Interpretation |
|---|---|---|---:|---|---|---|---|---|
| `editor-off-visible-closed-marker-typing-6x-repeat2` | off | marker typing | 6x | visible | red/red | rep1 longtask max `2340 ms`, TBT `6871 ms`, input max `282 ms`; rep2 longtask max `1443 ms`, TBT `2620 ms` | none | Marker typing is red without SiYuanMemo. Do not infer AutoCard root cause from marker text alone. |
| `editor-on-visible-closed-marker-typing-6x-repeat2` | on | marker typing | 6x | visible | red/red | rep1 longtask max `2608 ms`; rep2 longtask max `1228 ms` | startup hydrate / writer relay error before TTL fix | Plugin-on added overlap, but first row was startup-contaminated and second row still had 3s TTL relay error. |
| `editor-on-visible-closed-marker-typing-6x-repeat2-post-ttl-fix` | on | marker typing | 6x | visible | red/red | rep1 longtask max `4946 ms`; rep2 longtask max `4531 ms` | writer relay drained, empty action pump, AutoCard read in marker row | TTL error path fixed, but marker rows still show empty polling and AutoCard read candidates. |
| `editor-off-visible-closed-plain-typing-6x-repeat2-post-tooling` | off | plain typing | 6x | visible | red/red | rep1 longtask max `1057 ms`, input max `739.2 ms`; rep2 longtask max `1429 ms`, input max `1111.1 ms` | none | Plain typing is also red under this aggressive 6x profile without SiYuanMemo, so off/on deltas matter more than absolute red. |
| `editor-on-visible-closed-plain-typing-6x-repeat2-post-ttl-fix` | on | plain typing | 6x | visible | red/red | rep1 longtask max `6874 ms`; rep2 longtask max `896 ms`, input max `1013.6 ms` | writer relay reconnect drain / empty action-pump dequeue-local | Remaining ordinary-editor SiYuanMemo candidate is no-work writer relay/action-pump polling, not Browser and not AutoCard. |

### Current Root-Cause Classification

Confirmed fixed:

- Writer lease TTL default parser: missing env forced 3s TTL and caused low-end writer/follower churn.

Strong remaining candidates:

- Empty writer relay watchdog: `writer.take-command` / `writer.drain-pending-commands` can overlap editor stalls even when `commandCount=0`.
- Empty `KernelTransactionActionPump` polling: `kernel-action-pump.dequeue-local` / `poll-once` can overlap editor stalls with `actionCount=0`.

Marker-only candidate:

- AutoCard block reads: post-TTL marker row showed `autocard.siyuan.get-block-kramdown` and `host-block-query.get-block` overlap, but marker typing is already red with the plugin disabled. AutoCard should stay gated until empty polling is fixed or excluded.

Not supported as the first editor-jank target:

- SRS Browser AG Grid: Browser was closed in these rows.
- Native Riff sync: no dominant native-riff overlap in the visible plain-typing rows.
- Backend worker writes: no dominant worker-owned span in the visible plain-typing rows.

### Focused Follow-Up Change

Created and validated:

```powershell
openspec validate stabilize-editor-writer-lease-and-empty-poll-jank --strict
```

Change path:

```text
openspec/changes/stabilize-editor-writer-lease-and-empty-poll-jank/
```

The follow-up change is scoped to writer lease TTL stability, visible-renderer smoke gating, empty writer relay polling, and empty kernel action-pump polling. It deliberately keeps AutoCard/Riff/Browser production behavior behind evidence gates.

## 2026-05-08 Update: Empty-Poll Fix Implemented

Focused fix in `stabilize-editor-writer-lease-and-empty-poll-jank`:

- `KernelTransactionActionPump` now backs off repeated empty `kernel.transaction.dequeue` polls when there is no pending AutoCard/native-Riff follow-up.
- Successful local `KernelTransactionIngestHandler` ingest and relayed `kernel.transaction.ingest` now wake the action pump when it is not already in an empty-poll backoff window; if the last polls were empty, the wake is bounded by the existing backoff instead of immediately resetting it.
- `FrontendInstanceRuntime` now backs off empty writer relay watchdog drains when RPC push relay is open and `writer.takeCommand` returns no command.
- Push command wake, reconnect drain, pending command continuation, writer relay unavailable/error, and follower/lease failure semantics remain explicit and unchanged.

Automated evidence:

```powershell
pnpm vitest run src/application/handlers/__tests__/KernelTransactionActionPump.test.ts src/application/handlers/__tests__/KernelTransactionIngestHandler.test.ts --reporter=dot
pnpm vitest run src/application/clients/__tests__/FrontendInstanceRuntime.test.ts --reporter=dot
pnpm vitest run src/application/__tests__/ApplicationContext.writer-relay.test.ts --reporter=dot
```

Environment note:

- One combined Vitest run initially failed with `ENOSPC: no space left on device` because the C drive had `0` bytes free and Vitest could not write transform cache.
- Cleared the reproducible `C:\Users\Dammy\AppData\Local\npm-cache` cache, freeing about `6.36 GB`; the affected test then passed.

### Post-Empty-Poll Live 6x Rows

Important tooling correction:

- The first post-empty-poll off row was discarded because `--plugin-state off` was only written into the report and did not actually toggle the plugin.
- `scripts/live-low-end-editor-smoke.cjs` now calls `/api/petal/setPetalEnabled` before measuring and waits through CDP until the renderer plugin loaded state matches the requested `on`/`off` state.
- The clean plugin-off row below shows `pluginPreparation.renderer.loaded=false`, `hasTopbar=false`, and `pluginEventCount=0` for all phases.

Files:

- `docs/performance/live-low-end-editor-smoke-post-empty-poll-plugin-off-6x-2026-05-08.json`
- `docs/performance/live-low-end-editor-smoke-post-bounded-wake-plugin-on-6x-2026-05-08.json`

| Label | Plugin | Action | Repeat | Risk | Key metrics | Dominant overlap | Interpretation |
|---|---|---|---:|---|---|---|---|
| `post-empty-poll-off-visible-closed-plain-marker-6x` | off | plain typing | 1 | red | longtask max `308 ms`, TBT `707 ms`, input max `0 ms`, plugin events `0` | SiYuan baseline/system/unknown | Clean off baseline is still red under 6x. |
| `post-empty-poll-off-visible-closed-plain-marker-6x` | off | marker typing | 1 | red | longtask max `928 ms`, TBT `1634 ms`, plugin events `0` | SiYuan baseline/system/unknown | Marker typing red without SiYuanMemo. |
| `post-empty-poll-off-visible-closed-plain-marker-6x` | off | plain typing | 2 | red | longtask max `934 ms`, TBT `1800 ms`, plugin events `0` | SiYuan baseline/system/unknown | Clean off baseline remains red. |
| `post-empty-poll-off-visible-closed-plain-marker-6x` | off | marker typing | 2 | red | longtask max `952 ms`, TBT `1154 ms`, plugin events `0` | SiYuan baseline/system/unknown | Clean off baseline remains red. |
| `post-bounded-wake-on-visible-closed-plain-marker-6x` | on | plain typing | 1 | red | longtask max `1800 ms`, TBT `2150 ms`, plugin events `0` | SiYuan baseline/system/unknown | No same-phase plugin owner; treat as baseline/startup noise, not SiYuanMemo root cause. |
| `post-bounded-wake-on-visible-closed-plain-marker-6x` | on | marker typing | 1 | red | longtask max `3580 ms`, TBT `4027 ms`, plugin events `29` | writer relay | Marker row still overlaps `kernel.transaction.ingest` relay and empty action-pump dequeue; not AutoCard read-dominant. |
| `post-bounded-wake-on-visible-closed-plain-marker-6x` | on | plain typing | 2 | red/yellow edge | longtask max `104 ms`, TBT `182 ms`, plugin events `3` | KernelTransactionActionPump | Plain repeat improved versus plugin-off absolute red; one empty action-pump poll remains visible but much smaller. |
| `post-bounded-wake-on-visible-closed-plain-marker-6x` | on | marker typing | 2 | red | longtask max `2748 ms`, TBT `2795 ms`, plugin events `23` | writer relay | Remaining repeated marker owner is writer relay `kernel.transaction.dequeue/ingest`, not AutoCard reads. |

Current classification after this fix:

- Ordinary plain typing: still red in clean plugin-off rows; SiYuanMemo plugin-on repeat 2 is much smaller than off repeat 2 on longtask/TBT, so do not claim plain typing root cause is solved only by plugin code.
- Marker typing: still has SiYuanMemo-owned overlap, but the owner is writer relay / kernel transaction dequeue-ingest under marker transactions, not SRS Browser and not AutoCard kramdown/attrs reads in this run.
- Action-pump empty interval pressure is reduced, but transaction-driven marker bursts can still create relay/action-pump work. That should be a new focused follow-up if it repeats in VM rows.

### UI Framework / Bundle Weight Hypothesis

The "heavy UI framework" hypothesis is plausible for startup/load and memory pressure, but it is not the strongest current explanation for ordinary editor jank.

Current bundle evidence:

- Live `index.js`: about `6.08 MB`.
- Live `index.css`: about `245 KB`.
- The plugin bundles Vue 3, AG Grid (`ag-grid-community` / `ag-grid-vue3`), sql.js, review/browser/AI surfaces, and no Vite manual chunks; only `siyuan`, `process`, and `electron` are externalized.

Interpretation:

- This can explain slower plugin enable, initial parse/compile, and higher idle heap on low-end machines.
- It does not by itself explain repeated editor stalls after the plugin is already loaded.
- The live visible 6x evidence names runtime overlap first: fixed 3s writer lease TTL, empty writer relay watchdog, empty kernel action-pump polling, and marker-only AutoCard reads.

Next evidence needed before treating bundle weight as root cause:

- plugin off/on startup trace with `plugin.onload`, first idle, heap after 60s, JS parse/compile where available;
- current branch vs a pre-kernel/frontend-only build or release;
- 2 core / 4GB and 2 core / 8GB VM rows for ordinary editor closed-Browser editing;
- bundle analyzer or Rollup visualizer to split Vue/AG Grid/sql.js/AI/review/browser contribution.

### VM Rows Blocker

The OpenSpec VM rows are not replaced by host 6x CPU throttle.

Current blocker on this machine:

- Hyper-V PowerShell module exists (`Get-VM` is available).
- Listing VMs fails with an authorization error: the current process does not have permission to query Hyper-V on `DESKTOP-H787BUC`.
- VirtualBox (`VBoxManage`) and QEMU (`qemu-system-x86_64`) are not available in PATH.
- Therefore no 2 core / 4GB or 2 core / 8GB SiYuan VM can be launched or verified from this session.

Required next run:

- Use an already provisioned Windows VM with SiYuan + SiYuanMemo, or rerun Codex/PowerShell with permission to control Hyper-V.
- Capture plugin off/on, Browser closed, plain typing and marker typing at 2 core / 4GB and 2 core / 8GB.
- Keep those rows separate from host 4x/6x CPU throttle rows.
