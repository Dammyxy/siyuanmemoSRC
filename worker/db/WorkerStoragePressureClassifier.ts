import {
  STORAGE_PRESSURE_RECORD_VERSION,
  type StorageInventoryMetric,
  type StoragePressureLevel,
  type StoragePressureMetric,
  type StoragePressureRecord,
} from '../../packages/contracts/src/backend-rpc';

export interface WorkerStorageBudgetThresholds {
  target: number;
  soft: number;
  high: number;
  hard: number;
}

export interface WorkerStorageBudgetPolicy {
  family: string;
  files?: WorkerStorageBudgetThresholds;
  bytes?: WorkerStorageBudgetThresholds;
  oldestAgeMs?: WorkerStorageBudgetThresholds;
  generations?: WorkerStorageBudgetThresholds;
}

const MIB = 1024 * 1024;

function thresholds(
  target: number,
  soft: number,
  high: number,
  hard: number,
): WorkerStorageBudgetThresholds {
  return { target, soft, high, hard };
}

export const DEFAULT_WORKER_STORAGE_BUDGET_POLICIES = [
  {
    family: 'sqlite-delta',
    files: thresholds(16, 32, 48, 64),
    bytes: thresholds(1 * MIB, 2 * MIB, 3 * MIB, 4 * MIB),
  },
  {
    family: 'review-events',
    files: thresholds(16, 48, 72, 96),
    bytes: thresholds(16 * MIB, 48 * MIB, 72 * MIB, 96 * MIB),
    generations: thresholds(1, 2, 3, 4),
  },
  {
    family: 'card-memory-facts',
    files: thresholds(16, 48, 72, 96),
    bytes: thresholds(32 * MIB, 96 * MIB, 144 * MIB, 192 * MIB),
    generations: thresholds(2, 3, 4, 5),
  },
  {
    family: 'queue-facts',
    files: thresholds(16, 48, 72, 96),
    bytes: thresholds(32 * MIB, 96 * MIB, 144 * MIB, 192 * MIB),
    generations: thresholds(2, 3, 4, 5),
  },
  {
    family: 'temporary-sqlite-projection',
    bytes: thresholds(32 * MIB, 64 * MIB, 96 * MIB, 128 * MIB),
  },
] as const satisfies readonly WorkerStorageBudgetPolicy[];

const LEVEL_ORDER: Record<StoragePressureLevel, number> = {
  normal: 0,
  soft: 1,
  high: 2,
  hard: 3,
};

function maxLevel(left: StoragePressureLevel, right: StoragePressureLevel): StoragePressureLevel {
  return LEVEL_ORDER[right] > LEVEL_ORDER[left] ? right : left;
}

function validateThresholds(
  policy: WorkerStorageBudgetPolicy,
  dimension: string,
  value: WorkerStorageBudgetThresholds | undefined,
): WorkerStorageBudgetThresholds | null {
  if (!value) {
    return null;
  }
  const normalized = {
    target: Math.max(0, Math.floor(Number(value.target))),
    soft: Math.max(0, Math.floor(Number(value.soft))),
    high: Math.max(0, Math.floor(Number(value.high))),
    hard: Math.max(0, Math.floor(Number(value.hard))),
  };
  if (
    !Number.isFinite(normalized.target)
    || !Number.isFinite(normalized.soft)
    || !Number.isFinite(normalized.high)
    || !Number.isFinite(normalized.hard)
    || normalized.target > normalized.soft
    || normalized.soft > normalized.high
    || normalized.high > normalized.hard
  ) {
    throw new Error(`Invalid storage budget thresholds: ${policy.family}:${dimension}`);
  }
  return normalized;
}

function classifyDimension(
  label: string,
  value: number | null,
  limits: WorkerStorageBudgetThresholds | null,
): { level: StoragePressureLevel; reason: string | null } {
  if (value === null || limits === null) {
    return { level: 'normal', reason: null };
  }
  if (value >= limits.hard) {
    return { level: 'hard', reason: `${label}=${value} >= hard=${limits.hard}` };
  }
  if (value >= limits.high) {
    return { level: 'high', reason: `${label}=${value} >= high=${limits.high}` };
  }
  if (value >= limits.soft) {
    return { level: 'soft', reason: `${label}=${value} >= soft=${limits.soft}` };
  }
  return { level: 'normal', reason: null };
}

function toPressureMetric(
  metric: StorageInventoryMetric,
  policy: WorkerStorageBudgetPolicy | undefined,
): StoragePressureMetric {
  const fileLimits = validateThresholds(policy ?? { family: metric.family }, 'files', policy?.files);
  const byteLimits = validateThresholds(policy ?? { family: metric.family }, 'bytes', policy?.bytes);
  const ageLimits = validateThresholds(policy ?? { family: metric.family }, 'oldestAgeMs', policy?.oldestAgeMs);
  const generationLimits = validateThresholds(
    policy ?? { family: metric.family },
    'generations',
    policy?.generations,
  );
  const evidence = [
    classifyDimension('files', metric.files, fileLimits),
    classifyDimension('bytes', metric.bytes, byteLimits),
    classifyDimension('oldestAgeMs', metric.oldestAgeMs, ageLimits),
    classifyDimension('generations', metric.generationCount, generationLimits),
  ];
  const level = evidence.reduce<StoragePressureLevel>(
    (current, item) => maxLevel(current, item.level),
    'normal',
  );
  const reasons = evidence
    .filter((item) => item.level === level && item.reason)
    .map((item) => item.reason);
  return {
    family: metric.family,
    deviceId: metric.deviceId,
    identityEpoch: metric.identityEpoch,
    level,
    files: metric.files,
    bytes: metric.bytes,
    oldestAgeMs: metric.oldestAgeMs,
    targetFiles: fileLimits?.target ?? null,
    softFiles: fileLimits?.soft ?? null,
    highFiles: fileLimits?.high ?? null,
    hardFiles: fileLimits?.hard ?? null,
    targetBytes: byteLimits?.target ?? null,
    softBytes: byteLimits?.soft ?? null,
    highBytes: byteLimits?.high ?? null,
    hardBytes: byteLimits?.hard ?? null,
    targetOldestAgeMs: ageLimits?.target ?? null,
    softOldestAgeMs: ageLimits?.soft ?? null,
    highOldestAgeMs: ageLimits?.high ?? null,
    hardOldestAgeMs: ageLimits?.hard ?? null,
    targetGenerations: generationLimits?.target ?? null,
    softGenerations: generationLimits?.soft ?? null,
    highGenerations: generationLimits?.high ?? null,
    hardGenerations: generationLimits?.hard ?? null,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}

export function classifyWorkerStoragePressure(
  inventoryMetrics: StorageInventoryMetric[],
  measuredAt: number,
  policies: readonly WorkerStorageBudgetPolicy[] = DEFAULT_WORKER_STORAGE_BUDGET_POLICIES,
): StoragePressureRecord {
  const policyByFamily = new Map(policies.map((policy) => [policy.family, policy]));
  const metrics = inventoryMetrics.map((metric) => toPressureMetric(
    metric,
    policyByFamily.get(metric.family),
  ));
  const level = metrics.reduce<StoragePressureLevel>(
    (current, metric) => maxLevel(current, metric.level),
    'normal',
  );
  const blockingReasons = metrics
    .filter((metric) => metric.level === level && metric.reason)
    .map((metric) => `${metric.family}:${metric.deviceId ?? 'unassigned'}:${metric.reason}`);
  return {
    version: STORAGE_PRESSURE_RECORD_VERSION,
    level,
    measuredAt,
    metrics,
    blockingMutationGrowth: false,
    code: null,
    reason: blockingReasons.length > 0 ? blockingReasons.join(' | ') : null,
  };
}
