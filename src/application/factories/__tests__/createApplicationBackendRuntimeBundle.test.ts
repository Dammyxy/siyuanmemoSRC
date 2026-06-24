import { describe, expect, it, vi } from 'vitest';
import { createApplicationBackendRuntimeBundle } from '../createApplicationBackendRuntimeBundle';

const runtimeBundleMocks = vi.hoisted(() => ({
  backendClients: [] as Array<{
    options: Record<string, unknown>;
    loadDatabase: ReturnType<typeof vi.fn>;
    schedulePendingReviewTruthFlush: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  frontendRuntimes: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    getMode: ReturnType<typeof vi.fn>;
    getInstanceId: ReturnType<typeof vi.fn>;
    getRuntimeScopeId: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  transports: [] as Array<{
    options: Record<string, unknown>;
    dispose: ReturnType<typeof vi.fn>;
    getDiagnostics: ReturnType<typeof vi.fn>;
  }>,
  riffAdapter: {
    getRiffCardsByBlockIDs: vi.fn(async () => []),
    getRiffNewCards: vi.fn(async () => []),
    getRiffCards: vi.fn(async () => []),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => runtimeBundleMocks.logger,
}));

vi.mock('@/utils/runtimePerformanceDiagnostics', () => ({
  measureRuntimePerformance: async (_category: string, _name: string, fn: () => unknown) => fn(),
}));

vi.mock('@/application/backendMigration/runtimePolicy', () => ({
  collectBackendMigrationRuntimeEnv: vi.fn(() => ({})),
  resolveBackendMigrationRuntimePolicy: vi.fn(() => ({
    flags: {
      backendWorker: true,
      writerLeaseGuard: true,
      autoCardDecisionRelay: true,
      kernelTransactionIngest: true,
      privateApi: true,
      aiBackendRuntime: true,
    },
    capabilities: {
      backendWorkerAvailable: true,
      writerRelayRuntimeEnabled: true,
      writerRelayRequiredForBackendWrites: true,
      reviewFeedbackWriteEnabled: true,
      autoCardExecuteWriteEnabled: true,
      autoCardDecisionBackendEnabled: true,
      kernelTransactionIngestEnabled: true,
      privateApiReadEnabled: true,
      privateApiMutationEnabled: true,
      aiBackendSessionEnabled: true,
    },
    behavior: {},
  })),
}));

vi.mock('@/application/factories/truthDeviceIdentity', () => ({
  resolveTruthDeviceIdentity: vi.fn(async () => ({
    deviceId: 'truth-device-1',
    source: 'local-store',
    localStatePath: 'truth-device-id.v1.json',
    error: null,
  })),
}));

vi.mock('@/application/clients/BrowserSrsBackendWorkerTransport', () => ({
  BrowserSrsBackendWorkerTransport: vi.fn().mockImplementation(function BrowserSrsBackendWorkerTransport(
    this: Record<string, unknown>,
    options: unknown,
  ) {
    this.options = options;
    this.dispose = vi.fn();
    this.getDiagnostics = vi.fn(() => ({ health: 'healthy' }));
    runtimeBundleMocks.transports.push(this as never);
  }),
}));

vi.mock('@/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter', () => ({
  XiuyuanSyncSiyuanAdapter: vi.fn().mockImplementation(function XiuyuanSyncSiyuanAdapter(
    this: Record<string, unknown>,
  ) {
    this.getRiffCardsByBlockIDs = runtimeBundleMocks.riffAdapter.getRiffCardsByBlockIDs;
    this.getRiffNewCards = runtimeBundleMocks.riffAdapter.getRiffNewCards;
    this.getRiffCards = runtimeBundleMocks.riffAdapter.getRiffCards;
  }),
}));

vi.mock('@/application/clients/SrsBackendClient', () => ({
  SrsBackendClient: vi.fn().mockImplementation(function SrsBackendClient(
    this: Record<string, unknown>,
    transport: unknown,
    options: Record<string, unknown>,
  ) {
    this.transport = transport;
    this.options = options;
    this.loadDatabase = vi.fn(async () => undefined);
    this.schedulePendingReviewTruthFlush = vi.fn(async () => true);
    this.dispose = vi.fn();
    runtimeBundleMocks.backendClients.push(this as never);
  }),
}));

vi.mock('@/application/clients/FrontendInstanceRuntime', () => ({
  FrontendInstanceRuntime: vi.fn().mockImplementation(function FrontendInstanceRuntime(
    this: Record<string, unknown>,
    kernelSidecarClient: unknown,
    options: Record<string, unknown>,
  ) {
    this.kernelSidecarClient = kernelSidecarClient;
    this.options = options;
    this.start = vi.fn(async () => undefined);
    this.getMode = vi.fn(() => 'writer');
    this.getInstanceId = vi.fn(() => 'writer-instance-1');
    this.getRuntimeScopeId = vi.fn(() => 'scope-1');
    this.dispose = vi.fn(async () => undefined);
    runtimeBundleMocks.frontendRuntimes.push(this as never);
  }),
}));

vi.mock('@/application/clients/FollowerCommandClient', () => ({
  FollowerCommandClient: vi.fn().mockImplementation(function FollowerCommandClient(
    this: Record<string, unknown>,
    kernelSidecarClient: unknown,
  ) {
    this.kernelSidecarClient = kernelSidecarClient;
  }),
}));

function createRuntimeBundleOptions() {
  return {
    config: {
      plugin: { isBrowser: true, isMobile: false },
      frontendKind: 'desktop',
    },
    fileService: {} as never,
    unifiedDataSourceManager: {
      resolveNeuralRoamNodeType: vi.fn(() => 'document'),
      resolveNeuralRoamNodePriority: vi.fn(() => 0),
    } as never,
    executeAutoCard: vi.fn(),
    executeAutoCardBatch: vi.fn(),
    executeWriterRelayCommand: vi.fn(async () => ({ ok: true })),
    kernelSidecarClient: {} as never,
    createBlockExistenceSiyuanPort: () => ({
      sql: vi.fn(async () => []),
    }),
    createNeuralRoamGraphQuery: () => ({
      query: vi.fn(async () => ({ nodes: [], edges: [] })),
    }),
    resolveKernelWriterLeaseInstanceId: () => 'writer-instance-1',
    resolveKernelWriterLeaseTtlMs: () => 5000,
    resolveSiyuanBackendContainer: () => 'browser',
    resolveWindowLocationHref: () => 'http://localhost/',
    resolveNavigatorUserAgent: () => 'vitest',
    resolveDocumentBodyClass: () => '',
    readViteEnv: () => ({}),
    readProcessEnv: () => ({}),
  };
}

describe('createApplicationBackendRuntimeBundle', () => {
  it('keeps frontend writer runtime available after truth device identity resolves', async () => {
    runtimeBundleMocks.backendClients.length = 0;
    runtimeBundleMocks.frontendRuntimes.length = 0;
    runtimeBundleMocks.transports.length = 0;
    Object.values(runtimeBundleMocks.logger).forEach((fn) => fn.mockClear());

    const bundle = await createApplicationBackendRuntimeBundle(createRuntimeBundleOptions());

    expect(bundle.backendStartupError).toBeNull();
    expect(bundle.srsBackendClient).toBeTruthy();
    expect(bundle.frontendInstanceRuntime).toBeTruthy();
    expect(bundle.followerCommandClient).toBeTruthy();
    expect(runtimeBundleMocks.frontendRuntimes).toHaveLength(1);
    expect(runtimeBundleMocks.frontendRuntimes[0].start).toHaveBeenCalledTimes(1);
    expect(runtimeBundleMocks.backendClients[0].options.reviewTruthFlush).toMatchObject({
      deviceId: 'truth-device-1',
    });
    expect(runtimeBundleMocks.backendClients[0].schedulePendingReviewTruthFlush)
      .toHaveBeenCalledWith('startup');
    expect(runtimeBundleMocks.logger.warn).not.toHaveBeenCalledWith(
      '[ApplicationContext] Frontend instance runtime unavailable; backend write families fail closed with explicit unavailable',
      expect.anything(),
    );
  });

  it('uses direct Riff block reads for scoped Xiuyuan backend host requests', async () => {
    runtimeBundleMocks.backendClients.length = 0;
    runtimeBundleMocks.frontendRuntimes.length = 0;
    runtimeBundleMocks.transports.length = 0;
    runtimeBundleMocks.riffAdapter.getRiffCardsByBlockIDs.mockReset();
    runtimeBundleMocks.riffAdapter.getRiffNewCards.mockReset();
    runtimeBundleMocks.riffAdapter.getRiffCards.mockReset();
    runtimeBundleMocks.riffAdapter.getRiffCardsByBlockIDs.mockResolvedValue([
      { id: 'block-a', content: 'A' },
      { id: 'block-b', content: 'B' },
    ]);

    await createApplicationBackendRuntimeBundle(createRuntimeBundleOptions());
    const transportOptions = runtimeBundleMocks.transports[0].options as {
      hostEffects: {
        readXiuyuanRiffFacts: (request: unknown) => Promise<unknown>;
      };
    };

    const result = await transportOptions.hostEffects.readXiuyuanRiffFacts({
      requestId: 'riff-read-scoped',
      mode: 'incremental',
      deckId: 'deck-a',
      scope: {
        blockIds: [' block-a ', 'block-a', 'block-b'],
      },
    });

    expect(runtimeBundleMocks.riffAdapter.getRiffCardsByBlockIDs).toHaveBeenCalledWith(['block-a', 'block-b']);
    expect(runtimeBundleMocks.riffAdapter.getRiffNewCards).not.toHaveBeenCalled();
    expect(runtimeBundleMocks.riffAdapter.getRiffCards).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'ready',
      blocks: [
        { id: 'block-a', content: 'A' },
        { id: 'block-b', content: 'B' },
      ],
    });
  });

  it('passes AutoCard batch execution host effect into the backend worker transport', async () => {
    runtimeBundleMocks.backendClients.length = 0;
    runtimeBundleMocks.frontendRuntimes.length = 0;
    runtimeBundleMocks.transports.length = 0;
    const options = createRuntimeBundleOptions();

    await createApplicationBackendRuntimeBundle(options);

    const transportOptions = runtimeBundleMocks.transports[0].options as {
      hostEffects: {
        executeAutoCardBatch?: (request: unknown) => Promise<unknown>;
      };
    };
    expect(transportOptions.hostEffects.executeAutoCardBatch).toBe(options.executeAutoCardBatch);
  });
});
