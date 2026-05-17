# Backend Worker Liveness Manual Smoke

Date: 2026-05-18

Purpose: verify `stabilize-backend-worker-liveness` in a live SiYuan runtime where desktop background behavior can freeze, throttle, or terminate the renderer-owned backend Worker.

## Preconditions

- Plugin rebuilt and reloaded in SiYuan.
- Backend worker and writer relay feature gates enabled.
- Two windows or surfaces connected to the same SiYuan kernel port:
  - Window A: expected writer / primary app.
  - Window B: follower review or Browser surface.

## Steps

1. Open Review or a writer-owned backend action in Window A and confirm it holds writer lease.
2. Open Window B and confirm it observes follower mode.
3. Background Window A long enough to trigger browser Worker freeze/termination suspicion.
4. From Window B, trigger a writer-relayed action such as Review feedback or NeuralRoam next.
5. Observe result:
   - Expected healthy path: Window A Worker answers or restarts, command completes once.
   - Expected unhealthy path: Window A releases or stops renewing writer lease; Window B receives bounded `BACKEND_UNAVAILABLE` or a healthy writer takes over.
6. Confirm no infinite spinner, no follower-local write, no duplicate review feedback/projection mutation.
7. Capture diagnostics from logs:
   - Worker generation / restart count.
   - Startup/request/probe timeout category if any.
   - Writer lease owner before and after backgrounding.
   - Relay command id and terminal result.

## Pass Criteria

- Every backend command has bounded success or explicit unavailable result.
- Dead/unhealthy writer Worker does not keep executing or renewing writer lease.
- Kernel companion still reports `writesSiyuanMemoDb: false`; no DB write moves into `kernel.js`.

## Follow-Up If Failing

- If valid long-running backend commands time out, add per-method timeout metadata.
- If background throttling delays probes but not real requests, tune probe cadence separately from request deadlines.
- If a lease remains held by a dead Worker until TTL, inspect `FrontendInstanceRuntime` health provider wiring and release path logs.
