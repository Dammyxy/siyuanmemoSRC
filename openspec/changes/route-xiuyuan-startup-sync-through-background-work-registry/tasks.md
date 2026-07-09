## 1. Contract

- [x] 1.1 Extend Kernel Companion Background Work kinds and diagnostics for `xiuyuan-startup-sync`
- [x] 1.2 Add registry tests proving Xiuyuan startup diagnostics are recorded

## 2. Xiuyuan Startup Sync

- [x] 2.1 Inject/pass the shared background work registry to `XiuyuanSyncService`
- [x] 2.2 Replace startup Promise helper with registry submission
- [x] 2.3 Preserve full-sync due behavior
- [x] 2.4 Preserve startup incremental request shape with `source: 'startup'` and `persistIdleCheckpoint: false`
- [x] 2.5 Keep startup non-blocking

## 3. Shutdown And Wiring

- [x] 3.1 Defer accepted startup sync when the shared registry shuts down before execution
- [x] 3.2 Cancel running startup sync lifecycle state on service stop and suppress late completion
- [x] 3.3 Wire `ApplicationContext` through `createAutoCardKernelXiuyuanServiceBundle` to the shared registry
- [x] 3.4 Update architecture/context/backlog docs

## 4. Validation

- [x] 4.1 Run focused registry, Xiuyuan sync, factory, and ApplicationContext wiring tests
- [x] 4.2 Run hidden-fallback, boundary, OpenSpec, diff, and build validation
