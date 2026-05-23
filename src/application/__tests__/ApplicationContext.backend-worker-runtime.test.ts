import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationContext } from '../ApplicationContext';

function readApplicationContextSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/ApplicationContext.ts'), 'utf8');
}

function readBackendRuntimeFactorySource(): string {
  return readFileSync(resolve(process.cwd(), 'src/application/factories/createApplicationBackendRuntimeBundle.ts'), 'utf8');
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
});
