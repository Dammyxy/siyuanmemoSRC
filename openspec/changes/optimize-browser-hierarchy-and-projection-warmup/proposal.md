## Why

Browser open can show first grid rows quickly, but hierarchy and queue surfaces still do expensive or late work: the document hierarchy waits for a delayed full-row snapshot, and projection-backed queue views may materialize invalidated projections only after the user selects a queue.

Anki's Browser keeps these concerns separate: search returns ordered identities, visible rows hydrate lazily, and sidebar/tree counts use dedicated count/tree reads. SiYuanMemo should finish that separation so Browser open remains fast and projection readiness is handled before user interaction when possible.

## What Changes

- Add a count-only Browser hierarchy read path that returns document/root counts and title lookup inputs without hydrating all Browser rows.
- Move `BrowserHierarchy` from full `BrowserCard[]` input toward document-count read-model input for global, filtered, and focused document lists.
- Prewarm projection-backed queue read models in the background after Browser open and after projection invalidation events, without hiding unavailable owners behind local queue fallback.
- Keep queue selection fail-closed: if a projection is still preparing, Browser shows an explicit refreshing state rather than building rows from stale local queue cards.
- Remove the default dependency on the delayed all-rows hierarchy snapshot for document counts; retain full-row snapshots only for explicit workflows that truly need all hydrated rows.
- Extend diagnostics/profile coverage for hierarchy counts, projection warmup latency, and full-row snapshot avoidance.

## Capabilities

### New Capabilities

- `browser-open-readiness`: Covers Browser open-time read readiness, count-only hierarchy reads, projection prewarm, and rules that prevent background refresh work from blocking first visible rows.

### Modified Capabilities

- `sql-first-card-runtime`: Tightens SQL-first Browser and queue projection read requirements so document counts and projection-backed queue readiness use declared read owners without stale local fallback.
- `sql-runtime-profile`: Extends profile evidence to hierarchy count reads, projection warmup, and all-row snapshot avoidance.

## Impact

- Affected Browser UI modules: `SRSBrowser.vue`, `BrowserHierarchy.vue`, `browserLoadDataRuntime.ts`, `browserDataSnapshots.ts`, hierarchy snapshot tests, and Browser grid/readiness lifecycle tests.
- Affected application read modules: `BrowserApplicationService`, `BrowserCardUniverseReadModule`, Browser query/read-model types, queue read-model readiness APIs, and queue count refresh flow.
- Affected backend/projection modules: backend Browser aggregate reads, SQL card-universe count queries, queue projection readiness/materialization flow, projection live identity events, and worker queue projection contracts.
- Documentation impact: update `ARCHITECTURE.md`, `CONTEXT.md` if terminology changes, and `docs/DDD_RESCAN_BACKLOG.md` after production code changes.
