## REMOVED Requirements

### Requirement: Xiuyuan sync worker family delegates through a narrow runtime
**Reason**: The Xiuyuan continuous-sync worker family is retired rather than preserved behind a narrower runtime.
**Migration**: Explicit Native Riff import/adoption application Modules own preview/apply behavior and use ordinary SiYuanMemo persistence ownership.

### Requirement: Xiuyuan sync extraction preserves existing authority boundaries
**Reason**: The `xiuyuan.sync.execute` RPC, Native Riff reconciliation planner, checkpoint state, and sync idempotency contract are removed.
**Migration**: Remove all RPC clients, catalogs, handlers, planner/runtime code, and callers in the same cutover.

### Requirement: Xiuyuan sync extraction excludes unrelated runtime families
**Reason**: No Xiuyuan sync worker runtime remains after retirement.
**Migration**: Keep unrelated worker runtime families unchanged.

