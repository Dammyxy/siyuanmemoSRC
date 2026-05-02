import { describe, expect, it } from 'vitest';
import { getMigratedStateFamily } from '@/application/backendMigration/ownershipMap';

describe('Backend migration compatibility reads', () => {
  it('marks browser.read as backend-worker owned with explicit unavailable rollback', () => {
    const family = getMigratedStateFamily('browser.read');
    expect(family).toBeTruthy();
    expect(family?.currentOwner).toBe('backend-worker');
    expect(family?.targetOwner).toBe('backend-worker');
    expect(family?.rollbackMode).toBe('return-unavailable');
    expect(family?.allowedReaders).toEqual(expect.arrayContaining([
      'application.services.BrowserApplicationService',
    ]));
    expect(family?.compatibilityReads).toEqual([]);
    expect(family?.diagnostics).toEqual(expect.arrayContaining([
      'queryName',
      'status',
      'unavailableClass',
    ]));
  });
});
