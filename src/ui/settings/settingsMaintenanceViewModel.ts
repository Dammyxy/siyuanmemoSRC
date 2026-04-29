export type SettingsBlockAttrsCleanupMode = 'safe' | 'full';

export interface SettingsBlockAttrsCleanupScanResult {
  totalBlocks: number;
  removableBlocks: number;
  attrCounts: Record<string, number>;
  staleXiuyuanCount: number;
  skippedTreeNotFoundCount: number;
}

export type SettingsBlockAttrsCleanupRunResult = SettingsBlockAttrsCleanupScanResult & {
  mode: SettingsBlockAttrsCleanupMode;
  cleanedBlocks: number;
  cleanedAttrs: number;
};

export type SettingsMaintenanceI18nLookup = (key: string, fallback: string) => string;

export function hasSettingsBlockAttrsCleanupScan(
  scanResult: SettingsBlockAttrsCleanupScanResult | null,
): boolean {
  return scanResult !== null;
}

export function buildSettingsBlockAttrsCleanupAttrRows(
  scanResult: SettingsBlockAttrsCleanupScanResult | null,
): Array<[string, number]> {
  const counts = scanResult?.attrCounts || {};
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function shouldResetSettingsBlockAttrsCleanupForModeChange(
  mode: SettingsBlockAttrsCleanupMode,
  previousMode: SettingsBlockAttrsCleanupMode | undefined,
): boolean {
  return previousMode !== undefined && mode !== previousMode;
}

export function canRunSettingsBlockAttrsCleanup(input: {
  busy: boolean;
  scanResult: SettingsBlockAttrsCleanupScanResult | null;
}): boolean {
  return !input.busy && hasSettingsBlockAttrsCleanupScan(input.scanResult);
}

export function getSettingsBlockAttrsCleanupErrorMessage(error: unknown, fallback: string): string {
  return (error instanceof Error ? error.message : String(error)) || fallback;
}

export function buildSettingsBlockAttrsCleanupConfirmMessages(input: {
  mode: SettingsBlockAttrsCleanupMode;
  t: SettingsMaintenanceI18nLookup;
}): string[] {
  if (input.mode === 'full') {
    return [
      input.t('blockAttrsCleanupFullFirstConfirm', 'FULL 模式会清除所有插件块属性（包含 custom-xiuyuan-id 与功能字段），是否继续？'),
      input.t('blockAttrsCleanupFullSecondConfirm', '这是第二次确认：执行后不可恢复，确定立即执行 FULL 清理吗？'),
    ];
  }

  return [
    input.t('blockAttrsCleanupSafeConfirm', '将执行 SAFE 清理（保留功能字段与有效 custom-xiuyuan-id），是否继续？'),
  ];
}
