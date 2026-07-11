# Worker Storage Authority Inventory

This inventory is the Section 6 cutover map. Production mutations must end at the Worker command boundary. Renderer and kernel-companion code may transport commands or execute typed host file effects, but may not become storage authorities.

## Acceptance Checklist

| Mutation family | Active request path | Current storage writer | Remaining legacy path | Cutover |
| --- | --- | --- | --- | --- |
| Review answer | `ReviewCommitUseCase` -> `SrsBackendClient` -> `review.feedback` -> `BackendReviewRpcAdapter` -> `WorkerReviewFeedbackRuntime` -> `WorkerReviewCardMutationPersistenceModule` | Worker SQL transaction, atomic delta mutation, Review Ledger fact, durability receipt, then truth promotion | No renderer Review SQL or Review truth fallback is allowed | 6.2 |
| Review session answer | `WorkerReviewSessionQueueRuntime` -> `review.session.feedback` -> `WorkerReviewSessionRuntime` -> Review feedback runtime | Worker | Renderer only applies returned card and queue-impact evidence to memory | 6.2 |
| Review undo | `WorkerReviewSessionQueueRuntime.undoLast` -> `review.session.undo` -> `WorkerReviewSessionRuntime` | Worker undo journal and Worker Review mutation path; journaled receipt is preserved through the renderer adapter | In-memory session rollback is not durability authority | 6.2 complete |
| Review queue impact | Review feedback transaction -> `WorkerReviewFeedbackRuntime.buildReviewFeedbackQueueImpact` -> returned receipt/evidence | Worker owns formal queue effect; renderer hot-patches or refreshes projection from returned evidence | Renderer queue patch must not persist independently | 6.2 |
| Card/Schedule formal update | Card and scheduler application services -> `WorkerCardScheduleUpdateAdapter` -> local `SrsBackendClient.cardScheduleBatchUpdate()` or follower `FollowerCommandClient` -> writer relay -> `card.schedule.batchUpdate` -> `BackendCardRpcAdapter` | Worker SQL transaction, complete Card/Schedule delta mutation, journaled durability receipt, then ordered truth promotion | No renderer Card/Schedule repository upsert, whole-store persist, or local fallback remains; Queue and Card CRUD stay separate 6.4/6.5 families | 6.3 complete |
| Queue membership/priority | Queue domain `save()` -> `QueuePersistenceService` -> local `SrsBackendClient.queueStateBatchMutate()` or follower `FollowerCommandClient` -> writer relay -> `queue.state.batchMutate` -> `BackendQueueRpcAdapter` | Worker SQL transaction, complete `queue_state` delta mutation, journaled durability receipt, then ordered Queue truth promotion | Renderer keeps only an in-memory read cache after Worker acknowledgement; `SqlQueueStateRepository` is migration-only and is not composed into production runtime | 6.4 complete |
| Card CRUD | `CreateCardUseCase`, `UpdateCardUseCase`, `DeleteCardUseCase`, `DeleteCardsUseCase`, `DeleteFSRSCardUseCase`, `UpdateFSRSCardUseCase`, `CardApplicationService` | Renderer `UnifiedStorageManager`; deprecated `saveCards()` can force whole-store save | Replace CRUD writes with typed Worker commands and explicit unavailable results | 6.5 |
| Import/migration | `SqliteMigrationService`, Native Riff import/adoption modules, startup legacy scheduling normalization | Renderer migration SQL and whole-store import; some domain-sync imports already Worker-owned | Convert remaining bulk operations to idempotent Worker commands with progress | 6.6 |
| Repair/reconciliation | Startup orphan-card and invalid-date repair; `domainSync.repair.apply`; `sync.conflict.merge`; `storage.projection.rebuild` | Mixed: startup repairs remain renderer-owned; domain-sync and projection rebuild are Worker-owned | Move startup/bulk repairs to Worker commands; keep projection rebuild derived-only | 6.6 |
| Renderer projection bootstrap | `ApplicationContext.create` -> renderer `SqliteDatabaseService` and SQL repositories | Renderer projection runtime | Remove write-capable renderer SQL composition after family cutovers | 6.7 |
| Whole-store bridge | `ApplicationContext` persistence callback -> `SqlUnifiedStorageRepository.saveStore`; `BackendCoreRpcClient.persistDatabase` -> `db.persist` | Renderer whole-store snapshot or explicit projection persist | Delete active whole-database durability contract | 6.7 |
| Shutdown | `ApplicationContext.dispose` -> `UnifiedStorageManager.save()` | Renderer whole-store save | Replace with Worker quiescence/receipt coordination only | 6.7 |
| Canonical truth publication | journaled receipts -> `WorkerTruthPromotionModule` -> `WorkerTruthPublicationModule` -> truth stores/generation fence | Worker only | No renderer or kernel-companion truth/manifest writer | Complete in Section 4/5 |
| Kernel companion | writer relay, wake/status, typed host effects | No database or truth ownership | Boundary guard must remain zero-tolerance | 6.8 |

## Enforced Legacy Allowlist

`scripts/check-storage-writer-authority.cjs` exports `legacyWriterInventory`. Every temporary exception records its file, writer kind, mutation family, exact site, occurrence budget, and removal task. The check fails if another renderer SQL, truth, manifest, whole-store, or `db.persist` writer appears.

The allowlist is a shrinking migration ledger, not permission to add compatibility or dual-write behavior. Each Section 6 slice removes its entries in the same change that enables Worker authority.

## Resume Evidence

- Section 1-5 contracts and canonical truth infrastructure are implemented.
- Review commands already expose journaled durability receipts and Worker-owned truth promotion.
- Remaining renderer ownership is concentrated in the allowlisted whole-store paths, Card CRUD calls into `UnifiedStorageManager`, and startup migration/repair.
- Card/Schedule formal updates now use one Worker command/receipt path in writer and follower windows; unavailable Worker or relay authority fails closed.
- Queue formal state now uses one Worker command/receipt path in writer and follower windows. Queue truth promotion encodes exact opaque `queue_state` set/delete values instead of publishing empty member changesets.
- Error paths remain fail-closed: unavailable Worker authority must not fall back to renderer, kernel-companion, or local snapshot writes.
