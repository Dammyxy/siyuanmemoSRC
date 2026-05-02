import { resolveBackendFeatureGates } from '@/application/backendMigration/featureGateMatrix';
import { BACKEND_MIGRATION_FEATURE_GATES } from '@/application/backendMigration/ownershipMap';

export const BACKEND_MIGRATION_WRITER_LEASE_GUARD_ENV_KEY = 'VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD';
export const BACKEND_MIGRATION_AI_BACKEND_RUNTIME_ENV_KEY = 'VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME';

export type RuntimeEnv = Record<string, string | undefined>;

export const BACKEND_MIGRATION_RUNTIME_ENV_KEYS = Array.from(new Set([
  ...Object.values(BACKEND_MIGRATION_FEATURE_GATES),
  BACKEND_MIGRATION_WRITER_LEASE_GUARD_ENV_KEY,
  BACKEND_MIGRATION_AI_BACKEND_RUNTIME_ENV_KEY,
]));

export const BACKEND_MIGRATION_RELEASE_DEFAULT_ENV: RuntimeEnv = {
  [BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay]: 'true',
  [BACKEND_MIGRATION_WRITER_LEASE_GUARD_ENV_KEY]: 'true',
  [BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay]: 'true',
  [BACKEND_MIGRATION_FEATURE_GATES.kernelTransactionIngest]: 'false',
  [BACKEND_MIGRATION_FEATURE_GATES.privateApi]: 'false',
  [BACKEND_MIGRATION_AI_BACKEND_RUNTIME_ENV_KEY]: 'false',
};

export interface BackendMigrationRuntimePolicy {
  flags: {
    backendWorker: boolean;
    writerLeaseGuard: boolean;
    autoCardDecisionRelay: boolean;
    kernelTransactionIngest: boolean;
    privateApi: boolean;
    aiBackendRuntime: boolean;
  };
  capabilities: {
    backendWorkerAvailable: boolean;
    writerRelayRuntimeEnabled: boolean;
    writerRelayRequiredForBackendWrites: boolean;
    reviewFeedbackWriteEnabled: boolean;
    autoCardExecuteWriteEnabled: boolean;
    autoCardDecisionBackendEnabled: boolean;
    kernelTransactionIngestEnabled: boolean;
    privateApiReadEnabled: boolean;
    privateApiMutationEnabled: boolean;
    aiBackendSessionEnabled: boolean;
  };
  behavior: {
    reviewWrites: RuntimeFamilyPolicy;
    autoCardWrites: RuntimeFamilyPolicy;
    kernelTransactionWrites: RuntimeFamilyPolicy;
    privateMutationWrites: RuntimeFamilyPolicy;
    browserReads: RuntimeFamilyPolicy;
    aiBackend: RuntimeFamilyPolicy;
    privateApi: RuntimeFamilyPolicy;
  };
}

interface RuntimeFamilyPolicy {
  owner: 'backend-worker' | 'writer-relay' | 'compatibility-read';
  rollbackMode: 'disable-feature-flag' | 'return-unavailable' | 'compatibility-read-only';
  unavailableCode: 'BACKEND_UNAVAILABLE';
}

export function resolveBackendMigrationRuntimePolicy(env: RuntimeEnv): BackendMigrationRuntimePolicy {
  const gates = resolveBackendFeatureGates(env);
  const flags = {
    backendWorker: gates[BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay] === true,
    writerLeaseGuard: readBooleanEnv(env, BACKEND_MIGRATION_WRITER_LEASE_GUARD_ENV_KEY, false),
    autoCardDecisionRelay: gates[BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay] === true,
    kernelTransactionIngest: gates[BACKEND_MIGRATION_FEATURE_GATES.kernelTransactionIngest] === true,
    privateApi: gates[BACKEND_MIGRATION_FEATURE_GATES.privateApi] === true,
    aiBackendRuntime: readBooleanEnv(env, BACKEND_MIGRATION_AI_BACKEND_RUNTIME_ENV_KEY, false),
  };

  const backendWorkerAvailable = flags.backendWorker;
  const writerRelayRuntimeEnabled = backendWorkerAvailable && flags.writerLeaseGuard;
  const writerRelayRequiredForBackendWrites = true;
  const reviewFeedbackWriteEnabled = backendWorkerAvailable && flags.writerLeaseGuard;
  const autoCardExecuteWriteEnabled = backendWorkerAvailable && flags.writerLeaseGuard;
  const autoCardDecisionBackendEnabled = flags.autoCardDecisionRelay && backendWorkerAvailable && flags.writerLeaseGuard;
  const kernelTransactionIngestEnabled = flags.kernelTransactionIngest && backendWorkerAvailable && flags.writerLeaseGuard;
  const privateApiReadEnabled = flags.privateApi && backendWorkerAvailable;
  const privateApiMutationEnabled = flags.privateApi && backendWorkerAvailable && flags.writerLeaseGuard;
  const aiBackendSessionEnabled = flags.aiBackendRuntime && backendWorkerAvailable;

  return {
    flags,
    capabilities: {
      backendWorkerAvailable,
      writerRelayRuntimeEnabled,
      writerRelayRequiredForBackendWrites,
      reviewFeedbackWriteEnabled,
      autoCardExecuteWriteEnabled,
      autoCardDecisionBackendEnabled,
      kernelTransactionIngestEnabled,
      privateApiReadEnabled,
      privateApiMutationEnabled,
      aiBackendSessionEnabled,
    },
    behavior: {
      reviewWrites: {
        owner: 'writer-relay',
        rollbackMode: 'return-unavailable',
        unavailableCode: 'BACKEND_UNAVAILABLE',
      },
      autoCardWrites: {
        owner: 'writer-relay',
        rollbackMode: 'return-unavailable',
        unavailableCode: 'BACKEND_UNAVAILABLE',
      },
      kernelTransactionWrites: {
        owner: 'writer-relay',
        rollbackMode: 'return-unavailable',
        unavailableCode: 'BACKEND_UNAVAILABLE',
      },
      privateMutationWrites: {
        owner: 'writer-relay',
        rollbackMode: 'return-unavailable',
        unavailableCode: 'BACKEND_UNAVAILABLE',
      },
      browserReads: {
        owner: 'backend-worker',
        rollbackMode: 'return-unavailable',
        unavailableCode: 'BACKEND_UNAVAILABLE',
      },
      aiBackend: {
        owner: 'backend-worker',
        rollbackMode: 'disable-feature-flag',
        unavailableCode: 'BACKEND_UNAVAILABLE',
      },
      privateApi: {
        owner: 'backend-worker',
        rollbackMode: 'disable-feature-flag',
        unavailableCode: 'BACKEND_UNAVAILABLE',
      },
    },
  };
}

export function collectBackendMigrationRuntimeEnv(
  primary: RuntimeEnv = {},
  fallback: RuntimeEnv = {},
  defaults: RuntimeEnv = BACKEND_MIGRATION_RELEASE_DEFAULT_ENV,
): RuntimeEnv {
  const env: RuntimeEnv = {};
  for (const key of BACKEND_MIGRATION_RUNTIME_ENV_KEYS) {
    const primaryValue = normalizeEnvValue(primary[key]);
    const fallbackValue = normalizeEnvValue(fallback[key]);
    const defaultValue = normalizeEnvValue(defaults[key]);
    env[key] = primaryValue ?? fallbackValue ?? defaultValue;
  }
  return env;
}

export function readBooleanEnv(env: RuntimeEnv, key: string, fallback: boolean): boolean {
  const raw = String(env[key] || '').trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function normalizeEnvValue(value: unknown): string | undefined {
  if (typeof value === 'undefined' || value === null) {
    return undefined;
  }
  return String(value).trim();
}
