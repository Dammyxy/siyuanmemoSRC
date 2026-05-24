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
      'xiuyuan.sync',
      'progressive.command',
      'topic-derived.command',
      'ai.tool-job',
      'browser.aggregate-read',
      'graph.query',
      'review.riff-feedback',
      'review.source-refresh',
      'compatibility.read',
    ];
    const families = listMigratedStateFamilies();
    expect(families.map((family) => family.familyId)).toEqual(expect.arrayContaining(requiredFamilies));
    for (const family of families) {
      expect(family.allowedWriters.length).toBe(1);
      expect(family.ownerRuntime).toBeTruthy();
      expect(family.contract).toBeTruthy();
      expect(family.writerRelayPolicy).toBeTruthy();
      expect(family.kernelProxyDependency).toBeTruthy();
      expect(family.idempotencyKey).toBeTruthy();
      expect(family.fallbackRemovalCondition).toBeTruthy();
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

  it('classifies retained hotspot renderer effects with removal evidence', () => {
    const retained = listMigratedStateFamilies()
      .flatMap((family) => family.retainedEffects.map((effect) => ({
        familyId: family.familyId,
        effect,
      })));

    expect(retained.map(({ familyId }) => familyId)).toEqual(expect.arrayContaining([
      'xiuyuan.sync',
      'progressive.command',
      'browser.aggregate-read',
      'graph.query',
      'review.riff-feedback',
      'review.source-refresh',
    ]));
    for (const { effect } of retained) {
      expect(effect.owner).toBeTruthy();
      expect(effect.reason).toBeTruthy();
      expect(effect.removalCondition).toBeTruthy();
      expect(effect.validation).toBeTruthy();
    }
  });
});
