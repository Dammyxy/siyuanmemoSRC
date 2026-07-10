const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readFile(rootDir, relativePath) {
  const absolute = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  return fs.readFileSync(absolute, 'utf8');
}

function matchesToken(text, token) {
  if (token instanceof RegExp) {
    return token.test(text);
  }
  return text.includes(token);
}

function formatToken(token) {
  return token instanceof RegExp ? token.toString() : JSON.stringify(token);
}

function includesAll(text, tokens) {
  return tokens.every((token) => matchesToken(text, token));
}

const runtimePaths = [
  {
    id: 'queue-projection',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['queue.projection.snapshot', 'queue.projection.rowsByIds', 'queue.projection.replace'],
        reason: 'queue projection RPC methods must stay in the shared backend contract',
      },
      {
        file: 'worker/bootstrap/rpc/BackendRpcRegistry.ts',
        tokens: ['BACKEND_QUEUE_PROJECTION_RPC_HANDLER_REGISTRATIONS'],
        reason: 'backend RPC registry must include the queue projection adapter registrations',
      },
      {
        file: 'worker/bootstrap/rpc/BackendQueueProjectionRpcAdapter.ts',
        tokens: ['queue.projection.snapshot', 'queue.projection.rowsByIds', 'queue.projection.replace', 'context.queueProjection.database'],
        reason: 'queue projection adapter must dispatch every queue projection RPC method to the worker runtime',
      },
      {
        file: 'worker/db/SqliteDatabaseService.ts',
        tokens: ['async queueProjectionSnapshot', 'WorkerQueueProjectionRuntime'],
        reason: 'worker database owner must expose projection commands and delegate the queue projection runtime',
      },
      {
        file: 'worker/queue-projection/WorkerQueueProjectionRuntime.ts',
        tokens: ['export class WorkerQueueProjectionRuntime', 'runTransaction(\'queue.projection.replace\''],
        reason: 'worker queue projection runtime must own projection read/hydrate/replace behavior',
      },
      {
        file: 'src/application/clients/SrsBackendClient.ts',
        tokens: ['async queueProjectionSnapshot', 'async queueProjectionRowsByIds', 'async queueProjectionReplace'],
        reason: 'application must use typed backend client methods instead of transport literals',
      },
      {
        file: 'src/application/commands/writerRelayCommandDispatcher.ts',
        tokens: ['command.method === \'queue.projection.replace\'', 'srsBackendClient.queueProjectionReplace'],
        reason: 'writer relay must own follower-origin projection replacement',
      },
      {
        file: 'src/application/services/UnifiedDataSourceManager.ts',
        tokens: ['public readQueueProjection', 'public repairQueueProjection', 'public observeQueueProjection'],
        reason: 'queue projection lifecycle read, repair, and observe must be exposed through the application manager port',
      },
      {
        file: 'src/core/queue/domain/BaseReviewQueue.ts',
        tokens: ['this.manager.readQueueProjection', 'type: \'snapshot\'', 'type: \'rows-by-id\'', 'QUEUE_PROJECTION_UNAVAILABLE'],
        reason: 'review queues must use passive lifecycle reads for backend projection or fail explicitly',
      },
    ],
  },
  {
    id: 'neural-roam-advance',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['neural-roam.advance', 'BackendNeuralRoamAdvanceResult', 'queueState'],
        reason: 'neural roam advance must declare queueState in the backend contract',
      },
      {
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['WorkerNeuralRoamAdvanceService', 'neuralRoam: this.neuralRoamRuntime'],
        reason: 'backend kernel must wire neural roam runtime into the RPC handler context',
      },
      {
        file: 'worker/bootstrap/rpc/BackendNeuralRoamRpcAdapter.ts',
        tokens: ['neural-roam.advance', 'context.neuralRoam.advance'],
        reason: 'neural roam adapter must dispatch neural-roam.advance to the worker runtime',
      },
      {
        file: 'worker/bootstrap/WorkerNeuralRoamAdvanceService.ts',
        tokens: ['export class WorkerNeuralRoamAdvanceService', 'async advance', 'queueState'],
        reason: 'worker must own the neural roam advance state transition',
      },
      {
        file: 'src/application/clients/SrsBackendClient.ts',
        tokens: ['async neuralRoamAdvance', 'validateNeuralRoamAdvanceResult', 'queueState'],
        reason: 'application client must reject advance results without backend queue state',
      },
      {
        file: 'src/application/ApplicationContext.ts',
        tokens: ['SiyuanNeuralRoamGraphQueryAdapter', 'createNeuralRoamGraphQuery', 'executeWriterRelayCommand'],
        reason: 'composition root must wire graph host effects and delegate writer relay dispatch for neural advance',
      },
      {
        file: 'src/application/commands/writerRelayCommandDispatcher.ts',
        tokens: ['command.method === \'neural-roam.advance\'', 'srsBackendClient.neuralRoamAdvance'],
        reason: 'writer relay dispatcher must route neural advance commands',
      },
      {
        file: 'src/application/services/UnifiedDataSourceManager.ts',
        tokens: [
          /public\s+(?:readonly\s+)?(?:async\s+neuralRoamAdvance|neuralRoamAdvance\s*=\s*async)/,
          'method: \'neural-roam.advance\'',
          'backend.neuralRoamAdvance',
        ],
        reason: 'UI/review code must enter neural advance through the application manager',
      },
      {
        file: 'src/application/adapters/UnifiedQueueStrategy.ts',
        tokens: ['nextFromNeuralRoamAdvance', 'handleNeuralRoamAdvanceFeedback', 'syncNeuralRoamQueueFromBackendState'],
        reason: 'review progression must consume backend advance before showing the next card',
      },
      {
        file: 'src/core/queue/domain/NeuralRoamQueue.ts',
        tokens: ['public async syncFromBackendState'],
        reason: 'renderer-local neural queue must expose an explicit backend state sync contract',
      },
    ],
  },
  {
    id: 'review-feedback',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['review.feedback', 'BackendReviewFeedbackRequest', 'BackendReviewFeedbackResult'],
        reason: 'review feedback must stay in the shared backend contract',
      },
      {
        file: 'worker/bootstrap/rpc/BackendRpcRegistry.ts',
        tokens: ['BACKEND_REVIEW_RPC_HANDLER_REGISTRATIONS'],
        reason: 'backend RPC registry must include the review adapter registrations',
      },
      {
        file: 'worker/bootstrap/rpc/BackendReviewRpcAdapter.ts',
        tokens: ['review.feedback', 'context.review.handleReviewFeedback'],
        reason: 'review adapter must dispatch review feedback to the review runtime',
      },
      {
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['reviewRuntime', 'review: this.reviewRuntime'],
        reason: 'backend kernel must wire review runtime into the RPC handler context',
      },
      {
        file: 'worker/db/SqliteDatabaseService.ts',
        tokens: ['async reviewFeedback', 'WorkerReviewFeedbackRuntime'],
        reason: 'worker database owner must expose review feedback and delegate the review runtime',
      },
      {
        file: 'worker/review/WorkerReviewFeedbackRuntime.ts',
        tokens: ['export class WorkerReviewFeedbackRuntime', 'WorkerReviewCardMutationPersistenceModule'],
        reason: 'review feedback runtime must delegate SQL mutation writes to the worker mutation module',
      },
      {
        file: 'worker/review/WorkerReviewCardMutationPersistenceModule.ts',
        tokens: ['export class WorkerReviewCardMutationPersistenceModule', 'runTransaction(\'review.feedback\''],
        reason: 'review feedback writes must be owned by the worker review transaction runtime',
      },
      {
        file: 'src/application/usecases/review/ReviewCommitUseCase.ts',
        tokens: ['review.feedback requires backend-worker ownership', 'srsBackend!.reviewFeedback'],
        reason: 'review commit use case must fail closed instead of local scheduler fallback',
      },
      {
        file: 'src/application/commands/writerRelayCommandDispatcher.ts',
        tokens: ['command.method === \'review.feedback\'', 'srsBackendClient.reviewFeedback'],
        reason: 'follower review feedback must route through writer relay',
      },
    ],
  },
  {
    id: 'autocard-decision-execute',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['autocard.decision.resolve', 'autocard.execute', 'BackendAutoCardDecisionResolveResult'],
        reason: 'AutoCard decision and execute RPCs must stay in the shared backend contract',
      },
      {
        file: 'worker/bootstrap/rpc/BackendRpcRegistry.ts',
        tokens: ['BACKEND_AUTOCARD_RPC_HANDLER_REGISTRATIONS'],
        reason: 'backend RPC registry must include AutoCard adapter registrations',
      },
      {
        file: 'worker/bootstrap/rpc/BackendAutoCardRpcAdapter.ts',
        tokens: ['autocard.decision.resolve', 'autocard.execute', 'context.autoCard'],
        reason: 'AutoCard adapter must dispatch decision and execute RPCs to the AutoCard runtime',
      },
      {
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['autoCard: {', 'database: this.deps.database', 'executeAutoCard: this.deps.executeAutoCard'],
        reason: 'backend kernel must wire AutoCard runtime into the RPC handler context',
      },
      {
        file: 'worker/db/SqliteDatabaseService.ts',
        tokens: ['async resolveAutoCardDecision', 'recordAutoCardExecuteOutcome'],
        reason: 'worker database owner must record AutoCard decision/execute diagnostics',
      },
      {
        file: 'src/application/handlers/AutoCardHandler.ts',
        tokens: ['method: \'autocard.decision.resolve\'', 'method: \'autocard.execute\'', 'resolveAutoCardDecisionCoreLocal'],
        reason: 'AutoCard handler must make local decision a named non-relay path only',
      },
      {
        file: 'src/application/commands/writerRelayCommandDispatcher.ts',
        tokens: ['command.method === \'autocard.decision.resolve\'', 'command.method === \'autocard.execute\''],
        reason: 'writer relay must support AutoCard decision and execute commands',
      },
    ],
  },
  {
    id: 'private-api',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['private.read.cards', 'private.command.execute', 'PrivateApiMutationRequest'],
        reason: 'private API read/mutation RPCs must stay in the shared backend contract',
      },
      {
        file: 'worker/bootstrap/rpc/BackendRpcRegistry.ts',
        tokens: ['BACKEND_PRIVATE_API_RPC_HANDLER_REGISTRATIONS'],
        reason: 'backend RPC registry must include private API adapter registrations',
      },
      {
        file: 'worker/bootstrap/rpc/BackendPrivateApiRpcAdapter.ts',
        tokens: ['BackendPrivateApiRuntime', 'private.read.cards', 'private.command.execute'],
        reason: 'private API adapter must dispatch private reads and commands',
      },
      {
        file: 'src/application/clients/SrsBackendClient.ts',
        tokens: ['async privateRead', 'async privateCommand'],
        reason: 'private API transport must stay behind SrsBackendClient',
      },
      {
        file: 'src/application/clients/PrivateApiClient.ts',
        tokens: ['export class PrivateApiClient', 'this.backendClient.privateRead', 'this.followerCommandClient.submitAndWait'],
        reason: 'private mutations must route through writer relay in follower mode',
      },
      {
        file: 'src/application/services/PrivateApiService.ts',
        tokens: ['export class PrivateApiService', 'capabilityResult', 'mutationResultsByIdempotencyKey'],
        reason: 'private API service must keep capability, audit, and idempotency boundaries',
      },
      {
        file: 'src/application/ApplicationContext.ts',
        tokens: ['PrivateApiClient', 'PrivateApiService', 'executeWriterRelayCommand'],
        reason: 'composition root must wire private API service and delegate relay dispatch',
      },
      {
        file: 'src/application/commands/writerRelayCommandDispatcher.ts',
        tokens: ['command.method === \'private.command.execute\''],
        reason: 'writer relay dispatcher must route private API commands',
      },
    ],
  },
  {
    id: 'browser-batch-mutation',
    status: 'active',
    anchors: [
      {
        file: 'src/application/queries/DataAccessFacade.ts',
        tokens: ['async batchUpdateCards', 'async batchDeleteCards', 'cardService.batchUpdateCardsWithoutEvents'],
        reason: 'Browser/card batch mutation must stay behind the application data router and card service',
      },
      {
        file: 'src/application/services/UnifiedDataSourceManager.ts',
        tokens: ['public async batchUpdateCards', 'router.batchUpdateCards', 'public async batchDeleteCards', 'router.batchDeleteCards'],
        reason: 'Browser batch mutation entrypoints must route through the current data router and notify through the manager',
      },
      {
        file: 'src/application/services/CardApplicationService.ts',
        tokens: ['async batchDeleteCards', 'async batchUpdateCardsWithoutEvents', 'persistChanges'],
        reason: 'card batch mutations must persist through CardApplicationService instead of UI/local storage writes',
      },
    ],
  },
  {
    id: 'source-existence-sweep',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['browser.sourceExistence.applySweepHost', 'browser.sourceExistence.applySweep', 'BackendSourceExistenceSweepApplyResult'],
        reason: 'source-existence sweep RPCs must stay in the shared backend contract',
      },
      {
        file: 'worker/bootstrap/rpc/BackendBrowserRpcAdapter.ts',
        tokens: ['browser.sourceExistence.applySweepHost', 'browser.sourceExistence.applySweep', 'applyBrowserSourceExistenceSweepHostWithChanges'],
        reason: 'browser adapter must dispatch source-existence sweep commands',
      },
      {
        file: 'worker/db/SqliteDatabaseService.ts',
        tokens: ['runTransaction(\'source-existence.sweep\'', 'updateSourceExistence', 'invalidateQueueProjectionsForSourceChanges'],
        reason: 'source-existence sweep must update SQL and projection invalidation in one worker transaction',
      },
      {
        file: 'src/application/services/BrowserApplicationService.ts',
        tokens: ['scheduleSourceExistenceSweepFromBackend', 'browser.sourceExistence.applySweepHost', 'ensure-writable.source-existence-sweep'],
        reason: 'Browser source-existence sweep must go through backend/writer relay instead of UI SQL or local patch writes',
      },
    ],
  },
  {
    id: 'sync-conflict-merge',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['sync.conflict.merge', 'BackendSyncConflictMergeRequest', 'BackendSyncConflictMergeResult'],
        reason: 'sync conflict merge must stay in the shared backend contract',
      },
      {
        file: 'worker/bootstrap/rpc/BackendRpcRegistry.ts',
        tokens: ['BACKEND_SYNC_RPC_HANDLER_REGISTRATIONS'],
        reason: 'backend RPC registry must include the sync adapter registrations',
      },
      {
        file: 'worker/bootstrap/rpc/BackendSyncRpcAdapter.ts',
        tokens: ['sync.conflict.merge', 'context.sync.database.mergeSyncConflictDatabases'],
        reason: 'sync adapter must dispatch sync conflict merge to the database owner',
      },
      {
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['sync: {', 'database: this.deps.database'],
        reason: 'backend kernel must wire sync runtime into the RPC handler context',
      },
      {
        file: 'worker/db/SqliteDatabaseService.ts',
        tokens: ['async mergeSyncConflictDatabases', 'runTransaction(\'sync.conflict.merge\'', 'invalidateQueueProjectionsForSyncConflictMerge'],
        reason: 'sync conflict merge must import cards/review events and invalidate projections in one SQL transaction',
      },
      {
        file: 'src/application/services/SyncConflictMergeApplicationService.ts',
        tokens: ['export class SyncConflictMergeApplicationService', 'mergeSyncConflicts'],
        reason: 'application conflict merge must be a thin command module over the backend owner',
      },
      {
        file: 'src/application/ApplicationContext.ts',
        tokens: ['mergeSyncConflictDatabasesNow', 'BACKEND_UNAVAILABLE: sync conflict merge requires SRS backend', 'new SyncConflictMergeApplicationService'],
        reason: 'composition root must fail closed and route sync conflict merge through backend worker',
      },
    ],
  },
  {
    id: 'external-srs-algorithms',
    status: 'deferred-foundation',
    anchors: [
      {
        file: 'src/application/services/external-srs/ExternalSrsAlgorithmRuntime.ts',
        tokens: ['ExternalSrsAlgorithmRuntimeAdapter', 'advisoryOnly: true', 'formalScheduleWrite: false'],
        reason: 'external SRS runtime must remain advisory-only foundation code',
      },
      {
        file: 'src/infrastructure/services/ExternalSrsAlgorithmFileHost.ts',
        tokens: ['SiyuanExternalSrsAlgorithmFileHost', '/api/file/readDir', 'getFile(this.resolvePluginDataPath'],
        reason: 'external SRS file host must only read user-controlled local files',
      },
      {
        file: 'src/infrastructure/persistence/sqlite/SqlExternalSrsAlgorithmRegistryRepository.ts',
        tokens: ['SqlExternalSrsAlgorithmRegistryRepository', 'EXTERNAL_SRS_ALGORITHM_ID_PREFIX', 'algorithm_registry'],
        reason: 'external SRS registry must only manage external:* metadata',
      },
      {
        file: 'ARCHITECTURE.md',
        tokens: ['ExternalSrsAlgorithmRuntime.ts', 'advisory-only', '不接管正式 FSRS v6 due 写入'],
        reason: 'architecture must document External SRS as foundation/deferred, not active scheduler ownership',
      },
      {
        file: 'docs/DDD_RESCAN_BACKLOG.md',
        tokens: ['External SRS', 'deferred', 'active runtime'],
        reason: 'debt ledger must keep External SRS deferred until composition and UI entrypoints exist',
      },
    ],
    absentAnchors: [
      {
        file: 'src/application/ApplicationContext.ts',
        tokens: ['ExternalSrsAlgorithmRuntime', 'SiyuanExternalSrsAlgorithmFileHost', 'SqlExternalSrsAlgorithmRegistryRepository'],
        reason: 'External SRS must not be accidentally claimed as active runtime without an explicit path update',
      },
    ],
  },
];

function evaluate(options = {}) {
  const rootDir = options.rootDir || root;
  const paths = options.runtimePaths || runtimePaths;
  const failures = [];

  for (const runtimePath of paths) {
    for (const anchor of runtimePath.anchors || []) {
      const text = readFile(rootDir, anchor.file);
      if (text == null) {
        failures.push(`${runtimePath.id}: ${anchor.file}: file missing (${anchor.reason})`);
        continue;
      }
      if (!includesAll(text, anchor.tokens || [])) {
        const missing = (anchor.tokens || []).filter((token) => !matchesToken(text, token));
        failures.push(`${runtimePath.id}: ${anchor.file}: missing ${missing.map((token) => formatToken(token)).join(', ')} (${anchor.reason})`);
      }
    }

    for (const anchor of runtimePath.absentAnchors || []) {
      const text = readFile(rootDir, anchor.file);
      if (text == null) {
        failures.push(`${runtimePath.id}: ${anchor.file}: file missing (${anchor.reason})`);
        continue;
      }
      const present = (anchor.tokens || []).filter((token) => matchesToken(text, token));
      if (present.length > 0) {
        failures.push(`${runtimePath.id}: ${anchor.file}: unexpected active-path token(s) ${present.map((token) => formatToken(token)).join(', ')} (${anchor.reason})`);
      }
    }
  }

  return failures;
}

function run() {
  const failures = evaluate();
  if (failures.length > 0) {
    console.error('Backend runtime path check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Backend runtime path check passed.');
}

if (require.main === module) {
  run();
}

module.exports = {
  evaluate,
  run,
  runtimePaths,
};
