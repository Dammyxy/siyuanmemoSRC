import { describe, expect, it } from 'vitest';
import {
  BACKEND_MIGRATION_FEATURE_GATES,
  BACKEND_MIGRATION_OWNERSHIP_MAP,
  getMigratedStateFamily,
  listMigratedStateFamilies,
} from '../backendMigration/ownershipMap';

describe('backend migration ownership map', () => {
  it('covers required families with one active writer', () => {
    const requiredFamilies = [
      'autocard.decision',
      'autocard.execute',
      'topic-derived',
      'xiuyuan.command',
      'review.feedback',
      'queue.scheduler',
      'kernel.transaction',
      'private.read',
      'private.mutation',
      'compatibility.read',
    ];
    const families = listMigratedStateFamilies();
    expect(families.map((family) => family.familyId)).toEqual(expect.arrayContaining(requiredFamilies));
    for (const family of families) {
      expect(family.allowedWriters.length).toBe(1);
      if (family.storage === 'siyuanmemo.db') {
        expect(family.allowedWriters[0]).not.toBe('kernel-companion');
      }
    }
  });

  it('exposes stable lookup by family id', () => {
    const family = getMigratedStateFamily('private.mutation');
    expect(family).toBeTruthy();
    expect(family?.targetOwner).toBe('writer-relay');
    expect(family?.rollbackMode).toBe('return-unavailable');
  });

  it('publishes feature gates for runtime routing decisions', () => {
    expect(BACKEND_MIGRATION_FEATURE_GATES.autocardDecisionRelay).toBe('VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY');
    expect(BACKEND_MIGRATION_FEATURE_GATES.privateApi).toBe('VITE_SIYUANMEMO_ENABLE_PRIVATE_API');
    expect(BACKEND_MIGRATION_OWNERSHIP_MAP.length).toBeGreaterThan(0);
  });
});
