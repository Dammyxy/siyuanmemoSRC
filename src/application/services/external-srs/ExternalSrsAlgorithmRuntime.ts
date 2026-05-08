export const EXTERNAL_SRS_MANIFEST_API_VERSION = 'siyuanmemo.external-srs.v1';
export const EXTERNAL_SRS_ALGORITHM_ID_PREFIX = 'external:';

export const EXTERNAL_SRS_RUNTIME_KINDS = [
  'worker-module',
  'wasm-worker',
] as const;

export const EXTERNAL_SRS_CAPABILITIES = [
  'advisory-preview',
  'arena-prediction',
] as const;

export type ExternalSrsRuntimeKind = typeof EXTERNAL_SRS_RUNTIME_KINDS[number];
export type ExternalSrsCapability = typeof EXTERNAL_SRS_CAPABILITIES[number];
export type ExternalSrsRegistryState = 'enabled' | 'disabled' | 'unavailable' | 'validation-error';
export type ExternalSrsRuntimeFailureState = 'disabled' | 'unavailable' | 'validation-error' | 'timeout' | 'runtime-error';

export interface ExternalSrsParameterMetadata {
  type: 'number' | 'string' | 'boolean';
  label?: string;
  default?: unknown;
  min?: number;
  max?: number;
  required?: boolean;
}

export interface ExternalSrsAlgorithmManifest {
  apiVersion: typeof EXTERNAL_SRS_MANIFEST_API_VERSION;
  id: string;
  displayName: string;
  version?: string;
  runtime: {
    kind: ExternalSrsRuntimeKind;
    entryFile: string;
  };
  capabilities: ExternalSrsCapability[];
  stateSchemaVersion: number;
  parameters: Record<string, ExternalSrsParameterMetadata>;
  integrity: Record<string, string>;
  licenseNotice: string;
}

export interface ValidatedExternalSrsAlgorithmManifest {
  manifest: ExternalSrsAlgorithmManifest;
  algorithmId: string;
  manifestPath: string;
  entryPath: string;
  parameterHash: string;
}

export interface ExternalSrsAlgorithmRegistryRecord {
  algorithmId: string;
  label: string;
  domain: 'srs';
  enabled: boolean;
  state: ExternalSrsRegistryState;
  runtimeKind: ExternalSrsRuntimeKind;
  version: string;
  parameterHash: string;
  stateSchemaVersion: number;
  metadata: Record<string, unknown>;
}

export interface ExternalSrsAlgorithmRegistryStateUpdate {
  enabled: boolean;
  state: ExternalSrsRegistryState;
  metadataPatch?: Record<string, unknown>;
}

export interface ExternalSrsAlgorithmRegistryPort {
  upsertExternalAlgorithm(record: ExternalSrsAlgorithmRegistryRecord): void | Promise<void>;
  updateExternalAlgorithmState(
    algorithmId: string,
    update: ExternalSrsAlgorithmRegistryStateUpdate,
  ): void | Promise<void>;
  getExternalAlgorithm?(algorithmId: string): ExternalSrsAlgorithmRegistryRecord | null | Promise<ExternalSrsAlgorithmRegistryRecord | null>;
}

export interface ExternalSrsAlgorithmFileHost {
  listManifestFiles(algorithmDirectory: string): Promise<string[]>;
  readText(filePath: string): Promise<string | null>;
  fileExists(filePath: string): Promise<boolean>;
  resolveSibling(manifestPath: string, relativePath: string): string;
}

export interface ExternalSrsValidationIssue {
  code: string;
  message: string;
}

export interface ExternalSrsManifestValidationOk {
  ok: true;
  value: ValidatedExternalSrsAlgorithmManifest;
}

export interface ExternalSrsManifestValidationError {
  ok: false;
  state: 'validation-error';
  manifestPath: string;
  algorithmId?: string;
  issues: ExternalSrsValidationIssue[];
}

export type ExternalSrsManifestValidationResult =
  | ExternalSrsManifestValidationOk
  | ExternalSrsManifestValidationError;

export interface ExternalSrsDiscoveryResult {
  valid: ValidatedExternalSrsAlgorithmManifest[];
  invalid: ExternalSrsManifestValidationError[];
}

export interface ExternalSrsCardSnapshot {
  cardId: string;
  cardType: string;
  deckId?: string | null;
  dueAt?: number | null;
  stability?: number | null;
  difficulty?: number | null;
  elapsedDays?: number | null;
  scheduledDays?: number | null;
  reps?: number | null;
  lapses?: number | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExternalSrsRuntimeContextSnapshot {
  rating: number;
  reviewedAt: number;
  formalScheduleWriter: 'fsrs-v6';
  schedulingContext?: Record<string, unknown>;
}

export interface ExternalSrsRuntimeRequest {
  apiVersion: typeof EXTERNAL_SRS_MANIFEST_API_VERSION;
  algorithmId: string;
  capability: ExternalSrsCapability;
  card: ExternalSrsCardSnapshot;
  context: ExternalSrsRuntimeContextSnapshot;
  parameters: Record<string, unknown>;
}

export interface ExternalSrsRuntimePrediction {
  dueAt?: number | null;
  intervalDays?: number | null;
  recallProbability?: number | null;
  confidence?: number | null;
  explanation?: string;
  metadata?: Record<string, unknown>;
}

export type ExternalSrsAlgorithmRunner = (
  request: ExternalSrsRuntimeRequest,
  signal: AbortSignal,
) => Promise<unknown>;

export interface ExternalSrsRuntimeInvocation {
  registration: ExternalSrsAlgorithmRegistryRecord;
  manifest: ValidatedExternalSrsAlgorithmManifest;
  capability: ExternalSrsCapability;
  card: ExternalSrsCardSnapshot;
  context: ExternalSrsRuntimeContextSnapshot;
  parameters?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ExternalSrsRuntimeSuccess {
  ok: true;
  state: 'enabled';
  algorithmId: string;
  advisoryOnly: true;
  formalScheduleWrite: false;
  fsrsCommitSafe: true;
  prediction: ExternalSrsRuntimePrediction;
}

export interface ExternalSrsRuntimeFailure {
  ok: false;
  state: ExternalSrsRuntimeFailureState;
  algorithmId: string;
  advisoryOnly: true;
  formalScheduleWrite: false;
  fsrsCommitSafe: true;
  error: string;
}

export type ExternalSrsRuntimeResult = ExternalSrsRuntimeSuccess | ExternalSrsRuntimeFailure;

const MANIFEST_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{1,96}$/;
const PARAMETER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,64}$/;
const DEFAULT_TIMEOUT_MS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function addIssue(issues: ExternalSrsValidationIssue[], code: string, message: string): void {
  issues.push({ code, message });
}

function isSupportedRuntimeKind(value: unknown): value is ExternalSrsRuntimeKind {
  return EXTERNAL_SRS_RUNTIME_KINDS.includes(value as ExternalSrsRuntimeKind);
}

function isSupportedCapability(value: unknown): value is ExternalSrsCapability {
  return EXTERNAL_SRS_CAPABILITIES.includes(value as ExternalSrsCapability);
}

function isRelativeEntryPath(value: string): boolean {
  if (!value || value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 && !parts.includes('..') && !value.includes('://');
}

function normalizeManifestAlgorithmId(value: unknown): string | null {
  const raw = normalizeString(value);
  if (!raw) {
    return null;
  }
  const withoutPrefix = raw.startsWith(EXTERNAL_SRS_ALGORITHM_ID_PREFIX)
    ? raw.slice(EXTERNAL_SRS_ALGORITHM_ID_PREFIX.length)
    : raw;
  if (!MANIFEST_ID_PATTERN.test(withoutPrefix)) {
    return null;
  }
  return `${EXTERNAL_SRS_ALGORITHM_ID_PREFIX}${withoutPrefix}`;
}

function normalizeCapabilities(value: unknown, issues: ExternalSrsValidationIssue[]): ExternalSrsCapability[] {
  if (!Array.isArray(value)) {
    addIssue(issues, 'capabilities.required', 'Manifest capabilities must be an array.');
    return [];
  }
  const capabilities = Array.from(new Set(value.filter(isSupportedCapability)));
  if (capabilities.length === 0) {
    addIssue(issues, 'capabilities.unsupported', 'Manifest must include at least one supported capability.');
  }
  if (capabilities.length !== value.length) {
    addIssue(issues, 'capabilities.unsupported-value', 'Manifest declares an unsupported capability.');
  }
  return capabilities;
}

function normalizeParameterMetadata(value: unknown, issues: ExternalSrsValidationIssue[]): Record<string, ExternalSrsParameterMetadata> {
  if (!isRecord(value)) {
    addIssue(issues, 'parameters.required', 'Manifest parameters must be an object.');
    return {};
  }
  const normalized: Record<string, ExternalSrsParameterMetadata> = {};
  for (const [key, rawMetadata] of Object.entries(value)) {
    if (!PARAMETER_ID_PATTERN.test(key)) {
      addIssue(issues, 'parameters.invalid-key', `Invalid parameter id: ${key}`);
      continue;
    }
    if (!isRecord(rawMetadata)) {
      addIssue(issues, 'parameters.invalid-metadata', `Parameter ${key} must be an object.`);
      continue;
    }
    const type = rawMetadata.type;
    if (type !== 'number' && type !== 'string' && type !== 'boolean') {
      addIssue(issues, 'parameters.invalid-type', `Parameter ${key} has an unsupported type.`);
      continue;
    }
    normalized[key] = {
      type,
      label: normalizeString(rawMetadata.label) || undefined,
      default: rawMetadata.default,
      min: typeof rawMetadata.min === 'number' ? rawMetadata.min : undefined,
      max: typeof rawMetadata.max === 'number' ? rawMetadata.max : undefined,
      required: rawMetadata.required === true,
    };
  }
  return normalized;
}

function normalizeIntegrity(value: unknown, issues: ExternalSrsValidationIssue[]): Record<string, string> {
  if (!isRecord(value)) {
    addIssue(issues, 'integrity.required', 'Manifest integrity metadata must be an object.');
    return {};
  }
  const normalized = Object.fromEntries(
    Object.entries(value)
      .map(([key, rawValue]) => [key, normalizeString(rawValue)] as const)
      .filter(([key, rawValue]) => Boolean(key && rawValue)),
  );
  if (Object.keys(normalized).length === 0) {
    addIssue(issues, 'integrity.empty', 'Manifest integrity metadata must not be empty.');
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createExternalSrsParameterHash(parameters: Record<string, ExternalSrsParameterMetadata>): string {
  const source = stableStringify(parameters);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `external-params:${(hash >>> 0).toString(16)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function normalizePrediction(value: unknown): ExternalSrsRuntimePrediction {
  const source = isRecord(value) ? value : {};
  const prediction: ExternalSrsRuntimePrediction = {};
  if (typeof source.dueAt === 'number') {
    prediction.dueAt = source.dueAt;
  }
  if (typeof source.intervalDays === 'number') {
    prediction.intervalDays = source.intervalDays;
  }
  if (typeof source.recallProbability === 'number') {
    prediction.recallProbability = Math.max(0, Math.min(1, source.recallProbability));
  }
  if (typeof source.confidence === 'number') {
    prediction.confidence = Math.max(0, Math.min(1, source.confidence));
  }
  if (typeof source.explanation === 'string') {
    prediction.explanation = source.explanation;
  }
  if (isRecord(source.metadata)) {
    prediction.metadata = cloneJson(source.metadata);
  }
  return prediction;
}

function buildRegistryRecord(
  manifest: ValidatedExternalSrsAlgorithmManifest,
  now: number,
): ExternalSrsAlgorithmRegistryRecord {
  return {
    algorithmId: manifest.algorithmId,
    label: manifest.manifest.displayName,
    domain: 'srs',
    enabled: false,
    state: 'disabled',
    runtimeKind: manifest.manifest.runtime.kind,
    version: manifest.manifest.version || manifest.manifest.apiVersion,
    parameterHash: manifest.parameterHash,
    stateSchemaVersion: manifest.manifest.stateSchemaVersion,
    metadata: {
      source: 'external-local',
      apiVersion: manifest.manifest.apiVersion,
      manifestPath: manifest.manifestPath,
      entryFile: manifest.manifest.runtime.entryFile,
      entryPath: manifest.entryPath,
      capabilities: [...manifest.manifest.capabilities],
      integrity: cloneJson(manifest.manifest.integrity),
      licenseNotice: manifest.manifest.licenseNotice,
      parameters: cloneJson(manifest.manifest.parameters),
      advisoryOnly: true,
      registeredAt: now,
    },
  };
}

export async function validateExternalSrsAlgorithmManifest(input: {
  manifestPath: string;
  manifestJson: unknown;
  fileHost: Pick<ExternalSrsAlgorithmFileHost, 'fileExists' | 'resolveSibling'>;
}): Promise<ExternalSrsManifestValidationResult> {
  const issues: ExternalSrsValidationIssue[] = [];
  const source = isRecord(input.manifestJson) ? input.manifestJson : {};
  const algorithmId = normalizeManifestAlgorithmId(source.id);
  if (!algorithmId) {
    addIssue(issues, 'id.invalid', 'Manifest id must be a generic local algorithm id.');
  }

  const apiVersion = normalizeString(source.apiVersion);
  if (apiVersion !== EXTERNAL_SRS_MANIFEST_API_VERSION) {
    addIssue(issues, 'apiVersion.unsupported', 'Manifest apiVersion is not supported.');
  }

  const displayName = normalizeString(source.displayName);
  if (!displayName) {
    addIssue(issues, 'displayName.required', 'Manifest displayName is required.');
  }

  const runtime = isRecord(source.runtime) ? source.runtime : {};
  const runtimeKind = runtime.kind;
  if (!isSupportedRuntimeKind(runtimeKind)) {
    addIssue(issues, 'runtime.kind.unsupported', 'Manifest runtime.kind is not supported.');
  }

  const entryFile = normalizeString(runtime.entryFile);
  if (!isRelativeEntryPath(entryFile)) {
    addIssue(issues, 'runtime.entryFile.invalid', 'Manifest runtime.entryFile must be a relative local file path.');
  }
  const entryPath = entryFile ? input.fileHost.resolveSibling(input.manifestPath, entryFile) : '';
  if (entryPath && !(await input.fileHost.fileExists(entryPath))) {
    addIssue(issues, 'runtime.entryFile.missing', 'Manifest runtime.entryFile is not readable.');
  }

  const capabilities = normalizeCapabilities(source.capabilities, issues);
  const stateSchemaVersion = Number(source.stateSchemaVersion);
  if (!Number.isInteger(stateSchemaVersion) || stateSchemaVersion < 1) {
    addIssue(issues, 'stateSchemaVersion.invalid', 'Manifest stateSchemaVersion must be a positive integer.');
  }
  const parameters = normalizeParameterMetadata(source.parameters, issues);
  const integrity = normalizeIntegrity(source.integrity, issues);
  const licenseNotice = normalizeString(source.licenseNotice);
  if (!licenseNotice) {
    addIssue(issues, 'licenseNotice.required', 'Manifest licenseNotice is required.');
  }

  if (issues.length > 0 || !algorithmId || !isSupportedRuntimeKind(runtimeKind)) {
    return {
      ok: false,
      state: 'validation-error',
      manifestPath: input.manifestPath,
      algorithmId: algorithmId || undefined,
      issues,
    };
  }

  const manifest: ExternalSrsAlgorithmManifest = {
    apiVersion: EXTERNAL_SRS_MANIFEST_API_VERSION,
    id: algorithmId,
    displayName,
    version: normalizeString(source.version) || undefined,
    runtime: {
      kind: runtimeKind,
      entryFile,
    },
    capabilities,
    stateSchemaVersion,
    parameters,
    integrity,
    licenseNotice,
  };

  return {
    ok: true,
    value: {
      manifest,
      algorithmId,
      manifestPath: input.manifestPath,
      entryPath,
      parameterHash: createExternalSrsParameterHash(parameters),
    },
  };
}

export async function discoverExternalSrsAlgorithms(input: {
  algorithmDirectory: string;
  fileHost: ExternalSrsAlgorithmFileHost;
}): Promise<ExternalSrsDiscoveryResult> {
  const directory = normalizeString(input.algorithmDirectory);
  if (!directory) {
    return { valid: [], invalid: [] };
  }
  const valid: ValidatedExternalSrsAlgorithmManifest[] = [];
  const invalid: ExternalSrsManifestValidationError[] = [];
  const manifestFiles = await input.fileHost.listManifestFiles(directory);
  for (const manifestPath of manifestFiles) {
    const text = await input.fileHost.readText(manifestPath);
    if (!text) {
      invalid.push({
        ok: false,
        state: 'validation-error',
        manifestPath,
        issues: [{ code: 'manifest.unreadable', message: 'Manifest file is not readable.' }],
      });
      continue;
    }
    let manifestJson: unknown;
    try {
      manifestJson = JSON.parse(text);
    } catch {
      invalid.push({
        ok: false,
        state: 'validation-error',
        manifestPath,
        issues: [{ code: 'manifest.invalid-json', message: 'Manifest file is not valid JSON.' }],
      });
      continue;
    }
    const result = await validateExternalSrsAlgorithmManifest({
      manifestPath,
      manifestJson,
      fileHost: input.fileHost,
    });
    if (result.ok) {
      valid.push(result.value);
    } else {
      invalid.push(result);
    }
  }
  return { valid, invalid };
}

export async function registerValidatedExternalSrsAlgorithms(input: {
  manifests: ValidatedExternalSrsAlgorithmManifest[];
  registry: ExternalSrsAlgorithmRegistryPort;
  now?: number;
}): Promise<ExternalSrsAlgorithmRegistryRecord[]> {
  const now = input.now ?? Date.now();
  const records = input.manifests.map((manifest) => buildRegistryRecord(manifest, now));
  for (const record of records) {
    await input.registry.upsertExternalAlgorithm(record);
  }
  return records;
}

export async function discoverAndRegisterExternalSrsAlgorithms(input: {
  algorithmDirectory: string;
  fileHost: ExternalSrsAlgorithmFileHost;
  registry: ExternalSrsAlgorithmRegistryPort;
  now?: number;
}): Promise<ExternalSrsDiscoveryResult & { registered: ExternalSrsAlgorithmRegistryRecord[] }> {
  const discovery = await discoverExternalSrsAlgorithms(input);
  const registered = await registerValidatedExternalSrsAlgorithms({
    manifests: discovery.valid,
    registry: input.registry,
    now: input.now,
  });
  return { ...discovery, registered };
}

export async function enableExternalSrsAlgorithm(input: {
  algorithmId: string;
  registry: ExternalSrsAlgorithmRegistryPort;
  now?: number;
}): Promise<void> {
  await input.registry.updateExternalAlgorithmState(input.algorithmId, {
    enabled: true,
    state: 'enabled',
    metadataPatch: { enabledAt: input.now ?? Date.now() },
  });
}

export async function disableExternalSrsAlgorithm(input: {
  algorithmId: string;
  registry: ExternalSrsAlgorithmRegistryPort;
  now?: number;
}): Promise<void> {
  await input.registry.updateExternalAlgorithmState(input.algorithmId, {
    enabled: false,
    state: 'disabled',
    metadataPatch: { disabledAt: input.now ?? Date.now() },
  });
}

export class ExternalSrsAlgorithmRuntimeAdapter {
  constructor(
    private readonly runner: ExternalSrsAlgorithmRunner,
    private readonly fileHost?: Pick<ExternalSrsAlgorithmFileHost, 'fileExists'>,
    private readonly registry?: ExternalSrsAlgorithmRegistryPort,
  ) {}

  async invokeAdvisory(input: ExternalSrsRuntimeInvocation): Promise<ExternalSrsRuntimeResult> {
    const algorithmId = input.registration.algorithmId;
    if (!input.registration.enabled || input.registration.state === 'disabled') {
      return this.failure(algorithmId, 'disabled', 'External algorithm is disabled.');
    }
    if (input.registration.state === 'validation-error') {
      return this.failure(algorithmId, 'validation-error', 'External algorithm manifest is invalid.');
    }
    if (input.registration.state === 'unavailable') {
      return this.failure(algorithmId, 'unavailable', 'External algorithm is unavailable.');
    }
    if (!input.manifest.manifest.capabilities.includes(input.capability)) {
      return this.failure(algorithmId, 'validation-error', 'External algorithm does not declare the requested capability.');
    }
    if (this.fileHost && !(await this.fileHost.fileExists(input.manifest.entryPath))) {
      await this.markUnavailable(algorithmId, 'entry-missing');
      return this.failure(algorithmId, 'unavailable', 'External algorithm entry file is not readable.');
    }

    const controller = new AbortController();
    const request: ExternalSrsRuntimeRequest = {
      apiVersion: EXTERNAL_SRS_MANIFEST_API_VERSION,
      algorithmId,
      capability: input.capability,
      card: cloneJson(input.card),
      context: {
        rating: input.context.rating,
        reviewedAt: input.context.reviewedAt,
        formalScheduleWriter: 'fsrs-v6',
        schedulingContext: cloneJson(input.context.schedulingContext || {}),
      },
      parameters: cloneJson(input.parameters || {}),
    };

    const timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const rawPrediction = await Promise.race([
        this.runner(request, controller.signal),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            controller.abort();
            reject(new Error('external-srs-timeout'));
          }, timeoutMs);
        }),
      ]);
      return {
        ok: true,
        state: 'enabled',
        algorithmId,
        advisoryOnly: true,
        formalScheduleWrite: false,
        fsrsCommitSafe: true,
        prediction: normalizePrediction(rawPrediction),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'external-srs-timeout') {
        await this.markUnavailable(algorithmId, 'timeout');
        return this.failure(algorithmId, 'timeout', 'External algorithm call timed out.');
      }
      await this.markUnavailable(algorithmId, 'runtime-error');
      return this.failure(
        algorithmId,
        'runtime-error',
        error instanceof Error ? error.message : 'External algorithm runtime failed.',
      );
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private failure(
    algorithmId: string,
    state: ExternalSrsRuntimeFailureState,
    error: string,
  ): ExternalSrsRuntimeFailure {
    return {
      ok: false,
      state,
      algorithmId,
      advisoryOnly: true,
      formalScheduleWrite: false,
      fsrsCommitSafe: true,
      error,
    };
  }

  private async markUnavailable(algorithmId: string, reason: string): Promise<void> {
    await this.registry?.updateExternalAlgorithmState(algorithmId, {
      enabled: false,
      state: 'unavailable',
      metadataPatch: {
        unavailableAt: Date.now(),
        unavailableReason: reason,
      },
    });
  }
}
