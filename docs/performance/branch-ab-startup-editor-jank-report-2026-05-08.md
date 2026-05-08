# Branch A/B startup and editor jank diagnostic - 2026-05-08

## Scope

Compare the pre-kernel frontend-only branch (`main`) with the kernel migration branch (`feat/kernel-companion-p0`) on the same SiYuan workspace and renderer. The goal is to separate bundle/startup weight from ordinary editor runtime jank.

Privacy: smoke output redacts token, temporary document ids, and note body content. No kramdown, markdown, prompt, answer, or card content is printed.

## Branches and assets

| Branch | Build source | Live `index.js` bytes | Live `index.css` bytes | Extra |
| --- | --- | ---: | ---: | --- |
| `main` | `H:/project-F/flashcard/siyuan-plugin-siyuanmemo` | 4,532,203 | 250,479 | no `kernel.js` |
| `feat/kernel-companion-p0` | `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0` | 6,228,754 | 250,479 | `kernel.js` 43,585 bytes |

Vite output reported:

| Branch | Vite `index.js` | Gzip |
| --- | ---: | ---: |
| `main` | 4,477.80 kB | 1,408.24 kB |
| `feat/kernel-companion-p0` | 6,171.18 kB | 2,090.66 kB |

## Post-source-lazy single-file build composition

After the startup surface lazy boundary change, the migration branch was rebuilt with `pnpm build` and summarized with `node scripts/bundle-composition-report.cjs dist`. The build was restored to the official SiYuan plugin example shape: one CommonJS `index.js`, no `chunks/*`, no entry loader.

| Phase | File | Bytes | Gzip bytes |
| --- | --- | ---: | ---: |
| startup entry | `index.js` | 6,228,754 | 2,091,400 |
| style | `index.css` | 250,479 | 34,172 |
| kernel companion | `kernel.js` | 43,585 | 8,785 |

Interpretation: Browser/AG Grid, Review view, and AI pane surface imports are still source-level first-use boundaries in `DialogManager` / `TabManager`, but release packaging stays single-file. This protects lifecycle/static-import shape without claiming shipped-byte reduction from chunk splitting. The previous chunked experiment is superseded by the official SiYuan package constraint.

Deferred targets after this cut:

- `ApplicationContext` still eagerly composes the service/runtime graph, including SQL and backend/kernel runtime setup.
- `AIWorkbenchService` and deeper AI/runtime services still participate in the eager application composition path.
- Some Vite dynamic-import warnings remain for modules that are also statically imported elsewhere; this cut only guards the manager-level Browser/Review/AI surface imports while `inlineDynamicImports: true` keeps the release package single-file.

## Startup activation

Measured as: clean deploy branch assets, disable plugin, enable plugin, wait until renderer reports plugin loaded.

| Branch | Enable -> renderer loaded |
| --- | ---: |
| `main` | 8,111 ms |
| `feat/kernel-companion-p0` | 9,915 ms |
| `feat/kernel-companion-p0` source-lazy single-file live deploy, plugin-state script | 9,036 ms |
| `feat/kernel-companion-p0` source-lazy single-file visible idle probe | 6,553 ms |

Interpretation: the migration branch was materially heavier at startup before lazy surface work. After restoring the official single-file package, live `index.js` is again about 6.23 MB / 2.09 MB gzip; `node scripts/siyuan-plugin-state.cjs off` then a measured `on` run reached loaded/topbar/runtime-performance-present in 9,036 ms. A visible renderer idle probe measured enable-to-loaded at 6,553 ms with the restored no-chunk package. The older 7,724 ms visible first-idle row came from the superseded chunked experiment and is kept only as historical context.

## 6x editor smoke

Environment for all rows:

- Browser state: closed
- CPU throttle: 6x
- Actions: `plain-typing`, `marker-typing`
- Repeat: 2
- Plugin off/on prepared through `/api/petal/setPetalEnabled`
- Renderer forced visible; hidden renderer rows are not accepted

Raw reports:

- `docs/performance/ab-main-editor-smoke-off-6x-2026-05-08.json`
- `docs/performance/ab-main-editor-smoke-on-6x-2026-05-08.json`
- `docs/performance/ab-kernel-editor-smoke-off-6x-2026-05-08.json`
- `docs/performance/ab-kernel-editor-smoke-on-6x-2026-05-08.json`
- `docs/performance/live-startup-split-plugin-off-6x-2026-05-08.json` (superseded chunked-package experiment)
- `docs/performance/live-startup-split-plugin-on-6x-2026-05-08.json` (superseded chunked-package experiment)
- `docs/performance/live-startup-split-first-use-smoke-2026-05-08.json` (superseded chunked-package experiment)
- `docs/performance/live-startup-split-enable-idle-2026-05-08.json` (superseded chunked-package experiment)
- `docs/performance/live-startup-source-lazy-no-chunk-enable-idle-2026-05-08.json`
- `docs/performance/live-startup-source-lazy-no-chunk-plugin-off-6x-2026-05-08.json`
- `docs/performance/live-startup-source-lazy-no-chunk-plugin-on-6x-2026-05-08.json`
- `docs/performance/live-startup-source-lazy-no-chunk-first-use-smoke-2026-05-08.json`
- `docs/performance/live-marker-relay-delay-plugin-off-6x-2026-05-08.json`
- `docs/performance/live-marker-relay-delay-plugin-on-6x-2026-05-08.json`
- `docs/performance/live-marker-relay-delay-plugin-on-warm-6x-2026-05-08.json`

## `main` results

| Action | Repeat | Off max longtask | On max longtask | Off TBT | On TBT | On-off TBT | On plugin spans | Owner |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| plain typing | 1 | 289 ms | 1,427 ms | 457 ms | 5,861 ms | +5,404 ms | 0 | baseline/system/unknown |
| marker typing | 1 | 836 ms | 716 ms | 2,407 ms | 3,430 ms | +1,023 ms | 0 | baseline/system/unknown |
| plain typing | 2 | 821 ms | 278 ms | 1,182 ms | 2,143 ms | +961 ms | 0 | baseline/system/unknown |
| marker typing | 2 | 817 ms | 2,156 ms | 1,127 ms | 2,387 ms | +1,260 ms | 0 | baseline/system/unknown |

Interpretation: `main` already shows plugin-on editor degradation under 6x CPU even before kernel migration. Because `main` lacks the newer fine-grained runtime spans, the owner cannot be attributed beyond "plugin enabled increases renderer/system work".

## `feat/kernel-companion-p0` results

| Action | Repeat | Off max longtask | On max longtask | Off TBT | On TBT | On-off TBT | On plugin spans | Owner |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| plain typing | 1 | 182 ms | 69 ms | 289 ms | 33 ms | -256 ms | 1 | startup/unknown |
| marker typing | 1 | 1,277 ms | 1,254 ms | 1,567 ms | 1,543 ms | -24 ms | 6 | writer relay |
| plain typing | 2 | 996 ms | 67 ms | 1,052 ms | 17 ms | -1,035 ms | 7 | writer relay |
| marker typing | 2 | 1,186 ms | 3,459 ms | 2,095 ms | 3,647 ms | +1,552 ms | 32 | writer relay |

Slowest kernel-branch plugin overlaps:

- `plain-typing` repeat 1: `doc-tree-review-scope.hydrate` 4,404.9 ms, owner unknown/startup.
- `marker-typing` repeat 1: `writer.drain-pending-commands` 31,718.3 ms, `kernel.transaction.ingest` handler 15,721.5 ms, `kernel.transaction.dequeue` complete 14,751.8 ms.
- `plain-typing` repeat 2: `writer.drain-pending-commands` 9,894.7 ms, `kernel.transaction.ingest` complete 5,668.6 ms.
- `marker-typing` repeat 2: `writer.drain-pending-commands` 12,864.6 ms, `writer.take-command` 8,457.0 ms, `kernel.transaction.ingest` handler 3,815.9 ms.

Interpretation: after the empty-poll fixes, current kernel branch does not consistently worsen plain typing TBT versus its plugin-off baseline in this run, but marker typing still has a plugin-on red row with clear writer relay overlap. The remaining repeated runtime suspect is the transaction relay marker burst path, not SRS Browser and not proven AutoCard reads.

## Post-source-lazy live smoke

Live deployment:

- Copied rebuilt `dist/*` to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`.
- Removed old live `chunks/` residue; `Test-Path H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo/chunks` returned `False`.
- `dist/` and the live plugin directory now contain only `i18n/`, `icon.png`, `index.css`, `index.js`, `kernel.js`, `plugin.json`, `preview.png`, `README.md`, and `README_zh_CN.md`.
- `node scripts/siyuan-plugin-state.cjs on` loaded the renderer successfully with the single-file entry: `loaded=true`, `hasRuntimePerformance=true`, `hasTopbar=true`. A measured off/on run reached this state in 9,036 ms.

Current visible enable/first-idle probe on the restored no-chunk package:

| Enable -> loaded | Idle window | Longtask count | Max longtask | TBT estimate | Heap before | Heap after | Heap delta |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 6,553 ms | 5,000 ms | 1 | 410 ms | 360 ms | 1,038,968,051 | 1,218,082,586 | +179,114,535 |

Current visible 6x Browser-closed smoke on the restored no-chunk package:

| Action | Repeat | Off max longtask | On max longtask | Off TBT | On TBT | On-off TBT | On plugin spans | Owner |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| plain typing | 1 | 71 ms | 258 ms | 36 ms | 276 ms | +240 ms | 2 | startup / writer relay |
| marker typing | 1 | 1,319 ms | 3,283 ms | 1,473 ms | 3,531 ms | +2,058 ms | 27 | writer relay |

Interpretation: source-level lazy boundaries are valid lifecycle/static-import cleanup, but chunk splitting is not an accepted packaging path for SiYuanMemo. The restored no-chunk package still does not close the ordinary editor red rows. Plain typing now has a smaller on-off TBT delta but still overlaps `hybrid-sync-service.start` and one relay completion; marker typing still points strongly to writer relay drain / `kernel.transaction.ingest` / `kernel.transaction.dequeue` overlap. That belongs in the separate marker-burst change.

## Post-transaction relay continuation live smoke

Live deployment:

- Rebuilt the kernel branch and copied `dist/*` to `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`.
- The deployed live `index.js` was 6,230,339 bytes and `index.css` was 250,479 bytes.
- The targeted code change only affects writer relay budget-yield continuation for fresh `kernel.transaction.ingest/dequeue/requeue` bursts: default continuation delay is 48 ms while pending transaction commands are still under the 750 ms max-delay cap.

Paired visible 6x Browser-closed marker rows after the relay continuation change:

| Action | Repeat | Off max longtask | On max longtask | Off TBT | On TBT | On-off TBT | On plugin spans | Owner | Relay continuation evidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| marker typing | 1 | 0 ms | 1,216 ms | 0 ms | 1,530 ms | +1,530 ms | 35 | startup / writer relay | `kernel.transaction.ingest`, `maxCommandAgeMs=1,024`, cap hit, `continuationDelayMs=0` |
| marker typing | 2 | 3,196 ms | 2,672 ms | 5,440 ms | 2,815 ms | -2,625 ms | 24 | writer relay | `kernel.transaction.ingest`, `maxCommandAgeMs=8,077`, cap hit, `continuationDelayMs=0` |

Additional plugin-on run while the plugin was already enabled still showed plugin reload/startup spans, so it is not a clean warm-row proof:

| Repeat | On max longtask | On TBT | On plugin spans | Owner | Relay continuation evidence |
| ---: | ---: | ---: | ---: | --- | --- |
| 1 | 1,152 ms | 1,570 ms | 35 | writer relay / startup | `kernel.transaction.dequeue,kernel.transaction.ingest`, `maxCommandAgeMs=7,550`, cap hit, `continuationDelayMs=0` |
| 2 | 2,861 ms | 3,093 ms | 18 | writer relay | `kernel.transaction.ingest,kernel.transaction.dequeue`, `maxCommandAgeMs=10,921`, cap hit, `continuationDelayMs=0` |

Interpretation: the focused fake-timer regression covers the intended fresh-burst behavior: a budget-yielded transaction relay drain keeps the deferred command pending, waits 48 ms, then completes it normally. The live rows above did not exercise that fresh under-750 ms path. Every plugin-on marker row had already-aged transaction commands, so the max-delay cap correctly chose immediate continuation instead of adding more latency. Marker rows therefore remain red/inconclusive for user-visible improvement, and the current owner is reclassified as aged writer relay reconnect/startup backlog plus slow `writer.takeCommand` / `writer.completeCommand` wall clock. The rows still do not justify AutoCard, Riff, Browser, or bundle changes inside this marker-burst fix.

Current focused first-use smoke on the restored no-chunk package:

| Surface | First-use result | Duration |
| --- | --- | ---: |
| Browser dialog | opened | 500.2 ms |
| Settings dialog | opened | 181.1 ms |
| AI Workbench dialog | opened | 139.3 ms |
| Review dialog | opened | 52.4 ms |
| Mobile launcher dialog | opened | 11.8 ms |
| Progressive split dialog | opened | 24.3 ms |
| Template select dialog | opened | 27.5 ms |
| Arena manager dialog | opened | 55.4 ms |

First attempt at this smoke observed a real lifecycle detail: the plugin object can be present in `window.siyuan.ws.app.plugins` before `ApplicationContext` is ready. The accepted row waits until `plugin.getContext().getDialogManager()` succeeds before opening first-use surfaces.

## Current conclusion

The "heavy UI/framework/bundle" hypothesis is plausible for startup and first-load pressure:

- `main` is already large and already shows plugin-on editor degradation under 6x CPU.
- The migration branch is larger and takes longer to activate in this run.

But the current evidence does not support "it is only because the plugin ships Vue/AG Grid/sql.js" as the root cause of ordinary editor jank. There are two separate problems:

1. Pre-kernel/frontend-only plugin already adds editor pressure under low CPU. This fits bundle/startup/global-runtime weight or legacy frontend-only listeners/work.
2. Current kernel branch has a newer, more specific marker-typing problem: writer relay `kernel.transaction.ingest/dequeue` overlap during marker bursts. The transaction continuation change protects fresh bursts, but the live rows captured here are dominated by already-aged relay commands and reload/reconnect backlog.

Next focused changes should stay separate:

- Bundle/startup/idle split change: measure module composition, lazy-load Browser/AI/Review/AG Grid/sql.js where safe, and prove startup/idle delta improves.
- Transaction relay marker-burst follow-up: if marker rows remain the next risk, isolate stale relay command age and `writer.takeCommand` / `writer.completeCommand` latency after plugin reload without hiding queued work or adding fallback paths.

## Post-source-lazy evidence still needed

The startup work is intentionally stopped at the manager/UI-surface boundary because the official package shape forbids release chunking and the next candidates are higher-risk composition/service changes. Before cutting deeper, capture:

- Full repeated visible 6x Browser-closed plugin-off/plugin-on editor rows on the restored single-file package if a statistical decision is needed beyond the one-repeat smoke.
- Tab-specific Browser / Review / AI first-use rows if native custom tab bootstrap, not dialog first-use, becomes the next startup risk.

If editor delta does not improve, do not keep speculative startup splitting; choose the next target only from live startup/idle/first-use evidence.
