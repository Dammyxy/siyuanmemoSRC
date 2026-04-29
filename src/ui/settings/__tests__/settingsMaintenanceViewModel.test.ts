import { describe, expect, it } from 'vitest';
import {
  buildSettingsBlockAttrsCleanupAttrRows,
  buildSettingsBlockAttrsCleanupConfirmMessages,
  canRunSettingsBlockAttrsCleanup,
  getSettingsBlockAttrsCleanupErrorMessage,
  hasSettingsBlockAttrsCleanupScan,
  shouldResetSettingsBlockAttrsCleanupForModeChange,
  type SettingsBlockAttrsCleanupScanResult,
} from '../settingsMaintenanceViewModel';

const t = (key: string, fallback: string) => ({
  blockAttrsCleanupSafeConfirm: 'safe confirm',
  blockAttrsCleanupFullFirstConfirm: 'full first',
  blockAttrsCleanupFullSecondConfirm: 'full second',
}[key] || fallback);

const scanResult: SettingsBlockAttrsCleanupScanResult = {
  totalBlocks: 4,
  removableBlocks: 2,
  attrCounts: {
    'custom-b': 3,
    'custom-a': 7,
  },
  staleXiuyuanCount: 1,
  skippedTreeNotFoundCount: 0,
};

describe('settingsMaintenanceViewModel', () => {
  it('projects block-attrs cleanup scan state and attr rows', () => {
    expect(hasSettingsBlockAttrsCleanupScan(null)).toBe(false);
    expect(hasSettingsBlockAttrsCleanupScan(scanResult)).toBe(true);
    expect(buildSettingsBlockAttrsCleanupAttrRows(scanResult)).toEqual([
      ['custom-a', 7],
      ['custom-b', 3],
    ]);
    expect(buildSettingsBlockAttrsCleanupAttrRows(null)).toEqual([]);
  });

  it('guards run eligibility and mode reset behavior', () => {
    expect(canRunSettingsBlockAttrsCleanup({ busy: false, scanResult })).toBe(true);
    expect(canRunSettingsBlockAttrsCleanup({ busy: true, scanResult })).toBe(false);
    expect(canRunSettingsBlockAttrsCleanup({ busy: false, scanResult: null })).toBe(false);
    expect(shouldResetSettingsBlockAttrsCleanupForModeChange('safe', undefined)).toBe(false);
    expect(shouldResetSettingsBlockAttrsCleanupForModeChange('safe', 'safe')).toBe(false);
    expect(shouldResetSettingsBlockAttrsCleanupForModeChange('full', 'safe')).toBe(true);
  });

  it('builds confirmation copy and error messages', () => {
    expect(buildSettingsBlockAttrsCleanupConfirmMessages({ mode: 'safe', t })).toEqual(['safe confirm']);
    expect(buildSettingsBlockAttrsCleanupConfirmMessages({ mode: 'full', t })).toEqual([
      'full first',
      'full second',
    ]);
    expect(getSettingsBlockAttrsCleanupErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(getSettingsBlockAttrsCleanupErrorMessage('', 'fallback')).toBe('fallback');
  });
});
