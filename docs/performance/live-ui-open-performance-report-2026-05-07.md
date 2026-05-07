# SiYuanMemo Live UI Open Performance Report

Date: 2026-05-07
Environment: SiYuan Desktop v3.6.5 on Windows, live Electron renderer via CDP `127.0.0.1:9222`
Workspace: `H:/SiYuanXY`
Plugin branch: `feat/kernel-companion-p0`
Scope: SRS Browser open/render/hydrate, source existence sweep, bulk block reads, idle baseline

## Executive Summary

Real UI stutter is confirmed for SRS Browser open/render. The slow path is not core SQLite, review commit, preview grading, private status, or AutoCard listener reliability.

The strongest evidence points to renderer-side work shortly after opening:

- Cold SRS Browser open reached first visible rows in about 2808 ms, with a renderer long task max of 967 ms.
- Warm opens reached first visible rows in 253-519 ms, but still produced repeated renderer long tasks over 50 ms.
- The repeated warm-open cost clusters around `browser.snapshot.all-rows`, `browser.snapshot.queryable.hydrate-chunk`, row mapping, and AG Grid/render commit.
- Current-page `source-existence.refresh-page-cards` is synchronous in the first page path and reached 134.7-158.2 ms in warm runs. It is not the largest observed cost, but it is a first-page blocking risk.
- Background source sweep had zero candidates in the live profile and cost about 68-92 ms, so it was not the main live bottleneck in this data set.
- Bulk SQL content reads are fast; 500 blocks were about 10-12 ms through SiYuan SQL.
- Serial `getBlockKramdown` across 500 blocks took about 1399 ms wall time. If this is ever awaited before UI is interactive, it is a red-line risk.

## Evidence Table

| Phase | Count | p50 | p95 | Max | Main-thread blocking | UI blocking | Risk |
|---|---:|---:|---:|---:|---|---|---|
| Cold open to first rows | 1 | n/a | n/a | 2808 ms | yes, long task max 967 ms | yes | red |
| Warm open to first rows | 3 | 278 ms | n/a | 519 ms | yes, long task max 161 ms | yes | yellow |
| `browser.grid.get-rows` warm | 3 | 81.8 ms | n/a | 152.3 ms | partial | yes | yellow |
| `browser.grid.fetch-rows` warm | 3 | 43.1 ms | n/a | 76.1 ms | partial | yes | yellow |
| `browser.grid.success-callback` warm | 3 | 39.6 ms | n/a | 76.1 ms | yes | yes | yellow |
| `browser.grid.datasource-ui-update` warm | 3 | 0.2 ms | n/a | 0.3 ms | yes | yes | green |
| `source-existence.refresh-page-cards` warm | 3 | 25.1-134.7 ms | n/a | 158.2 ms | host/relay awaited | yes | yellow |
| `source-existence.background-sweep` warm | 3 | 80.9 ms | n/a | 92.6 ms | background, competes | no | yellow |
| `browser.snapshot.queryable.hydrate-chunk` warm | 3 | 234.1 ms | n/a | 245.4 ms | yes/renderer adjacent | after first page | yellow |
| `browser.snapshot.all-rows` warm | 3 | 237.9 ms | n/a | 269.8 ms | yes/renderer adjacent | after first page | yellow |
| Idle with plugin enabled | 60 s | no long task | n/a | relay 47.8 ms | no renderer long task | no | green |
| SQL batch content | 500 blocks | 10.5 ms | 11.5 ms | 11.5 ms | no | no | green |
| `getBlockKramdown` concurrent 8 | 500 blocks | 11.7 ms/request | 24.6 ms/request | 49.0 ms/request, 829.5 ms wall | request wall time | only if awaited | yellow |
| `getBlockAttrs` concurrent 8 | 500 blocks | 10.2 ms/request | 15.6 ms/request | 20.4 ms/request, 657.3 ms wall | request wall time | only if awaited | yellow |
| `getBlockKramdown` serial | 500 blocks | 2.4 ms/request | 5.3 ms/request | 9.9 ms/request, 1398.7 ms wall | request wall time | red if awaited | red |

## Live Measurements

### Cold Open

- Dialog shell attached: 2668 ms
- First rows visible: 2808 ms
- Settled window: 5160 ms
- Rendered grid rows: 26
- Renderer long tasks: 7
- Renderer long task max: 967 ms
- Notable slow events:
  - `browser.snapshot.all-rows`: 1462.5 ms, rowCount 246
  - `browser.snapshot.queryable.hydrate-chunk`: 835.5 ms, chunkSize 246
  - `relay.ensure-writable.source-existence-sweep`: 957.7 ms during reconnect drain
  - `source-existence.background-sweep`: 619.3 ms, candidates 0

Interpretation: cold open included reconnect/relay drain noise plus all-rows snapshot hydrate. This confirms the red symptom, but warm reopen is the cleaner steady-state signal.

### Warm Open 1

- Shell attached: 385 ms
- First rows visible: 519 ms
- Renderer long tasks: 5 unique observations, duplicated by observers in raw capture
- Renderer long task max: 161 ms
- `browser.grid.get-rows`: 152.3 ms
- `source-existence.refresh-page-cards`: max 134.7 ms
- `browser.snapshot.queryable.hydrate-chunk`: 245.4 ms
- `browser.snapshot.all-rows`: 269.8 ms

### Warm Open 2

- Shell attached: 259 ms
- First rows visible: 278 ms
- Renderer long task max: 147 ms
- `browser.grid.get-rows`: 81.8 ms
- `source-existence.refresh-page-cards`: max 158.2 ms
- `browser.snapshot.queryable.hydrate-chunk`: 234.1 ms
- `browser.snapshot.all-rows`: 237.9 ms

### Warm Open 3

- Shell attached: 247 ms
- First rows visible: 253 ms
- Renderer long task max: 156 ms
- `browser.grid.get-rows`: 67.8 ms
- `source-existence.refresh-page-cards`: max 10.8 ms in this run
- `browser.snapshot.queryable.hydrate-chunk`: 149.5 ms
- `browser.snapshot.all-rows`: 159.8 ms
- `browser.deck-rows-by-ids.map-browser-rows`: 109.7 ms

### Plugin-Enabled Idle

Duration: 60 seconds

- Renderer long tasks: 0
- `daily-editing.kernel-action-pump.poll-once`: p50 0.5 ms, p95 1.1 ms, max 3.8 ms
- `daily-editing.ws-main.message`: max 0 ms in recorded events
- `relay.writer.drain-pending-commands`: p95 32.2 ms, max 47.8 ms

Interpretation: in idle, the plugin did not produce renderer long tasks on this machine. User-reported editing stutter likely requires active typing, transaction bursts, lower-end CPU/memory, or specific AutoCard/content-reading paths.

## Source Missing And Sweep

Real DB source state before stale sweep:

- cards: 459
- `source_checked_at IS NULL`: 0
- stale over 24h: 19
- missing: 213

Private stale sweep with 24h TTL:

- limit 50: wall 260.7 ms, checked 19, updated 19, changed true, changedToMissing false
- later limit 200/500: checked 0 after stale entries had been refreshed

Default private sweep without `staleBefore`:

- checked 0 because unknown candidates were 0
- wall about 254-259 ms, dominated by private command relay/poll overhead

Interpretation: in the tested data set, sweep itself is not the biggest browser-open cost. The synchronous current-page refresh remains worth moving off the first-page path, but the stronger repeated signal is snapshot/hydrate.

## Bulk Block Read Results

SiYuan SQL batch content:

- 50 blocks: p50 4.1 ms, p95 8.7 ms
- 200 blocks: p50 4.8 ms, p95 10.6 ms
- 500 blocks: p50 10.5 ms, p95 11.5 ms

`getBlockKramdown`, concurrency 8:

- 50 blocks: wall 131.8 ms, request p95 41.7 ms
- 200 blocks: wall 379.9 ms, request p95 24.0 ms
- 500 blocks: wall 829.5 ms, request p95 24.6 ms

`getBlockAttrs`, concurrency 8:

- 50 blocks: wall 63.9 ms, request p95 13.5 ms
- 200 blocks: wall 272.0 ms, request p95 16.0 ms
- 500 blocks: wall 657.3 ms, request p95 15.6 ms

`getBlockKramdown`, serial:

- 50 blocks: wall 163.4 ms
- 200 blocks: wall 643.8 ms
- 500 blocks: wall 1398.7 ms

Interpretation: bulk content should use SQL batch whenever possible. Kramdown/attrs must be limited, cached, cancellable, and kept out of browser first-paint.

## Risk Markers

- Red: cold SRS Browser first rows exceeded 1000 ms.
- Red: serial 500-block kramdown exceeded 1000 ms wall time.
- Yellow: warm opens produced renderer long tasks over 50 ms.
- Yellow: allRows snapshot/hydrate repeatedly exceeded 150-250 ms.
- Yellow: current-page source refresh can block first-page fetch and reached 158.2 ms.
- Yellow: realistic `>>` editing produced renderer long tasks, max 1488 ms.
- Yellow: CPU 4x throttled ordinary typing produced renderer long tasks over 50 ms, max 64 ms.
- Green: SQLite/browser SQL profile is fast.
- Green: plugin-enabled idle for 60 seconds produced no renderer long task in this run.

## Real Editing Follow-up

Date: 2026-05-07
Method: live Electron CDP plus temporary SiYuan documents, then `/api/filetree/removeDocByID` cleanup. The temporary doc files were removed and the SQL index cleared after a short delay. `requestAnimationFrame` latency was captured but not used as evidence because the Electron/CDP page showed about 1 second rAF throttling behavior during automation.

| Phase | Count | p50 | p95 | Max | Main-thread blocking | UI blocking | Risk |
|---|---:|---:|---:|---:|---|---|---|
| Realistic ordinary typing | 93 keydowns | renderer longtask 0 | renderer longtask 0 | renderer longtask 0 | no observed long task | no | green |
| Realistic ordinary typing relay drain | 15 writer events | writer handler 0.4 ms | writer take 78 ms | writer drain 95.8 ms | mostly writer/relay async | possible low-end pressure | yellow |
| Realistic `>>` typing | 5 symbol lines | longtask 111 ms | n/a | longtask 1488 ms | yes | yes | red |
| Realistic `>>` AutoCard async spans | 5 candidates | settle 948 ms | process 6694 ms | create-from-blocks 7214.9 ms | mostly async/backend span, but overlaps long task | yes when work lands in renderer | red |
| CPU 4x ordinary typing | 148 keydowns | longtask 57 ms | 64 ms | 64 ms | yes | yes on low-end | yellow |
| CPU 4x `>>` typing | 3 symbol lines | longtask 95 ms | 272 ms | 272 ms | yes | yes on low-end | yellow |
| API transaction storm | 10 appends | longtask 0 | longtask 0 | longtask 0 | no observed long task | no direct UI block | green/yellow backlog |

### Ordinary Typing

Plain typing on the live machine did not reproduce a renderer long task:

- keydown/input events: 93/93
- renderer long tasks: 0
- `daily-editing.ws-main.message`: p50 0 ms, p95 0.5 ms, max 0.5 ms
- transaction dispatch: p50 0.1 ms, max 0.1 ms
- `daily-editing.kernel-action-pump.poll-once`: p50 0.8 ms, p95/max 62 ms
- slowest relay spans were `writer.drain-pending-commands` around 89-95.8 ms, but no renderer long task was observed.

Interpretation: with normal typing and no symbol trigger, the UI-side websocket transaction listener is not the primary stutter source on this machine. It is cheap per message. The relay/action pump can still create yellow background pressure.

### Symbol Typing

Typing five lines containing `>>` did reproduce renderer blocking:

- keydown/input events: 95/90
- renderer long tasks: count 2, p50 111 ms, max 1488 ms
- `autocard.siyuan.get-block-kramdown`: p50 28.9 ms, max 29.8 ms
- `autocard.siyuan.get-block-attrs`: p50 39.4 ms, max 43.8 ms
- `daily-editing.kernel-action-pump.native-riff-upsert`: p50 1688.7 ms, max 2943.8 ms
- slowest async spans:
  - `autocard.xiuyuan.create-from-blocks`: 7214.9 ms
  - `autocard.candidate.process-settled`: max 6694.1 ms
  - `autocard.check-quick-symbols`: max 6693.2 ms
  - `autocard.execute.backend-worker`: about 6415-6427.8 ms

Interpretation: the user-visible editing stutter is reproducible around AutoCard symbol handling and creation, not around plain transaction dispatch. Some long spans are async wait time rather than continuous main-thread blocking, but the simultaneous renderer long task confirms visible UI jank can occur.

### Lower-End CPU Simulation

With CDP CPU throttling set to 4x, ordinary typing became yellow:

- keydown/input events: 148/148
- renderer long tasks: observer count 4, runtime count 2, p50 57 ms, max 64 ms
- `daily-editing.ws-main.message`: p95 3.8 ms, max 3.8 ms
- transaction dispatch: p95 1.4 ms
- `autocard.candidate.process-settled`: one run at 151.2 ms even without `>>`
- slowest relay span: `writer.drain-pending-commands` 7888.8 ms with `WriterRelayDrainError`

With 4x CPU throttling and `>>` typing:

- renderer long tasks: count 11, p50 95 ms, p95 272 ms, max 272 ms
- relay waits reached 9075 ms
- transaction dispatch stayed cheap, p95 1.6 ms

Interpretation: low-end machines can feel stutter during editing even when transaction dispatch itself is cheap. The likely amplification path is background relay/action-pump work plus AutoCard candidate processing sharing the renderer event loop.

### API Transaction Storm

Ten serial API block appends produced no renderer long task, but did create backlog-like async spans:

- append wall time: 16783 ms for 10 appends
- renderer long tasks: 0
- `daily-editing.ws-main.message`: p95 0.6 ms
- `autocard.siyuan.get-block-kramdown`: p95 12 ms
- `autocard.siyuan.get-block-attrs`: p95 36.1 ms
- `autocard.candidate.process-settled`: p95/max 1068.7 ms
- `relay.submit-and-wait`: p95 913.4 ms, max 967.2 ms

Interpretation: transaction storms alone did not block the renderer in this run, but they can queue AutoCard and relay work. On slower machines that backlog can coincide with typing and show up as visible jank.

## Daily Editing And Browser Surface Sweep

Date: 2026-05-07 15:13 CST
Method: live Electron CDP plus temporary SiYuan documents and API-triggered document/attribute mutations. Temporary docs cleanup verified: remaining test docs 0.

| Phase | Count | p50 | p95 | Max | Main-thread blocking | UI blocking | Risk |
|---|---:|---:|---:|---:|---|---|---|
| Ordinary UI typing, temp doc | 7 ws messages / 10 pump polls | longtask 0 | longtask 0 | longtask 0 | no observed long task | no | green |
| Ordinary UI typing relay drain | 21 drain spans | 14.6 ms | 44 ms | 1296.8 ms async span | no renderer long task | possible background wait only | yellow |
| Native Riff attr upsert | 1 upsert | 1888.3 ms | 1888.3 ms | 1888.3 ms | no observed long task | no direct block in this run | yellow |
| Doc tree create/remove | 4 docs create + remove | longtask 0 | longtask 0 | longtask 0 | no observed long task | no | green |
| Browser search then clear | 2 load cycles | longtask 73 ms | 126 ms | 127 ms | yes | yes | yellow |
| Browser force refresh | 1 refresh | longtask 78 ms | 85 ms | 85 ms | yes | yes | yellow |
| Browser header sort | 1 header click | longtask 0 | longtask 0 | longtask 0 | inconclusive | no measured reload | inconclusive |

### Live Surface Details

Ordinary UI typing again did not reproduce a renderer long task:

- renderer long tasks: 0
- `daily-editing.ws-main.message`: p95 0.5 ms
- `daily-editing.kernel-action-pump.poll-once`: p95 16.1 ms
- `relay.writer.drain-pending-commands`: p95 44 ms, max 1296.8 ms async span

Interpretation: plain typing still looks cheap on this machine. The relay outlier did not coincide with a renderer long task, so it is background pressure rather than confirmed synchronous UI blocking.

Native Riff attr update triggered a long action-pump span:

- renderer long tasks: 0
- `daily-editing.kernel-action-pump.native-riff-upsert`: 1888.3 ms
- `daily-editing.kernel-action-pump.poll-once`: p95/max 1902.5 ms
- transaction dispatch and ws message handling stayed under 0.3 ms

Interpretation: native Riff upsert is a real background-jank candidate. It did not block the renderer in this live run, but it sits inside `pollOnce()` and can overlap with editing on lower-end machines. It should be decoupled from the transaction pump critical path.

Document tree create/remove did not reproduce editing jank:

- renderer long tasks: 0
- `daily-editing.ws-main.message`: p95 0.3 ms
- `daily-editing.kernel-action-pump.poll-once`: p95 3.2 ms
- relay drain max 51.5 ms

Interpretation: document-tree review scope indexing is gated to document-tree operations and was not a normal typing bottleneck in this live run.

Browser search and force refresh did reproduce main-thread jank:

- search/clear renderer long tasks: count 7, p50 73 ms, p95 126 ms, max 127 ms, total blocking 253 ms
- search/clear `browser.snapshot.focus-rows`: max 388.1 ms
- search/clear `browser.snapshot.queryable.hydrate-chunk`: 189.9 ms
- search/clear `browser.grid.get-rows`: max 153.1 ms
- force refresh renderer long tasks: count 2, p50 78 ms, max 85 ms
- force refresh `browser.snapshot.focus-rows`: 280.9 ms
- force refresh `browser.snapshot.queryable.hydrate-chunk`: 192.5 ms
- force refresh `browser.deck-rows-by-ids.map-browser-rows`: 154.7 ms

Interpretation: the browser browsing complaint has a second confirmed surface beyond initial open: toolbar search/clear and force refresh re-enter snapshot/hydrate/focus rows work and can create visible jank.

Browser header sort was inconclusive:

- clicked AG Grid `lastReview` header
- renderer long tasks: 0
- no measured browser reload/sort span in the capture window

Interpretation: this needs explicit AG Grid sort/filter instrumentation instead of DOM-click inference.

## Post-Fix Browser Snapshot Slice

Date: 2026-05-07 15:26 CST
Change applied: allRows/focus snapshots wait until the first AG Grid data block has loaded; queryable snapshot hydrate chunk size reduced from 500 to 96; hydrate yields between chunks and records `browser.snapshot.queryable.yield-between-chunks`. Built, copied to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`, and reloaded via `/api/ui/reloadUI`.

| Phase | Count | p50 | p95 | Max | Main-thread blocking | UI blocking | Risk |
|---|---:|---:|---:|---:|---|---|---|
| Post-fix Browser open after reload | 1 open | first rows n/a | n/a | first rows 4370 ms | longtask max 430 ms | yes | red |
| Post-fix open hydrate chunk | 3 chunks | 59.2 ms | 179 ms | 179 ms | reduced chunk size, still yellow | background/overlap | yellow |
| Post-fix search/clear | 2 load cycles | longtask 80 ms | 140 ms | 140 ms | yes | yes | yellow |
| Post-fix search/clear hydrate chunk | 3 chunks | 52.7 ms | 55.5 ms | 55.5 ms | near threshold | background/overlap | yellow |
| Post-fix force refresh | 1 refresh | longtask 70 ms | 73 ms | 73 ms | yes | yes | yellow |
| Post-fix force refresh hydrate chunk | 3 chunks | 50.2 ms | 54.7 ms | 54.7 ms | near threshold | background/overlap | yellow |

Observed improvements:

- Search/clear `browser.snapshot.queryable.hydrate-chunk` max dropped from 189.9 ms to 55.5 ms.
- Search/clear `browser.snapshot.focus-rows` max dropped from 388.1 ms to 142.7 ms.
- Search/clear `browser.grid.get-rows` max dropped from 153.1 ms to 84.4 ms.
- Force refresh `browser.snapshot.queryable.hydrate-chunk` max dropped from 192.5 ms to 54.7 ms.
- Force refresh `browser.snapshot.focus-rows` max dropped from 280.9 ms to 148.9 ms.
- Force refresh renderer longtask max dropped from 85 ms to 73 ms.

Remaining problems:

- Post-fix cold-ish open after UI reload still exceeded 1000 ms: shell 2524 ms, first rows 4370 ms, longtask max 430 ms.
- The open run was dominated by work outside the snapshot chunk fix: `source-existence.background-sweep` 494.9 ms, `browser.grid.get-rows` 227.5 ms, `browser.grid.fetch-rows` 150.7 ms, `browser.backend.stats` 172.6 ms, relay drain p95 about 169.9 ms.
- Search/clear still had 7 renderer long tasks, max 140 ms, despite smaller hydrate chunks. This points to remaining AG Grid/render commit and source/relay/background contention.

Interpretation: the snapshot chunk/yield slice reduces the confirmed hydrate hotspot, especially search/force-refresh hydrate. It does not yet solve Browser open red jank. The next highest-value fix is moving source existence refresh/background sweep/stats/relay drain behind first rows and adding AG Grid row-model instrumentation.

## Post-Fix Stats And Source Refresh Deferral Slice

Date: 2026-05-07 15:51 CST
Change applied: `BrowserApplicationService.getDeckPage()` and `getDeckRowsByIds()` now return the backend page from cached source-existence status and schedule source refresh in a background timer. SRS Browser stats refresh waits until first rows have loaded, and force refresh now runs data/queue counts before global stats. Built, copied to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`, hash-checked, and reloaded through `/api/ui/reloadUI`.

| Phase | Count | p50 | p95 | Max | Main-thread blocking | UI blocking | Risk |
|---|---:|---:|---:|---:|---|---|---|
| Apply-slice Browser open after reload | 1 open / 26 rows | first rows 4295 ms | n/a | longtask 507 ms | total blocking 647 ms | yes | red |
| Open relay drain / command handler | 21 relay drains | drain 16.2 ms | drain 321.6 ms | drain 728.7 ms / handler 692.7 ms | yes | yes | red |
| Open stats/source refresh overlap | 4 source refreshes | n/a | 177.5 ms | stats 177.5 ms / sweep 169.6 ms | near threshold to yellow | background overlap | yellow |
| Open snapshot hydrate | 3 chunks | 54.8 ms | 65.2 ms | 65.2 ms | near threshold | background overlap | yellow |
| Apply-slice search/clear | 2 load cycles | longtask 98 ms | 137 ms | 176 ms | total blocking 394 ms | yes | yellow |
| Search/clear Browser work | focus/grid/hydrate | n/a | n/a | focus rows 221.2 ms / relay drain 187.7 ms / hydrate 91 ms | yes | yes | yellow |
| Apply-slice force refresh | 1 refresh | longtask 72 ms | n/a | 74 ms | total blocking 46 ms | short blocking remains | yellow |
| Force refresh deferred work | stats/sweep/hydrate | n/a | n/a | stats 1.7 ms / background sweep 10.6 ms / hydrate 47.4 ms | below or near threshold | mostly background | green/yellow |

Observed improvements:

- Force refresh `browser.backend.stats` dropped to 1.7 ms.
- Force refresh `source-existence.background-sweep` dropped to 10.6 ms.
- Force refresh hydrate chunk max dropped to 47.4 ms, below the 50 ms long-task threshold.
- Force refresh renderer longtask max stayed yellow but lower-risk at 74 ms, with only 46 ms total blocking.

Remaining problems:

- Browser open is still red: shell 2478 ms, first rows 4295 ms, renderer longtask max 507 ms, total blocking 647 ms.
- The dominant open-phase evidence moved away from stats-first behavior and toward writer relay drain/handler work: `relay.writer.drain-pending-commands` max 728.7 ms and `relay.writer.command-handler` max 692.7 ms.
- Source refresh still overlaps the open capture after first-row gating. It is no longer the only large phase, but it can still add yellow work: `source-existence.refresh-page-cards` max 177.5 ms and `source-existence.background-sweep` max 169.6 ms.
- Search/clear remains yellow because focus rows, relay drain, AG Grid fetch/get rows, and hydrate work still overlap.

Interpretation: task 2.6 helped the force-refresh path and removed stats/sweep as the leading force-refresh bottleneck. It did not clear Browser cold-ish open. The next blocking phase needs explicit first-row overlap marks, then the likely next repair is relay drain budget/yield plus AG Grid row-model instrumentation. Source-existence visible-row patching remains needed so background refresh can update already-rendered rows without re-entering the first-page await path.

## Post-Fix Relay Budget Slice

Date: 2026-05-07 16:23 CST
Change applied: `writer.takeCommand` now reports `pendingCommandCount`; frontend writer relay has a 24ms default drain budget, max 4 commands per wake, coalesced wake metadata, duplicate command guards, and continuation via `setTimeout(0)`. Built, copied to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`, SHA256-checked for `index.js` and `kernel.js`, and reloaded through `/api/ui/reloadUI`.

Live target: SiYuan Electron `127.0.0.1:9222`, main app renderer only; no API token or document content printed. Current matched card count in the live Browser report was 246.

| Phase | Count | p50 | p95 | Max | Main-thread blocking time | Sync UI blocking | Lazy/backgroundable | Evidence | Risk |
|---|---:|---:|---:|---:|---|---|---|---|---|
| Browser open after relay budget | 1 open / first 50 rows | shell 586.2 ms | n/a | first rows 686.5 ms | renderer longtask max 427 ms, approx TBT 619 ms | yes, but first rows now under 1000 ms | snapshot/source refresh can continue in background | CDP + runtime diagnostics | yellow |
| Warm Browser open after relay budget | 1 open / first 50 rows | shell 241.6 ms | n/a | first rows 257.9 ms | renderer longtask max 135 ms, approx TBT 220 ms | yes, short visible stalls remain | snapshot/source refresh can continue in background | CDP + runtime diagnostics | yellow |
| Search / clear after relay budget | 2 reload cycles | grid getRows 93.3 ms | longtask 97 ms | focus snapshot 145 ms | approx TBT 161 ms | yes, but no red phase | focus snapshot/source refresh backgroundable | CDP + runtime diagnostics | yellow |
| Force refresh after relay budget | 1 refresh | ready 256.2 ms | n/a | focus snapshot 158.4 ms | renderer longtask max 98 ms, approx TBT 94 ms | short blocking remains | snapshot/source refresh backgroundable | CDP + runtime diagnostics | yellow |
| AG Grid first-page getRows | open/search/refresh | 89.9-250.2 ms | n/a | 250.2 ms | can create long task | yes | page-size and row-model update work can be bounded | runtime spans | yellow |
| Source existence page refresh via relay | open/search/refresh | 42.8-51.4 ms | 128.7-229.4 ms | 229.4 ms | can overlap first paint | partly | should patch visible rows asynchronously | runtime spans | yellow |
| Snapshot hydrate chunks | 3-6 chunks | 44.9-60 ms | 53.4-68 ms | 68 ms | near/above 50 ms in some chunks | background overlap | already chunked/yielding; can shrink further if needed | runtime spans | yellow |

Observed improvements:

- Browser open red threshold cleared in this smoke: first rows dropped from the previous 4295 ms red run to 686.5 ms; warm open was 257.9 ms.
- Force refresh stayed short: ready in 256.2 ms; stats max 5.5 ms; source background sweep max 1.4 ms.
- Search/clear no longer showed 100ms+ grid fetch; max `browser.grid.get-rows` was 93.9 ms and max source refresh was 128.7 ms.

Remaining problems:

- Renderer long tasks still exceed the 50 ms yellow line: open max 427 ms, warm open max 135 ms, search/clear max 97 ms, force refresh max 98 ms.
- The next visible Browser blockers are AG Grid first-page getRows/success callback, source-existence relay refresh, and snapshot focus/all-row work. These are not backend SQL bottlenecks.
- Current main renderer smoke did not observe `relay.writer.drain-pending-commands` spans after the budget change; it did observe `relay.writer-push-command-events`. Unit tests cover the writer-drain budget/order behavior, but this live Browser run mostly exercised follower-side `relay.submit-and-wait` and source-existence apply-sweep spans.
- Source-existence refresh still updated cache in the background during this live smoke, but did not yet patch already-visible rows in-place. That gap is fixed in the follow-up implementation below; it still needs a new live smoke after rebuild/reload.

Interpretation: the relay-budget slice plus earlier page-first/source deferral makes Browser open usable again on this machine, but the UI is not clean yet. The Browser-open red risk moved to yellow long-task risk. Next Browser work after this report was first-row overlap marks, AG Grid row-model instrumentation, and visible-row source-status patching. Next editing work was AutoCard no-marker prefilter and native Riff upsert decoupling.

## Instrumentation Added After Relay Slice

Date: 2026-05-07 16:33 CST
Production behavior change: none intended. `SRSBrowser.vue` now records stable Browser UI marks so the next CDP report can use first-row timestamps instead of DOM-click inference:

- `browser.open.shell-attached`
- `browser.open.first-rows-visible`
- `browser.search.reload-scheduled`
- `browser.force-refresh.total`
- `browser.grid.first-data-rendered`
- `browser.grid.model-updated`
- `browser.grid.filter-changed`
- `browser.grid.sort-reload-scheduled`

Metadata is intentionally low-sensitive: query length, row counts, sort count, datasource version, open elapsed time, and firstRowsLoaded state. It does not include query text, block content, kramdown, token, prompt, or answer/body fields.

Follow-up fix: the new first-row mark exposed that the mounted hook could still call `refreshGlobalStatsAfterFirstRows(false)` before `loadData()` set `loading=true`, so stats could run before the first page. The mounted pre-load call was removed; default and initial-queue opens now load data first, then refresh stats through `refreshGlobalStatsAfterFirstRows()`.

Clean CDP smoke after rebuild/reload:

| Phase | Count | p50 | p95 | Max | Main-thread blocking time | Sync UI blocking | Evidence | Risk |
|---|---:|---:|---:|---:|---|---|---|---|
| Clean Browser open after stats fix | 1 open / first 50 rows | shell 277.2 ms | n/a | first rows by DOM 282.4 ms / first-row mark 408.3 ms | renderer longtask max 185 ms | short stalls remain | CDP + runtime diagnostics | yellow |
| Stats overlap check | 1 stats refresh | 1.5 ms | n/a | 1.5 ms | none observed | no longer before first rows | `beforeFirstRows=false` from event timestamps | green |
| AG Grid first page | 1 getRows | 95.1 ms | n/a | 95.1 ms | yellow | yes | `firstRowsLoaded=false` metadata on getRows | yellow |
| Source refresh after first page | 4 refreshes | 34.9 ms | 125.4 ms | 125.4 ms | yellow overlap remains | mostly after first rows | runtime spans | yellow |

Interpretation: the accidental pre-load stats refresh is fixed. Clean open now has first rows below 1000ms by both DOM timing and the new first-row mark. Remaining Browser risk is not stats; it is AG Grid getRows/model update, snapshot all-rows, and source-existence relay refresh.

## OpenSpec Apply Closure

Date: 2026-05-07 17:20 CST
Production behavior change: yes. This section records the code changes after the clean Browser smoke above. A fresh live CDP run should be made after rebuild/reload before treating the new values as final field data.

| Phase | Count | p50 | p95 | Max | Main-thread blocking time | Sync UI blocking | Evidence | Risk |
|---|---:|---:|---:|---:|---|---|---|---|
| Source existence visible patch | changed source block ids | n/a | n/a | n/a | small row patch only | no first-page await | code + focused tests | green/yellow until live rerun |
| AutoCard no-marker prefilter | insert/update transaction ops | n/a | n/a | n/a | skipped before kramdown/attrs when payload is inspectable | no | worker/app tests | green |
| Native Riff upsert decoupling | pending upsert work | n/a | n/a | n/a | background span, `pollOnce()` releases | no full upsert await in poll | action-pump tests | green/yellow until live rerun |
| Diagnostics names/sanitization | Browser/source/AutoCard/Riff events | n/a | n/a | n/a | none | no | diagnostics tests | green |

Implementation status:

- `BrowserApplicationService.getDeckPage()` / `getDeckRowsByIds()` return rows with cached source-existence status first. Source refresh and sweep run later and now emit changed block ids.
- `SRSBrowser.vue` subscribes to source-existence updates and patches `rows`, `rowsForFocus`, bounded `allRows`, loaded row cache, and visible AG Grid nodes without reloading the first page.
- Worker-side transaction action collection now prefilters inspectable insert/update payloads that clearly lack quick-card markers. Delete operations and payloads without inspectable content still pass through to avoid false negatives.
- `AutoCardHandler.handle()` mirrors the cheap no-marker prefilter for direct listener paths and emits `autocard.candidate.prefilter-no-op`.
- `KernelTransactionActionPump.pollOnce()` now schedules native Riff upsert as background work with coalescing and cooldown retry. Long Riff sync no longer holds the poll span.

Remaining risk:

- A final post-build light CDP/API smoke confirmed the reloaded renderer and private status endpoint are alive, but it did not reopen SRS Browser or run low-end typing scenarios.
- AG Grid first-page `getRows/successCallback/model-updated` can still be yellow on real data; the change makes it observable and avoids unnecessary config rebuilds, but does not replace AG Grid's row model.
- Blocks whose transaction payload has no inspectable content still become AutoCard candidates so marker behavior is not lost; that conservative path can still read kramdown/attrs later.

Post-build light live smoke:

- Copied `dist/index.js` and `dist/kernel.js` to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`; SHA256 matched.
- `/api/ui/reloadUI` returned code 0 after local access-auth login; no token was printed.
- CDP main renderer check found `window.siyuanMemoRuntimePerformance`, enabled diagnostics, and observed 7 relay/action-pump events over 1.8 seconds. Slowest spans: `daily-editing.kernel-action-pump.dequeue-relay` 28.1 ms, `daily-editing.kernel-action-pump.poll-once` 28.1 ms, `relay.submit-and-wait` 28.0 ms.
- Private status endpoint returned `ok=true`, `runtime=siyuanmemo-kernel-private-http`; no document content was printed.

## OpenSpec Low-End Jank Debt Closure

Date: 2026-05-07 18:55 CST
OpenSpec change: `optimize-low-end-editing-jank-debt`.

Scope: post-final live diagnostics first, then the smallest production fix justified by the data. CDP and SiYuan API runs did not print API tokens, document body, kramdown, markdown, prompt, answer, or card content. The previously created temporary document id stored in `sessionStorage['siyuanmemo.perfTempDocId']` was removed through `/api/filetree/removeDocByID` before new diagnostics; the id was masked in command output.

Pre-fix diagnostics:

| Phase | Count | p50 | p95 | Max | Main-thread blocking | Sync UI blocking | Lazy-backgroundable | Evidence | Risk |
|---|---:|---:|---:|---:|---|---|---|---|---|
| Browser open 1x, cold-ish | 1 open / first 50 rows | first rows 579.8 ms | n/a | longtask 299 ms | TBT about 391 ms | yes | snapshots/source refresh can continue later | CDP + runtime diagnostics | yellow |
| Browser open 1x, warm | 1 open / first 50 rows | first rows 509.7 ms | n/a | longtask 220 ms | TBT about 282 ms | yes | snapshots/source refresh can continue later | CDP + runtime diagnostics | yellow |
| Browser search/clear 1x | 2 reloads | longtask 146 ms | 171 ms | `source-existence.refresh-page-cards` 217.3 ms | TBT about 364 ms | yes | focus snapshot/source refresh backgroundable | CDP + runtime diagnostics | yellow |
| Browser open 4x | 1 open / first 50 rows | first rows 2388.3 ms | n/a | longtask 909 ms | heavy renderer stalls | yes | source refresh/snapshot should move later | CDP + runtime diagnostics | red |
| Browser search/clear 4x | 2 reloads | longtask 622 ms | 784 ms | `browser.grid.get-rows` 970.3 ms | TBT about 3420 ms | yes | focus snapshot/source refresh backgroundable | CDP + runtime diagnostics | red |
| Browser force refresh 4x | 1 refresh | total 1143.4 ms | n/a | `source-existence.refresh-page-cards` 637.9 ms | longtask max 451 ms | yes | source refresh/snapshot backgroundable | CDP + runtime diagnostics | red/yellow |
| Ordinary typing 1x | 81 chars | longtask 53 ms | 57 ms | relay submit/wait 62.3 ms | TBT about 10 ms | minor | no | CDP temp-doc typing smoke | green/yellow |
| No-inspectable attr noise 1x | 8 ops | dispatch 0.2 ms | relay 46.5 ms | longtask 0 ms | none observed | no | no | CDP/API temp-doc smoke | green |
| Marker `>>` typing 4x | 3 marker lines | longtask 63 ms | 162 ms | relay submit/wait 1771.2 ms | TBT about 374 ms | partly | non-critical side effects may be scheduled | CDP temp-doc typing smoke | yellow/red |
| API transaction storm 1x | 10 appends | dispatch 0.2 ms | relay 71.2 ms | longtask 0 ms | none observed | no | no | CDP/API temp-doc smoke | green |
| API transaction storm 4x | 6 appends | dispatch 2.2 ms | relay 136.6 ms | longtask 78 ms | small yellow | no | no | CDP/API temp-doc smoke | yellow |
| Batch source reads 50/200/500 | 3 batch sizes | kramdown p50 15.9-18.5 ms | 25.1-29.5 ms | wall 1181.6 ms at 500 | not directly UI-bound in this run | no current renderer block | yes, batch/background lane | SiYuan API, ids only | yellow background |
| `source_missing` sweep | 1 sweep / 1 candidate | apply 31.8 ms | n/a | total checked 0 / updated 0 | none observed | no | already coalesced/backgroundable | backend/browser service diagnostics | green |

Evidence gate result: not all phases were green. The smallest justified fix track was Browser grid/source refresh budgeting. Fresh daily-editing data did not justify changing AutoCard no-inspectable maybe-scan in this slice: ordinary typing and no-inspectable attr noise were green/yellow at 1x, and marker-heavy runs showed async relay/background pressure but did not produce reliable AutoCard no-inspectable read spans in this pass.

Production change applied:

- `SRSBrowser.vue` now uses `browserGridSizing.ts` for stable grid budgets. Desktop first block/page/cache block is 32 rows, max cache blocks is 6, and row buffer is 6. Mobile keeps a 120-row block with row buffer 6.
- `BrowserApplicationService` delays the backend source-existence page refresh by 250 ms instead of the first macrotask after deck page return, preserving page-first visible rows before source refresh/relay work starts.

Post-fix live smoke after build, deploy, SHA256 check, and `/api/ui/reloadUI`:

| Phase | Count | p50 | p95 | Max | Main-thread blocking | Sync UI blocking | Lazy-backgroundable | Evidence | Risk |
|---|---:|---:|---:|---:|---|---|---|---|---|
| Browser open 1x after reload | 1 open / first 32 rows | first rows 1153.7 ms | n/a | longtask 417 ms | TBT about 466 ms | yes, cold after reload crossed 1000 ms | snapshot/source refresh can continue later | CDP + runtime diagnostics | red/yellow |
| Browser warm open 1x | 1 open / first 32 rows | first rows 433.7 ms | n/a | source refresh outlier 1331.2 ms | longtask max 220 ms, TBT about 246 ms | first rows ok; background source outlier remains | yes | CDP + runtime diagnostics | yellow |
| Browser open 4x | 1 open / first 32 rows | first rows 1471.1 ms | n/a | longtask 646 ms | TBT about 1482 ms | yes | snapshot/source refresh can continue later | CDP + runtime diagnostics | red/yellow, improved |
| Browser search/clear 4x | 2 reloads / first 32 rows | `grid.get-rows` 458.1 ms | 706.2 ms | longtask 678 ms | TBT about 1857 ms | yes | focus snapshot/source refresh backgroundable | CDP + runtime diagnostics | red/yellow, improved |
| Browser force refresh 4x | 1 refresh / first 32 rows | total 980 ms | n/a | `source-existence.refresh-page-cards` 490.7 ms | longtask max 377 ms, TBT about 594 ms | yes | focus snapshot/source refresh backgroundable | CDP + runtime diagnostics | yellow/red, improved |
| AG Grid first-page size check | open/search/refresh | request `0..32` | n/a | rowCount 32 | smaller first commit than previous 50-row block | yes | n/a | runtime metadata | green for config, yellow for AG Grid cost |
| Source refresh after delay | open/search/refresh | 65.5 ms at 4x open | 135.9 ms search | 490.7 ms force refresh | no longer first macrotask after page return | partly | yes | runtime spans + unit test | yellow |

Before/after interpretation:

- The new 32-row desktop budget is active in live metadata. Browser 4x open improved from first rows 2388.3 ms to 1471.1 ms, but still exceeds the 1000 ms low-end red line.
- The source refresh overlap improved sharply on 4x open/search: open source refresh max went from about 1000.7 ms to 79.2 ms; search/clear source max went from 955.8 ms to 135.9 ms. Force refresh still saw delayed source refresh up to 490.7 ms.
- AG Grid `successCallback` / `model-updated` and focus/allRows snapshots are now the next dominant Browser renderer costs, especially under 4x throttle. This slice bounds the first block and defers source refresh; it does not replace AG Grid's row model.
- AutoCard no-inspectable maybe-scan and marker side-effect scheduling remain deferred. The evidence did not support changing those paths before the Browser grid/source bottleneck was measured and bounded.

## Stabilize Low-End Browser/Edit Baseline

Date: 2026-05-07 20:09 CST
OpenSpec change: `stabilize-low-end-browser-editing-jank`
Build/deploy baseline: rebuilt `feat/kernel-companion-p0`, copied `dist` to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`, SHA256 checked for `index.js` and `kernel.js`, then reloaded SiYuan UI via `/api/ui/reloadUI` with code 0.
Method: live Electron CDP on `127.0.0.1:9222` plus local SiYuan API with 4x CPU throttling. The smoke script reads the local API token but does not print it. Search text, document body, kramdown, markdown, prompt, answer, and card content were not printed. A temporary document was created for editing smoke and removed through `/api/filetree/removeDocByID` after the run.

| Phase | Count | First rows / primary span | Longtask max | TBT estimate | Dominant spans | Risk |
|---|---:|---:|---:|---:|---|---|
| Browser open 4x cold-ish | 1 open / first 32 rows | first rows 1845.7 ms | 1121 ms | 1801 ms | shell 1093.2 ms; `snapshot.all-rows` 475.9 ms; `grid.get-rows` 415.1 ms; `success-callback` 324.4 ms | red |
| Browser warm open 4x | 1 open / first 32 rows | first rows 2784.1 ms | 1749 ms | 3013 ms | shell 1677.6 ms; `grid.get-rows` 577.1 ms; `snapshot.all-rows` 572.3 ms; `backend.stats` 506.4 ms | red |
| Browser search/clear 4x | 2 reload inputs | `snapshot.focus-rows` 849.9 ms | 793 ms | 1780 ms | matched ids 831.8 ms; `grid.get-rows` 359.6 ms; `model-updated` 334.1 ms | red |
| Browser force refresh 4x | 1 refresh | `grid.get-rows` 365.7 ms | 308 ms | 452 ms | `success-callback` 301.9 ms; `model-updated` 243.5 ms; `apply-datasource` 237.2 ms | red |
| Ordinary typing 4x | 58 inserted chars | `ws-main.message` observed | 179 ms | 130 ms | renderer longtask only; no AutoCard read span | yellow |
| No-inspectable attr noise 4x | 8 attr ops | `ws-main.message` max 4.3 ms | 0 ms | 0 ms | no AutoCard read span | green |
| Marker typing 4x | 51 inserted chars | `ws-main.message` observed | 74 ms | 27 ms | renderer longtask only in this run | yellow |
| API transaction storm 4x | 8 appends | `ws-main.message` max 8.6 ms | 0 ms | 0 ms | no AutoCard read span | green |

Classification:

- Browser remains the primary red surface. Open/warm-open cross the 1000 ms first-row target, and open/search/refresh all produce renderer long tasks far above 50 ms.
- Remaining Browser overlap is now clearer: AG Grid `getRows/successCallback/model-updated`, allRows/focus snapshots, and stats/background work. Source-existence refresh was not the dominant span in this particular baseline, but remains a coalescing/cancellation target from prior force-refresh evidence.
- Editing follow-up remains evidence-gated. Ordinary and marker typing were yellow by renderer longtask max, while no-inspectable attr noise and API transaction storm were green and did not show AutoCard kramdown/attrs reads. This does not justify changing deeper AutoCard maybe-scan before Browser grid/snapshot work.

## Stabilize Low-End Browser/Edit Post-Fix

Date: 2026-05-07 20:46 CST
OpenSpec change: `stabilize-low-end-browser-editing-jank`
Build/deploy: rebuilt, copied `dist` to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`, SHA256 checked `index.js` and `kernel.js`, and reloaded SiYuan UI via `/api/ui/reloadUI` with code 0. One immediate post-reload smoke was discarded as startup-polluted because Browser root did not mount and spans were dominated by plugin startup.

Production changes applied in this slice:

- Browser deck page rows reuse stable projection objects when source status and row projection are unchanged, and AG Grid receives `getRowId` from the Browser stable id contract.
- Source-existence page refreshes are coalesced, stale page-refresh results are suppressed, and `getDeckRowsByIds()` snapshot hydration no longer schedules page source refresh work.
- allRows/focus snapshot warmup is delayed to `4800 ms` after first page scheduling, remains demand-driven for actions via `ensureAllRowsSnapshotReady()`, and hydrates in 24-row chunks with chunk-yield and stale task cancellation.

Final settled live smoke:

| Phase | Count | First rows / primary span | Longtask max | TBT estimate | Dominant spans | Risk |
|---|---:|---:|---:|---:|---|---|
| Browser open 4x cold-ish | 1 open / first 32 rows | DOM rows 1057.2 ms; first-row mark 4923.5 ms | 2276 ms | 3921 ms | `grid.get-rows` 1598.4 ms; `grid.fetch-rows` 1025.7 ms; `success-callback` 569.3 ms; source refresh 51.5 ms; no snapshot overlap | red |
| Browser warm open 4x | 1 open / first 32 rows | DOM rows 1281.8 ms; first-row mark 3718 ms | 1591 ms | 3387 ms | `grid.apply-datasource` 713.8 ms; `grid.get-rows` 653.1 ms; `success-callback` 539.6 ms; source refresh 63.3 ms; no snapshot overlap | red |
| Browser search/clear 4x | 2 reload inputs | no snapshot/source overlap | 1347 ms | 4259 ms | `grid.model-updated` 632.9 ms; `grid.get-rows` 595.2 ms; `success-callback` 565 ms | red |
| Browser force refresh 4x | 1 refresh | `force-refresh.total` 1579.5 ms | 723 ms | 1262 ms | delayed source refresh 748.9 ms; `grid.model-updated` 639.6 ms; `grid.get-rows` 582 ms | red |
| Ordinary typing 4x | 58 inserted chars | no AutoCard read span | 222 ms | 183 ms | renderer longtask only | yellow |
| No-inspectable attr noise 4x | 8 attr ops | no AutoCard read span | 0 ms | 0 ms | relay submit max 93.3 ms async | green |
| Marker typing 4x | 51 inserted chars | no renderer longtask in final run | 0 ms | 0 ms | relay submit max 961.3 ms async wait; no AutoCard read span captured | green/yellow |
| API transaction storm 4x | 8 appends | no AutoCard read span | 78 ms | 28 ms | relay submit max 246.2 ms async | yellow |

Interpretation:

- The source/snapshot part of the Browser complaint improved: final open/search/refresh phases show no allRows/focus snapshot overlap, and search/clear shows no source refresh overlap. Source refresh is still visible in force refresh, but it is no longer tied to `rowsByIds()` snapshot chunks.
- Browser is still not solved for low-end 4x: remaining red spans are AG Grid commit/model work (`successCallback`, `model-updated`, `apply-datasource`) and backend first-page fetch latency. This needs a separate AG Grid row-model strategy or a smaller/custom first-page presentation; continuing to stack source/snapshot fixes would be guesswork.
- Editing remains evidence-gated. No-inspectable attr noise is green, API storms are yellow but not AutoCard-read driven, and the final marker run did not reproduce renderer long tasks. This slice does not justify changing AutoCard maybe-scan or marker side effects.

## Code Path Evidence

### SRS Browser Open

Observed path:

`TabManager/MenuManager -> SRSBrowser.vue -> browserLoadDataRuntime.loadData() -> createDeckDataSource() -> AG Grid infinite datasource -> BrowserApplicationService.getDeckPage() -> cached source status -> first rows -> async source-existence refresh/visible patch -> snapshot loaders`.

Relevant code:

- `src/application/managers/TabManager.ts:476` mounts `SRSBrowser`.
- `src/ui/browser/SRSBrowser.vue` calls `loadData(... snapshotDelayMs: DEFAULT_HIERARCHY_SNAPSHOT_DELAY_MS)` on open/focus/search paths; the default is currently 4800 ms.
- `src/ui/browser/browserLoadDataRuntime.ts:103` starts `loadData()`.
- `src/ui/browser/browserLoadDataRuntime.ts:218` rebuilds the infinite datasource before snapshots.
- `src/ui/browser/browserLoadDataRuntime.ts:229` schedules all-row snapshot.
- `src/ui/browser/browserDataSnapshots.ts:59` primes queryable snapshot.
- `src/ui/browser/browserDataSnapshots.ts:70` loads all matched ids.
- `src/ui/browser/browserDataSnapshots.ts` hydrates rows by small chunks and yields between chunks; `SRSBrowser.vue` currently passes a 24-row Browser snapshot chunk.
- `src/application/services/BrowserApplicationService.ts` fetches backend deck page, applies cached source status, and schedules refresh/sweep work after first rows.
- `src/ui/browser/SRSBrowser.vue` receives source-existence update events and patches visible grid rows without reopening/requerying the current page.

Inference: first page is now page-first for source status and snapshots. Remaining Browser yellow risk is AG Grid first-page work plus any background snapshot/source patch work that overlaps the renderer on slower machines.

### Editing Listener

Observed path:

`TransactionWebSocketService -> KernelTransactionIngestHandler -> SrsBackendWorker kernel.transaction.ingest -> worker collectKernelTransactionActions() -> KernelTransactionActionPump -> AutoCardHandler.handle() -> delayed processSettledCandidate() -> checkQuickSymbols() -> kramdown/block/attrs reads -> backend decision/execute -> renderer host effect executeAutoCard`.

Relevant code:

- `src/application/ApplicationContext.ts:2217` wires AutoCard through kernel transaction action pump when ingest is enabled.
- `src/application/ApplicationContext.ts:2268` registers `KernelTransactionIngestHandler`.
- `src/application/handlers/KernelTransactionIngestHandler.ts:80` queues transactions and debounces flush.
- `worker/db/SqliteDatabaseService.ts` collects AutoCard candidate operations and skips inspectable insert/update payloads that do not contain quick-card markers.
- `src/application/handlers/KernelTransactionActionPump.ts:133` polls kernel actions.
- `src/application/handlers/KernelTransactionActionPump.ts:159` marks native Riff upsert pending.
- `src/application/handlers/KernelTransactionActionPump.ts:203` buffers AutoCard operations.
- `src/application/handlers/KernelTransactionActionPump.ts:281` hands candidates to `AutoCardHandler.handle()`.
- `src/application/handlers/KernelTransactionActionPump.ts` coalesces native Riff upsert requests and runs the sync under `daily-editing.kernel-action-pump.native-riff-upsert-background` outside the poll critical path.
- `src/application/handlers/AutoCardHandler.ts:1475` scans all doOperations passed into `handle()`.
- `src/application/handlers/AutoCardHandler.ts:1674` starts `checkQuickSymbols()`.
- `src/application/handlers/AutoCardHandler.ts:1700` reads block kramdown.
- `src/application/handlers/AutoCardHandler.ts:1715` reads host block row.
- `src/application/handlers/AutoCardHandler.ts:1742` reads block attrs.
- `src/application/handlers/AutoCardHandler.ts:1787` resolves decision.
- `src/application/handlers/AutoCardHandler.ts:1973` executes planner decision.
- `src/application/handlers/AutoCardHandler.ts:2254` starts settled candidate processing.
- `src/application/clients/FrontendInstanceRuntime.ts:731` drains writer relay commands, up to 4 per wake.

Inference: plain typing with inspectable no-marker transaction payloads should now avoid expensive AutoCard kramdown/attrs reads. Conservative no-content payloads can still enqueue candidates, and `>>` typing still intentionally enters decision + execute + Xiuyuan creation, so symbol-heavy creation can remain yellow/red on low-end machines.

## Minimal Fix Direction Status

Completed in `optimize-browser-open-and-editing-jank`:

1. Browser remains page-first.
2. allRows/focus snapshots start after first rows.
3. Snapshot hydrate uses smaller chunks, yields, and cancels stale tasks.
4. Current-page source existence uses cached status first, then patches visible rows asynchronously.
5. Stats and source sweep are first-row gated.
6. AG Grid first-data/model/filter/sort diagnostics are stable.
7. Worker/app AutoCard no-marker prefilter skips expensive reads when transaction payload proves no marker.
8. Native Riff upsert is background/coalesced outside `pollOnce()`.
9. Relay drain has budget/yield while preserving command order.

Deferred:

1. Replace or further bound AG Grid first-page row model work if fresh live p95/max still crosses yellow thresholds.
2. Add deeper idle/cancellable AutoCard processing for transaction payloads that cannot expose changed content.
3. Repeat live low-end editing smoke after deploy to prove field numbers changed.

## OpenSpec Change Status

Change name: `optimize-browser-open-and-editing-jank`

Status: implementation tasks are complete in the worktree. Archive after final verification and fresh live smoke review.

Completed scope:

- Instrumentation: Browser first rows, AG Grid first-data/model/filter/sort, source patch, AutoCard prefilter/read/execute, native Riff background upsert, relay drain budget.
- Browser open: page-first current page, cancellable snapshots, smaller hydrate chunks, stats/sweep first-row gating, source visible-row patch.
- Daily editing: worker/app no-marker prefilter, native Riff upsert background scheduling, action-pump coalescing/cooldown.
- Relay: per-wake budget/yield with command order preserved.
- Validation target: targeted Vitest, `pnpm run check:boundaries`, `pnpm build`, and a post-build live CDP/API smoke without auth or document-content output.

## Open Questions

- Whether user reports classified as normal editing include quick-card symbol input, paste bursts, or imported/API-created blocks.
- Whether lower-memory/lower-CPU machines amplify writer relay polling, transaction websocket dispatch, or AutoCard candidate settle/read paths enough to make plain typing stutter.
- Whether debug logging or another plugin increases transaction burst cost.

## Next Test Plan

The next phase should test normal editing with SiYuanMemo enabled:

1. Idle with plugin enabled, already done: no renderer long task in 60 seconds.
2. Real UI typing in a temporary test block: measure key-to-DOM latency, renderer long tasks, `daily-editing.ws-main.*`, `kernel-action-pump.*`, AutoCard spans.
3. Symbol-trigger typing (`>>`) in a temporary test block: measure AutoCard settle/read/create path without printing content.
4. API-driven transaction storm: create or update many temporary blocks and measure websocket dispatch, relay drain, and long tasks.
5. Compare results with AutoCard disabled if settings allow a safe toggle, or classify via spans if toggling is not safe.
