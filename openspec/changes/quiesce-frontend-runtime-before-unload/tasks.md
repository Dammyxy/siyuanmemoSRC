## 1. Diagnosis

- [x] 1.1 Capture live shutdown/update symptom from logs
- [x] 1.2 Trace `onunload -> ApplicationContext.dispose -> FrontendInstanceRuntime` lifecycle
- [x] 1.3 Identify renderer background heartbeat/relay callbacks as post-unload RPC source

## 2. Runtime Fix

- [x] 2.1 Add explicit frontend runtime unload quiesce boundary
- [x] 2.2 Call quiesce at the start of `ApplicationContext.dispose()`
- [x] 2.3 Stop heartbeat, relay polling, push relay callbacks, continuation timers, visibility refresh, and runtime registry entry
- [x] 2.4 Preserve final best-effort writer lease release in normal dispose
- [x] 2.5 Keep normal non-unload ownership refresh behavior unchanged

## 3. Validation

- [x] 3.1 Add focused regression for unload quiescing heartbeat/relay/push callbacks
- [x] 3.2 Update existing ApplicationContext unload disposal regression
- [x] 3.3 Run focused FrontendInstanceRuntime/ApplicationContext tests
- [x] 3.4 Update architecture/backlog docs
- [x] 3.5 Run boundary/build/OpenSpec validation
