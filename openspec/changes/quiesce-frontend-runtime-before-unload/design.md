# Design

## Context

The live log shows the kernel companion RPC endpoint returning `Plugin not loaded` and WebSocket connections failing after SiYuan begins shutdown/update. That is expected from SiYuan's side: the kernel plugin is going away. The bug is that the renderer-side `FrontendInstanceRuntime` still treats heartbeat, visibility refresh, writer relay polling, and push relay reconnect callbacks as live background work.

## Decision

Introduce `FrontendInstanceRuntime.prepareForUnload()` as an explicit quiesce boundary. `ApplicationContext.dispose()` calls it at the start of disposal, before bounded Review truth flush and backend worker disposal. Quiesce stops timers/subscriptions synchronously and marks the runtime as unloading; background ownership work for heartbeat/visibility returns a local snapshot instead of issuing fresh RPC calls.

`dispose()` still performs final best-effort writer lease release when possible. This preserves the existing lease contract without letting background loops continue after SiYuan has unloaded the kernel companion.

## Non-goals

- No change to Review commit/truth durability.
- No kernel-side DB writer.
- No native SQLite/WAL migration.
- No broad suppression of real runtime RPC errors outside the unload state.
