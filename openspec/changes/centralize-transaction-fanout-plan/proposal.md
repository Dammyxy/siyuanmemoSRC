## Why

SiYuanMemo currently decides transaction fan-out in several places, so excerpt-created transactions can wake AutoCard, Native Riff sync, and document-tree refresh with different rules. This change centralizes the policy decision so plugin-authored excerpt writes can be suppressed, scoped, or allowed consistently without moving execution ownership.

## What Changes

- Add a shared transaction fan-out coordinator that turns a raw transaction batch plus short-lived provenance into a plan.
- Add short-lived transaction provenance for plugin-authored progressive excerpt materialization.
- Route frontend WebSocket dispatch through the fan-out plan while leaving handlers responsible for execution.
- Route backend worker kernel transaction action collection through the same fan-out policy.
- Suppress AutoCard candidate scheduling for provenance-matched plugin-authored excerpt writes, without cancelling unrelated pending candidates.
- Preserve Native Riff upsert block IDs through the action pump and Xiuyuan sync request.
- Prefer block-scoped native Riff reads when a sync request includes `scope.blockIds`.
- Keep document-tree refresh allowed for excerpt-created docs.
- Update the legacy Native Riff transaction trigger to use the same fan-out plan.

## Capabilities

### New Capabilities
- `transaction-fanout-plan`: Shared policy planning for transaction consumers, provenance suppression, and scoped Native Riff synchronization.

### Modified Capabilities
- None.

## Impact

- Affected runtime paths: `TransactionWebSocketService`, `KernelTransactionIngestHandler`, `KernelTransactionActionPump`, `NativeRiffSyncTriggerHandler`, `AutoCardHandler`, `WorkerKernelTransactionRuntime`, `XiuyuanSyncService`, `XiuyuanSyncSiyuanAdapter`, progressive excerpt services.
- Affected contracts: local TypeScript interfaces for transaction fan-out plans, provenance snapshots, Native Riff upsert handler parameters, and Xiuyuan incremental sync options.
- No execution ownership moves: AutoCard, DocTree, Kernel action pump, and Xiuyuan sync remain execution owners for their domains.
