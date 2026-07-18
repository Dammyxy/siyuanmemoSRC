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
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  resolveTruthDeviceIdentity: vi.fn(async () => ({
    status: 'verified',
    deviceId: 'truth-device-1',
    identityEpoch: 'epoch-1',
    source: 'installation-authority',
    authorityRevision: 1,
    localStatePath: '/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json',
    persisted: true,
    cacheUpdated: false,
    cacheDiagnostics: [],
    installationEvidence: null,
    hostFingerprintMatch: 'match',
    error: null,
  })),
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
  resolveTruthDeviceIdentity: runtimeBundleMocks.resolveTruthDeviceIdentity,
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
      query: vi.fn(async (request: { blockId: string }) => ({
        status: 'found' as const,
        blockId: request.blockId,
        data: { nodes: [], edges: [] },
        error: null,
      })),
    }),
    resolveKernelWriterLeaseInstanceId: () => 'writer-instance-1',
    resolveKernelWriterLeaseTtlMs: () => 5000,
    resolveSiyuanBackendContainer: () => 'browser',
    resolveSiyuanSystemId: () => 'host-system-1',
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
    runtimeBundleMocks.resolveTruthDeviceIdentity.mockClear();

    const options = createRuntimeBundleOptions();
    const bundle = await createApplicationBackendRuntimeBundle(options);

    expect(bundle.backendStartupError).toBeNull();
    expect(bundle.srsBackendClient).toBeTruthy();
    expect(bundle.frontendInstanceRuntime).toBeTruthy();
    expect(bundle.followerCommandClient).toBeTruthy();
    expect(runtimeBundleMocks.frontendRuntimes).toHaveLength(1);
    expect(runtimeBundleMocks.frontendRuntimes[0].start).toHaveBeenCalledTimes(1);
    expect(runtimeBundleMocks.backendClients[0].options.startupIdentityDisposition).toMatchObject({
      status: 'verified',
      writable: true,
      retryable: false,
      deviceId: 'truth-device-1',
      identityEpoch: 'epoch-1',
      source: 'installation-authority',
      reason: null,
    });
    expect(runtimeBundleMocks.backendClients[0].options.reviewTruthFlush).toMatchObject({
      deviceId: 'truth-device-1',
      identityEpoch: 'epoch-1',
    });
    expect(runtimeBundleMocks.backendClients[0].schedulePendingReviewTruthFlush).not.toHaveBeenCalled();
    expect(runtimeBundleMocks.resolveTruthDeviceIdentity).toHaveBeenCalledWith(expect.objectContaining({
      authority: expect.anything(),
      caches: expect.arrayContaining([expect.anything()]),
      evidenceProbe: expect.anything(),
      initializationFence: expect.anything(),
      hostFingerprint: 'host-system-1',
    }));
    expect(runtimeBundleMocks.logger.warn).not.toHaveBeenCalledWith(
      '[ApplicationContext] Frontend instance runtime unavailable; backend write families fail closed with explicit unavailable',
      expect.anything(),
    );
  });

  it('keeps backend load read-only when identity epoch is missing', async () => {
    runtimeBundleMocks.backendClients.length = 0;
    runtimeBundleMocks.frontendRuntimes.length = 0;
    runtimeBundleMocks.transports.length = 0;
    Object.values(runtimeBundleMocks.logger).forEach((fn) => fn.mockClear());
    runtimeBundleMocks.resolveTruthDeviceIdentity.mockResolvedValueOnce({
      status: 'identity-recovery-required',
      deviceId: null,
      identityEpoch: null,
      source: 'identity-recovery-required',
      authorityRevision: null,
      localStatePath: '/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json',
      persisted: false,
      cacheUpdated: false,
      cacheDiagnostics: [],
      installationEvidence: null,
      hostFingerprintMatch: 'unknown',
      error: 'full identity continuity is not proven',
    });

    const bundle = await createApplicationBackendRuntimeBundle(createRuntimeBundleOptions());

    expect(bundle.backendStartupError).toBeNull();
    expect(runtimeBundleMocks.backendClients[0].loadDatabase).toHaveBeenCalledTimes(1);
    expect(runtimeBundleMocks.backendClients[0].options.reviewTruthFlush).toBeNull();
    expect(runtimeBundleMocks.backendClients[0].schedulePendingReviewTruthFlush).not.toHaveBeenCalled();
    expect(runtimeBundleMocks.backendClients[0].options.startupIdentityDisposition).toMatchObject({
      status: 'read-only-recovery-required',
      writable: false,
      retryable: false,
      deviceId: null,
      identityEpoch: null,
      source: 'identity-recovery-required',
      reason: 'full identity continuity is not proven',
    });
    expect(runtimeBundleMocks.logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('STORAGE_VALIDATION_ERROR'),
      expect.anything(),
    );
  });

  it('keeps backend load read-only when identity authority is unavailable', async () => {
    runtimeBundleMocks.backendClients.length = 0;
    runtimeBundleMocks.frontendRuntimes.length = 0;
    runtimeBundleMocks.transports.length = 0;
    Object.values(runtimeBundleMocks.logger).forEach((fn) => fn.mockClear());
    runtimeBundleMocks.resolveTruthDeviceIdentity.mockResolvedValueOnce({
      status: 'authority-unavailable',
      deviceId: null,
      identityEpoch: null,
      source: 'authority-unavailable',
      authorityRevision: null,
      localStatePath: '/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json',
      persisted: false,
      cacheUpdated: false,
      cacheDiagnostics: [],
      installationEvidence: null,
      hostFingerprintMatch: 'unknown',
      error: 'installation identity authority read failed: read denied',
    });

    const bundle = await createApplicationBackendRuntimeBundle(createRuntimeBundleOptions());

    expect(bundle.backendStartupError).toBeNull();
    expect(runtimeBundleMocks.backendClients[0].loadDatabase).toHaveBeenCalledTimes(1);
    expect(runtimeBundleMocks.backendClients[0].options.reviewTruthFlush).toBeNull();
    expect(runtimeBundleMocks.backendClients[0].options.startupIdentityDisposition).toMatchObject({
      status: 'read-only-authority-unavailable',
      writable: false,
      retryable: true,
      deviceId: null,
      identityEpoch: null,
      source: 'authority-unavailable',
      reason: expect.stringContaining('IDENTITY_AUTHORITY_UNAVAILABLE'),
    });
    expect(runtimeBundleMocks.backendClients[0].schedulePendingReviewTruthFlush).not.toHaveBeenCalled();
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

  it('wires the explicit identity recovery host effects into the backend worker transport', async () => {
    runtimeBundleMocks.backendClients.length = 0;
    runtimeBundleMocks.frontendRuntimes.length = 0;
    runtimeBundleMocks.transports.length = 0;

    await createApplicationBackendRuntimeBundle(createRuntimeBundleOptions());

    const transportOptions = runtimeBundleMocks.transports[0].options as {
      hostEffects: {
        readIdentityRecoveryEvidence?: () => Promise<unknown>;
        ensureRecoveryActiveWriter?: (input: unknown) => Promise<void>;
        publishCertifiedAuthority?: (input: unknown) => Promise<unknown>;
      };
    };
    expect(transportOptions.hostEffects.readIdentityRecoveryEvidence).toEqual(expect.any(Function));
    expect(transportOptions.hostEffects.ensureRecoveryActiveWriter).toEqual(expect.any(Function));
    expect(transportOptions.hostEffects.publishCertifiedAuthority).toEqual(expect.any(Function));
  });
});
