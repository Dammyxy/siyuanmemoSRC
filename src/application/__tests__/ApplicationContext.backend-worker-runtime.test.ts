import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';
import { SqliteDatabaseService } from '@/infrastructure/persistence/sqlite/SqliteDatabaseService';
import { SQLITE_DB_FILE } from '@/infrastructure/persistence/sqlite/schema';
import type { IFileService } from '@/infrastructure/services/FileService';

function readApplicationContextSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/ApplicationContext.ts'), 'utf8');
}

function readBackendRuntimeFactorySource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/factories/createApplicationBackendRuntimeBundle.ts'), 'utf8');
}

class MemorySqliteFileService implements Pick<IFileService, 'readJSON' | 'writeJSON' | 'readBinary' | 'writeBinary'> {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  writeBinary = vi.fn(async (fileName: string, bytes: Uint8Array) => {
    this.binary.set(fileName, new Uint8Array(bytes));
  });

  async readJSON<T>(fileName: string): Promise<T | null> {
    return (this.json.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, data);
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }
}

describe('ApplicationContext backend worker runtime boundary', () => {
  it('delegates browser Worker transport construction to a typed backend runtime bundle', () => {
    const contextSource = readApplicationContextSource();
    const factorySource = readBackendRuntimeFactorySource();

    expect(contextSource).toContain('createApplicationBackendRuntimeBundle');
    expect(contextSource).not.toContain('new BrowserSrsBackendWorkerTransport');
    expect(factorySource).toContain('BrowserSrsBackendWorkerTransport');
    expect(factorySource).toContain("from '@/application/clients/BrowserSrsBackendWorkerTransport'");
    expect(factorySource).toContain('new BrowserSrsBackendWorkerTransport');
    expect(factorySource).toContain("schedulePendingReviewTruthFlush('startup')");
    expect(factorySource).not.toContain('new BackendKernel');
    expect(factorySource).not.toContain("from '../../worker/bootstrap/BackendKernel'");
    expect(factorySource).not.toContain("from '../../worker/db/SqliteDatabaseService'");
  });

  it('passes backend Worker health diagnostics into the frontend writer runtime', () => {
    const source = readBackendRuntimeFactorySource();

    expect(source).toContain('backendWorkerHealth: () =>');
    expect(source).toContain('srsBackendTransport?.getDiagnostics?.()');
    expect(source).toContain("diagnostics.health === 'healthy'");
    expect(source).toContain("diagnostics.health === 'starting'");
  });

  it('uses a truth-wide local device identity key for MessagePack truth writes', () => {
    const source = readBackendRuntimeFactorySource();

    expect(source).toContain("TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.truth.deviceId.v1'");
    expect(source).toContain("LEGACY_REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1'");
    expect(source).toContain('resolveTruthDeviceId');
    expect(source).toContain('TRUTH_DEVICE_ID_UNAVAILABLE');
    expect(source).not.toContain("const REVIEW_TRUTH_DEVICE_ID_STORAGE_KEY = 'siyuanmemo.reviewTruth.deviceId.v1'");
  });

  it('constructs renderer sqlite projection without implicit startup checkpointing', () => {
    const contextSource = readApplicationContextSource();

    expect(contextSource).toContain('new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {');
    expect(contextSource).toContain('persistOnInit: false');
    expect(contextSource).toContain('enableDeltaPersistence: true');
  });

  it('does not write siyuanmemo.db during renderer sqlite startup fixture initialization', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService, SQLITE_DB_FILE, {
      persistOnInit: false,
      enableDeltaPersistence: true,
    });

    await database.init();

    expect(fileService.writeBinary).not.toHaveBeenCalled();
    database.dispose();
  });

  it('keeps public backend runtime accessors and disposal compatible with bundle services', async () => {
    const srsBackendClient = { marker: 'backend-client' };
    const srsBackendTransport = {
      dispose: vi.fn(),
    };
    const frontendInstanceRuntime = {
      dispose: vi.fn(async () => undefined),
      getMode: () => 'writer',
      getInstanceId: () => 'instance-1',
    };
    const followerCommandClient = { marker: 'follower-command-client' };
    const kernelSidecarClient = { marker: 'kernel-sidecar-client' };
    const runtimePolicy = {
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
    };
    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      srsBackendClient,
      srsBackendTransport,
      frontendInstanceRuntime,
      followerCommandClient,
      kernelSidecarClient,
      backendMigrationRuntimePolicy: runtimePolicy,
    });

    expect(context.getSrsBackendClient()).toBe(srsBackendClient);
    expect(context.getFrontendInstanceRuntime()).toBe(frontendInstanceRuntime);
    expect(context.getFollowerCommandClient()).toBe(followerCommandClient);
    expect(context.getKernelSidecarClient()).toBe(kernelSidecarClient);
    expect(context.getBackendMigrationRuntimePolicy()).toBe(runtimePolicy);

    await context.dispose({ persistStorage: false });

    expect(frontendInstanceRuntime.dispose).toHaveBeenCalledTimes(1);
    expect(srsBackendTransport.dispose).toHaveBeenCalledTimes(1);
    expect(context.getSrsBackendClient()).toBeNull();
    expect(context.getFrontendInstanceRuntime()).toBeNull();
    expect(context.getFollowerCommandClient()).toBeNull();
  });

  it('does not rewrite a clean sqlite database during dispose when storage persistence is disabled', async () => {
    const fileService = new MemorySqliteFileService();
    const seeded = new SqliteDatabaseService(fileService);
    await seeded.init();
    const writesAfterSeed = fileService.writeBinary.mock.calls.length;
    seeded.dispose();

    const cleanDatabase = new SqliteDatabaseService(fileService);
    await cleanDatabase.init();
    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      sqlPersistence: {
        database: cleanDatabase,
      },
    });

    await context.dispose({ persistStorage: false });

    expect(fileService.writeBinary).toHaveBeenCalledTimes(writesAfterSeed);
  });

  it('does not checkpoint a dirty renderer sqlite projection during normal dispose', async () => {
    const fileService = new MemorySqliteFileService();
    const database = new SqliteDatabaseService(fileService);
    await database.init();
    fileService.writeBinary.mockClear();

    await database.runTransaction('dirty-renderer-projection', (db) => {
      db.run('CREATE TABLE renderer_dispose_checkpoint_guard (id TEXT PRIMARY KEY)');
      db.run('INSERT INTO renderer_dispose_checkpoint_guard (id) VALUES (?)', ['dirty']);
    }, { persist: false });

    expect(fileService.writeBinary).not.toHaveBeenCalled();

    const TestableApplicationContext = ApplicationContext as unknown as new (
      config: unknown,
      services: unknown,
    ) => ApplicationContext;
    const context = new TestableApplicationContext({
      plugin: { name: 'test-plugin', app: {} },
      i18n: {},
    }, {
      storageManager: {},
      unifiedStorageManager: { save: vi.fn() },
      schedulerRouter: {},
      rescheduleService: {},
      unifiedDataSourceManager: {},
      blockMenuHandler: {},
      sqlPersistence: {
        database,
      },
    });

    await context.dispose({ persistStorage: false });

    expect(fileService.writeBinary).not.toHaveBeenCalled();
  });
});
