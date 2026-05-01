import { describe, expect, it } from 'vitest';
import { getMigratedStateFamily } from '@/application/backendMigration/ownershipMap';

describe('Backend migration compatibility reads', () => {
  it('keeps compatibility.read as explicit read-only owner with Browser SQL/legacy fallback registered', () => {
    const family = getMigratedStateFamily('compatibility.read');
    expect(family).toBeTruthy();
    expect(family?.currentOwner).toBe('compatibility-read');
    expect(family?.targetOwner).toBe('compatibility-read');
    expect(family?.rollbackMode).toBe('compatibility-read-only');
    expect(family?.allowedReaders).toEqual(expect.arrayContaining([
      'application.services.BrowserApplicationService',
    ]));
    expect(family?.compatibilityReads).toEqual(expect.arrayContaining([
      expect.stringContaining('BrowserApplicationService.getDeckPage'),
      expect.stringContaining('BrowserApplicationService.getDeckMatchedIds'),
      expect.stringContaining('BrowserApplicationService.getDeckRowsByIds'),
      expect.stringContaining('BrowserApplicationService.getDueCount/getStats'),
    ]));
    expect(family?.diagnostics).toEqual(expect.arrayContaining([
      'source',
      'allowedUntil',
      'removalCondition',
      'fallbackReason',
    ]));
  });
});
