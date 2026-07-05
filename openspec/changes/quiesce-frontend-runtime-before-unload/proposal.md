# Change: Quiesce frontend runtime before plugin unload

## Why

During SiYuan shutdown or update install, the kernel companion can be unloaded before the renderer page fully disappears. SiYuanMemo's frontend runtime kept heartbeat, writer relay polling, and RPC WebSocket push callbacks alive during that window, producing repeated `Plugin not loaded`, WebSocket reconnect, `push relay degraded`, and writer lease observe warnings.

## What Changes

- Add an explicit frontend runtime unload quiesce step before normal disposal work.
- Stop heartbeat, relay polling, continuation timers, visibility refresh, push relay subscription, and runtime registry entry before Review truth flush and backend worker teardown continue.
- Keep final writer lease release in `dispose()` best-effort, but prevent shutdown-time background callbacks from issuing new kernel RPC calls.
- Preserve normal startup, ownership refresh, writer contention, and relay behavior outside unload.

## Impact

- Shutdown/update path becomes quiet and does not fight SiYuan's plugin unload/reload flow.
- Review data durability model is unchanged.
- No native DB owner, kernel-side DB writer, or fallback path is introduced.
