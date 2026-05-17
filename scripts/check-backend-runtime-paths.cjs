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

function includesAll(text, tokens) {
  return tokens.every((token) => text.includes(token));
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
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['case \'queue.projection.snapshot\'', 'case \'queue.projection.rowsByIds\'', 'case \'queue.projection.replace\''],
        reason: 'backend kernel must dispatch every queue projection RPC method',
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
        file: 'src/application/ApplicationContext.ts',
        tokens: ['command.method === \'queue.projection.replace\'', 'srsBackendClient.queueProjectionReplace'],
        reason: 'writer relay must own follower-origin projection replacement',
      },
      {
        file: 'src/application/services/UnifiedDataSourceManager.ts',
        tokens: ['public async readQueueProjectionSnapshot', 'public async getQueueProjectionCardsBySnapshotIds', 'public async materializeQueueProjection'],
        reason: 'queue projection must be exposed as the application manager port',
      },
      {
        file: 'src/core/queue/domain/BaseReviewQueue.ts',
        tokens: ['readQueueProjectionSnapshot', 'getQueueProjectionCardsBySnapshotIds', 'QUEUE_PROJECTION_UNAVAILABLE'],
        reason: 'review queues must read backend projection or fail explicitly',
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
        tokens: ['WorkerNeuralRoamAdvanceService', 'case \'neural-roam.advance\'', 'this.neuralRoamRuntime.advance'],
        reason: 'backend kernel must dispatch neural-roam.advance to the worker runtime',
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
        tokens: ['SiyuanNeuralRoamGraphQueryAdapter', 'command.method === \'neural-roam.advance\'', 'srsBackendClient.neuralRoamAdvance'],
        reason: 'composition root must wire graph host effects and writer relay for neural advance',
      },
      {
        file: 'src/application/services/UnifiedDataSourceManager.ts',
        tokens: ['public async neuralRoamAdvance', 'method: \'neural-roam.advance\'', 'backend.neuralRoamAdvance'],
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
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['case \'review.feedback\'', 'handleReviewFeedback'],
        reason: 'backend kernel must dispatch review feedback',
      },
      {
        file: 'worker/db/SqliteDatabaseService.ts',
        tokens: ['async reviewFeedback', 'WorkerReviewFeedbackRuntime'],
        reason: 'worker database owner must expose review feedback and delegate the review runtime',
      },
      {
        file: 'worker/review/WorkerReviewFeedbackRuntime.ts',
        tokens: ['export class WorkerReviewFeedbackRuntime', 'runTransaction(\'review.feedback\''],
        reason: 'review feedback writes must be owned by the worker review transaction runtime',
      },
      {
        file: 'src/application/usecases/review/ReviewCommitUseCase.ts',
        tokens: ['review.feedback requires backend-worker ownership', 'srsBackend!.reviewFeedback'],
        reason: 'review commit use case must fail closed instead of local scheduler fallback',
      },
      {
        file: 'src/application/ApplicationContext.ts',
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
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['case \'autocard.decision.resolve\'', 'case \'autocard.execute\''],
        reason: 'backend kernel must dispatch AutoCard decision and execute',
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
        file: 'src/application/ApplicationContext.ts',
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
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['case \'private.command.execute\'', 'handlePrivateRead', 'handlePrivateCommand'],
        reason: 'backend kernel must dispatch private reads and commands',
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
        tokens: ['PrivateApiClient', 'PrivateApiService', 'command.method === \'private.command.execute\''],
        reason: 'composition root must wire private API service and relay command',
      },
    ],
  },
  {
    id: 'ai-backend-session-job',
    status: 'active',
    anchors: [
      {
        file: 'packages/contracts/src/backend-rpc.ts',
        tokens: ['ai.session.create', 'ai.prompt.execute', 'job.cancel', 'BackendAiJobRecord'],
        reason: 'AI session/stream/job RPCs must stay in the shared backend contract',
      },
      {
        file: 'worker/bootstrap/BackendKernel.ts',
        tokens: ['BackendJobRuntime', 'case \'ai.session.create\'', 'case \'ai.prompt.execute\'', 'case \'job.cancel\''],
        reason: 'backend kernel must dispatch AI session, prompt, stream, and job methods',
      },
      {
        file: 'worker/bootstrap/BackendJobRuntime.ts',
        tokens: ['export class BackendJobRuntime', 'createSession', 'executePrompt', 'cancelJob'],
        reason: 'backend job runtime must own session/job state transitions',
      },
      {
        file: 'src/application/clients/SrsBackendClient.ts',
        tokens: ['async createAiSession', 'async executeAiPrompt', 'async cancelAiJob'],
        reason: 'application must use typed AI backend client methods',
      },
      {
        file: 'src/application/services/AIBackendSessionService.ts',
        tokens: ['export class AIBackendSessionService', 'createSession', 'executePrompt'],
        reason: 'AI workbench must enter backend runtime through an application service',
      },
      {
        file: 'src/application/services/AIWorkbenchService.ts',
        tokens: ['backendSessionService', 'createSession', 'updateSession', 'cancelSession'],
        reason: 'AI workbench must wire backend session hooks into active session lifecycle',
      },
      {
        file: 'src/application/ApplicationContext.ts',
        tokens: ['new AIBackendSessionService', 'KernelAINetworkProxyAdapter', 'command.method === \'ai.session.create\''],
        reason: 'composition root must wire AI backend session service and relay session commands',
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
        const missing = (anchor.tokens || []).filter((token) => !text.includes(token));
        failures.push(`${runtimePath.id}: ${anchor.file}: missing ${missing.map((token) => JSON.stringify(token)).join(', ')} (${anchor.reason})`);
      }
    }

    for (const anchor of runtimePath.absentAnchors || []) {
      const text = readFile(rootDir, anchor.file);
      if (text == null) {
        failures.push(`${runtimePath.id}: ${anchor.file}: file missing (${anchor.reason})`);
        continue;
      }
      const present = (anchor.tokens || []).filter((token) => text.includes(token));
      if (present.length > 0) {
        failures.push(`${runtimePath.id}: ${anchor.file}: unexpected active-path token(s) ${present.map((token) => JSON.stringify(token)).join(', ')} (${anchor.reason})`);
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
