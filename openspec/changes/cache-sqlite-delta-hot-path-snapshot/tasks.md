## 1. Hot Snapshot Cache

- [x] 1.1 Add a private append hot-path snapshot cache to `SqliteDeltaCheckpointLayer`.
- [x] 1.2 Update cache after successful append writes and clear it on checkpoint/repair/recovery/reset paths.

## 2. Regression Coverage

- [x] 2.1 Cover consecutive committed transactions avoiding repeated manifest `readJSON` reconstruction.
- [x] 2.2 Cover invalidation paths preserving cold persisted reads and fail-closed recovery behavior.

## 3. Validation

- [x] 3.1 Run focused SQLite delta and Review feedback storage tests.
- [x] 3.2 Run OpenSpec validation, boundary checks, build, and update debt ledger.
