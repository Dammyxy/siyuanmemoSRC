import { BACKEND_MIGRATION_FEATURE_GATES } from '@/application/backendMigration/ownershipMap';

export interface BackendFeatureGateRow {
  gate: string;
  purpose: string;
  status: 'retained';
  retentionReason: string;
  reviewAfter: string;
  rollbackMode: 'disable-feature-flag' | 'return-unavailable' | 'compatibility-read-only';
  owner: 'application-command' | 'backend-worker' | 'writer-relay' | 'compatibility-read';
  defaultEnabled: boolean;
}

export const BACKEND_FEATURE_GATE_MATRIX: BackendFeatureGateRow[] = [
  {
    gate: BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay,
    purpose: 'writer-routed autocard decision ownership',
    status: 'retained',
    retentionReason: 'relay ownership remains required for writer/follower multi-window cutover safety',
    reviewAfter: '2026-08-01',
    rollbackMode: 'disable-feature-flag',
    owner: 'writer-relay',
    defaultEnabled: true,
  },
  {
    gate: BACKEND_MIGRATION_FEATURE_GATES.autocardExecuteRelay,
    purpose: 'backend worker execute/review ownership',
    status: 'retained',
    retentionReason: 'backend execute ownership is enforced and still needs rollback control during phase-9 hardening',
    reviewAfter: '2026-08-01',
    rollbackMode: 'disable-feature-flag',
    owner: 'backend-worker',
    defaultEnabled: true,
  },
  {
    gate: BACKEND_MIGRATION_FEATURE_GATES.kernelTransactionIngest,
    purpose: 'kernel transaction ingest queue ownership',
    status: 'retained',
    retentionReason: 'kernel sidecar ingest remains feature-gated while writer handover smoke coverage is expanded',
    reviewAfter: '2026-08-01',
    rollbackMode: 'return-unavailable',
    owner: 'backend-worker',
    defaultEnabled: true,
  },
  {
    gate: BACKEND_MIGRATION_FEATURE_GATES.privateApi,
    purpose: 'private read/mutation API routing',
    status: 'retained',
    retentionReason: 'private API remains staged and disabled by default until production mutation family rollout completes',
    reviewAfter: '2026-08-01',
    rollbackMode: 'disable-feature-flag',
    owner: 'writer-relay',
    defaultEnabled: false,
  },
];

export function resolveBackendFeatureGates(env: Record<string, string | undefined>): Record<string, boolean> {
  const resolved: Record<string, boolean> = {};
  for (const row of BACKEND_FEATURE_GATE_MATRIX) {
    const raw = String(env[row.gate] || '').trim().toLowerCase();
    resolved[row.gate] = raw
      ? raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
      : row.defaultEnabled;
  }
  return resolved;
}
