import { describe, expect, it } from 'vitest';
import { getMigratedStateFamily } from '@/application/backendMigration/ownershipMap';

describe('Backend migration compatibility reads', () => {
  it('keeps compatibility.read as explicit read-only owner with zero legacy readers after cutover', () => {
    const family = getMigratedStateFamily('compatibility.read');
    expect(family).toBeTruthy();
    expect(family?.currentOwner).toBe('compatibility-read');
    expect(family?.targetOwner).toBe('compatibility-read');
    expect(family?.rollbackMode).toBe('compatibility-read-only');
    expect(family?.allowedReaders).toEqual([]);
    expect(family?.compatibilityReads).toEqual([]);
    expect(family?.diagnostics).toEqual(expect.arrayContaining(['source', 'allowedUntil', 'removalCondition']));
  });
});
