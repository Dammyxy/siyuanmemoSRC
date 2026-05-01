import { BACKEND_MIGRATION_OWNERSHIP_MAP, type MigratedStateFamily } from '@/application/backendMigration/ownershipMap';

export interface BackendParityCheckInput {
  familyId: string;
  expectedOwner: MigratedStateFamily['targetOwner'];
  diagnosticsPresent?: string[];
}

export interface BackendParityCheckResult {
  familyId: string;
  passed: boolean;
  reason: string | null;
}

export function runBackendParityChecks(checks: BackendParityCheckInput[]): BackendParityCheckResult[] {
  return checks.map((check) => {
    const family = BACKEND_MIGRATION_OWNERSHIP_MAP.find((entry) => entry.familyId === check.familyId);
    if (!family) {
      return {
        familyId: check.familyId,
        passed: false,
        reason: 'family-not-found',
      };
    }
    if (family.targetOwner !== check.expectedOwner) {
      return {
        familyId: check.familyId,
        passed: false,
        reason: `owner-mismatch:${family.targetOwner}`,
      };
    }
    const diagnosticsPresent = new Set(check.diagnosticsPresent || []);
    for (const required of family.diagnostics) {
      if (!diagnosticsPresent.has(required)) {
        return {
          familyId: check.familyId,
          passed: false,
          reason: `diagnostic-missing:${required}`,
        };
      }
    }
    return {
      familyId: check.familyId,
      passed: true,
      reason: null,
    };
  });
}

export function summarizeBackendParity(results: BackendParityCheckResult[]): {
  passed: boolean;
  failedFamilies: string[];
} {
  const failedFamilies = results.filter((result) => !result.passed).map((result) => result.familyId);
  return {
    passed: failedFamilies.length === 0,
    failedFamilies,
  };
}
