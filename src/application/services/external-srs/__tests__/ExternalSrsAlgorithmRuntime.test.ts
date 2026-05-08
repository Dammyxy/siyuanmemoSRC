import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_SRS_MANIFEST_API_VERSION,
  ExternalSrsAlgorithmRuntimeAdapter,
  type ExternalSrsAlgorithmFileHost,
  type ExternalSrsAlgorithmRegistryPort,
  type ExternalSrsAlgorithmRegistryRecord,
  type ExternalSrsRuntimeRequest,
  discoverAndRegisterExternalSrsAlgorithms,
  disableExternalSrsAlgorithm,
  enableExternalSrsAlgorithm,
  validateExternalSrsAlgorithmManifest,
} from '../ExternalSrsAlgorithmRuntime';

class MemoryExternalFileHost implements ExternalSrsAlgorithmFileHost {
  constructor(readonly files: Map<string, string>) {}

  async listManifestFiles(algorithmDirectory: string): Promise<string[]> {
    return Array.from(this.files.keys())
      .filter((filePath) => filePath.startsWith(`${algorithmDirectory}/`) && filePath.endsWith('manifest.json'))
      .sort();
  }

  async readText(filePath: string): Promise<string | null> {
    return this.files.get(filePath) ?? null;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }

  resolveSibling(manifestPath: string, relativePath: string): string {
    const parts = manifestPath.split('/');
    parts.pop();
    return [...parts, relativePath].join('/');
  }
}

class MemoryExternalRegistry implements ExternalSrsAlgorithmRegistryPort {
  readonly records = new Map<string, ExternalSrsAlgorithmRegistryRecord>();
  readonly updates: Array<{ algorithmId: string; state: string; enabled: boolean }> = [];

  upsertExternalAlgorithm(record: ExternalSrsAlgorithmRegistryRecord): void {
    this.records.set(record.algorithmId, structuredClone(record));
  }

  updateExternalAlgorithmState(
    algorithmId: string,
    update: { enabled: boolean; state: ExternalSrsAlgorithmRegistryRecord['state']; metadataPatch?: Record<string, unknown> },
  ): void {
    this.updates.push({ algorithmId, state: update.state, enabled: update.enabled });
    const current = this.records.get(algorithmId);
    if (!current) {
      return;
    }
    this.records.set(algorithmId, {
      ...current,
      enabled: update.enabled,
      state: update.state,
      metadata: {
        ...current.metadata,
        ...(update.metadataPatch || {}),
      },
    });
  }

  getExternalAlgorithm(algorithmId: string): ExternalSrsAlgorithmRegistryRecord | null {
    return this.records.get(algorithmId) ?? null;
  }
}

function manifestJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    apiVersion: EXTERNAL_SRS_MANIFEST_API_VERSION,
    id: 'demo',
    displayName: 'Demo Local Algorithm',
    version: '1.0.0',
    runtime: {
      kind: 'worker-module',
      entryFile: 'runner.js',
    },
    capabilities: ['advisory-preview', 'arena-prediction'],
    stateSchemaVersion: 1,
    parameters: {
      fuzz: {
        type: 'number',
        default: 0.25,
        min: 0,
        max: 1,
      },
    },
    integrity: {
      sha256: 'test-only-hash',
    },
    licenseNotice: 'User supplied local file.',
    ...overrides,
  };
}

function createHost(manifest: Record<string, unknown> = manifestJson()): MemoryExternalFileHost {
  return new MemoryExternalFileHost(new Map([
    ['algorithms/demo/manifest.json', JSON.stringify(manifest)],
    ['algorithms/demo/runner.js', 'export default {};'],
  ]));
}

async function getValidatedManifest(host = createHost()) {
  const result = await validateExternalSrsAlgorithmManifest({
    manifestPath: 'algorithms/demo/manifest.json',
    manifestJson: manifestJson(),
    fileHost: host,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('manifest fixture did not validate');
  }
  return result.value;
}

function enabledRecord(record: ExternalSrsAlgorithmRegistryRecord): ExternalSrsAlgorithmRegistryRecord {
  return {
    ...record,
    enabled: true,
    state: 'enabled',
  };
}

describe('ExternalSrsAlgorithmRuntime', () => {
  it('discovers valid local manifests and registers them disabled by default', async () => {
    const host = createHost();
    const registry = new MemoryExternalRegistry();

    const result = await discoverAndRegisterExternalSrsAlgorithms({
      algorithmDirectory: 'algorithms',
      fileHost: host,
      registry,
      now: 42,
    });

    expect(result.invalid).toEqual([]);
    expect(result.registered).toHaveLength(1);
    const record = registry.records.get('external:demo');
    expect(record).toMatchObject({
      algorithmId: 'external:demo',
      label: 'Demo Local Algorithm',
      domain: 'srs',
      enabled: false,
      state: 'disabled',
      runtimeKind: 'worker-module',
      stateSchemaVersion: 1,
    });
    expect(record?.metadata).toMatchObject({
      source: 'external-local',
      entryPath: 'algorithms/demo/runner.js',
      advisoryOnly: true,
      registeredAt: 42,
    });
  });

  it('rejects invalid manifests before registration', async () => {
    const host = createHost(manifestJson({ licenseNotice: '', apiVersion: 'unsupported' }));
    const registry = new MemoryExternalRegistry();

    const result = await discoverAndRegisterExternalSrsAlgorithms({
      algorithmDirectory: 'algorithms',
      fileHost: host,
      registry,
    });

    expect(result.registered).toEqual([]);
    expect(registry.records.size).toBe(0);
    expect(result.invalid[0]).toMatchObject({
      state: 'validation-error',
      algorithmId: 'external:demo',
    });
    expect(result.invalid[0].issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['apiVersion.unsupported', 'licenseNotice.required']),
    );
  });

  it('supports explicit enable and disable registry states', async () => {
    const host = createHost();
    const registry = new MemoryExternalRegistry();
    await discoverAndRegisterExternalSrsAlgorithms({
      algorithmDirectory: 'algorithms',
      fileHost: host,
      registry,
      now: 42,
    });

    await enableExternalSrsAlgorithm({ algorithmId: 'external:demo', registry, now: 50 });
    expect(registry.records.get('external:demo')).toMatchObject({
      enabled: true,
      state: 'enabled',
      metadata: { enabledAt: 50 },
    });

    await disableExternalSrsAlgorithm({ algorithmId: 'external:demo', registry, now: 60 });
    expect(registry.records.get('external:demo')).toMatchObject({
      enabled: false,
      state: 'disabled',
      metadata: { disabledAt: 60 },
    });
  });

  it('marks an enabled algorithm unavailable when its entry file disappears', async () => {
    const host = createHost();
    const validated = await getValidatedManifest(host);
    const registry = new MemoryExternalRegistry();
    registry.upsertExternalAlgorithm(enabledRecord({
      algorithmId: validated.algorithmId,
      label: validated.manifest.displayName,
      domain: 'srs',
      enabled: false,
      state: 'disabled',
      runtimeKind: validated.manifest.runtime.kind,
      version: '1.0.0',
      parameterHash: validated.parameterHash,
      stateSchemaVersion: 1,
      metadata: {},
    }));
    host.files.delete('algorithms/demo/runner.js');
    const runner = vi.fn(async () => ({ intervalDays: 3 }));
    const adapter = new ExternalSrsAlgorithmRuntimeAdapter(runner, host, registry);

    const result = await adapter.invokeAdvisory({
      registration: registry.records.get('external:demo')!,
      manifest: validated,
      capability: 'advisory-preview',
      card: { cardId: 'card-a', cardType: 'item' },
      context: { rating: 3, reviewedAt: 100, formalScheduleWriter: 'fsrs-v6' },
    });

    expect(result).toMatchObject({
      ok: false,
      state: 'unavailable',
      advisoryOnly: true,
      formalScheduleWrite: false,
      fsrsCommitSafe: true,
    });
    expect(runner).not.toHaveBeenCalled();
    expect(registry.records.get('external:demo')).toMatchObject({
      enabled: false,
      state: 'unavailable',
    });
  });

  it('isolates runtime timeouts from formal FSRS commits', async () => {
    const validated = await getValidatedManifest();
    const record = enabledRecord({
      algorithmId: validated.algorithmId,
      label: validated.manifest.displayName,
      domain: 'srs',
      enabled: false,
      state: 'disabled',
      runtimeKind: validated.manifest.runtime.kind,
      version: '1.0.0',
      parameterHash: validated.parameterHash,
      stateSchemaVersion: 1,
      metadata: {},
    });
    const adapter = new ExternalSrsAlgorithmRuntimeAdapter(
      () => new Promise(() => {}),
    );

    const result = await adapter.invokeAdvisory({
      registration: record,
      manifest: validated,
      capability: 'advisory-preview',
      card: { cardId: 'card-a', cardType: 'item' },
      context: { rating: 2, reviewedAt: 100, formalScheduleWriter: 'fsrs-v6' },
      timeoutMs: 1,
    });

    expect(result).toMatchObject({
      ok: false,
      state: 'timeout',
      advisoryOnly: true,
      formalScheduleWrite: false,
      fsrsCommitSafe: true,
    });
  });

  it('passes only structured snapshots and normalizes advisory-only output', async () => {
    const validated = await getValidatedManifest();
    const record = enabledRecord({
      algorithmId: validated.algorithmId,
      label: validated.manifest.displayName,
      domain: 'srs',
      enabled: false,
      state: 'disabled',
      runtimeKind: validated.manifest.runtime.kind,
      version: '1.0.0',
      parameterHash: validated.parameterHash,
      stateSchemaVersion: 1,
      metadata: {},
    });
    let capturedRequest: ExternalSrsRuntimeRequest | null = null;
    const adapter = new ExternalSrsAlgorithmRuntimeAdapter(async (request) => {
      capturedRequest = request;
      return {
        dueAt: 3000,
        intervalDays: 7,
        recallProbability: 2,
        confidence: -1,
        explanation: 'advisory only',
        metadata: { bucket: 'preview' },
        formalScheduleWriter: 'external',
        writerPort: {},
      };
    });

    const result = await adapter.invokeAdvisory({
      registration: record,
      manifest: validated,
      capability: 'arena-prediction',
      card: {
        cardId: 'card-a',
        cardType: 'descriptor',
        metadata: { source: 'snapshot' },
      },
      context: {
        rating: 4,
        reviewedAt: 200,
        formalScheduleWriter: 'fsrs-v6',
        schedulingContext: { queueId: 'RetrievalPractice' },
      },
      parameters: { fuzz: 0.4 },
      timeoutMs: 50,
    });

    expect(Object.keys(capturedRequest || {}).sort()).toEqual([
      'algorithmId',
      'apiVersion',
      'capability',
      'card',
      'context',
      'parameters',
    ]);
    expect(capturedRequest).toMatchObject({
      algorithmId: 'external:demo',
      capability: 'arena-prediction',
      context: { formalScheduleWriter: 'fsrs-v6' },
      parameters: { fuzz: 0.4 },
    });
    expect(capturedRequest).not.toHaveProperty('database');
    expect(capturedRequest).not.toHaveProperty('siyuanApi');
    expect(capturedRequest).not.toHaveProperty('writerPort');
    expect(capturedRequest).not.toHaveProperty('pluginService');
    expect(result).toMatchObject({
      ok: true,
      advisoryOnly: true,
      formalScheduleWrite: false,
      prediction: {
        dueAt: 3000,
        intervalDays: 7,
        recallProbability: 1,
        confidence: 0,
        explanation: 'advisory only',
        metadata: { bucket: 'preview' },
      },
    });
    expect(result.ok ? result.prediction : {}).not.toHaveProperty('formalScheduleWriter');
    expect(result.ok ? result.prediction : {}).not.toHaveProperty('writerPort');
  });
});
