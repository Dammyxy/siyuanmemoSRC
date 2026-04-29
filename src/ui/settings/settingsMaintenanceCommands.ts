import { computed, ref, watch } from 'vue';
import {
  buildSettingsBlockAttrsCleanupAttrRows,
  buildSettingsBlockAttrsCleanupConfirmMessages,
  canRunSettingsBlockAttrsCleanup,
  getSettingsBlockAttrsCleanupErrorMessage,
  hasSettingsBlockAttrsCleanupScan,
  shouldResetSettingsBlockAttrsCleanupForModeChange,
  type SettingsBlockAttrsCleanupMode,
  type SettingsBlockAttrsCleanupRunResult,
  type SettingsBlockAttrsCleanupScanResult,
  type SettingsMaintenanceI18nLookup,
} from './settingsMaintenanceViewModel';

export interface SettingsMaintenanceCommandsInput {
  t: SettingsMaintenanceI18nLookup;
  confirm?: (message: string) => boolean;
  scanBlockAttrsCleanup: (
    mode: SettingsBlockAttrsCleanupMode,
  ) => Promise<SettingsBlockAttrsCleanupScanResult>;
  runBlockAttrsCleanup: (
    mode: SettingsBlockAttrsCleanupMode,
  ) => Promise<SettingsBlockAttrsCleanupRunResult>;
}

export function useSettingsMaintenanceCommands(input: SettingsMaintenanceCommandsInput) {
  const confirm = input.confirm || ((message: string) => window.confirm(message));
  const blockAttrsCleanupMode = ref<SettingsBlockAttrsCleanupMode>('safe');
  const blockAttrsCleanupScanResult = ref<SettingsBlockAttrsCleanupScanResult | null>(null);
  const blockAttrsCleanupRunResult = ref<SettingsBlockAttrsCleanupRunResult | null>(null);
  const blockAttrsCleanupBusy = ref(false);
  const blockAttrsCleanupError = ref('');
  const blockAttrsCleanupHasScan = computed(() => hasSettingsBlockAttrsCleanupScan(blockAttrsCleanupScanResult.value));
  const blockAttrsCleanupAttrRows = computed(() => buildSettingsBlockAttrsCleanupAttrRows(blockAttrsCleanupScanResult.value));

  watch(
    () => blockAttrsCleanupMode.value,
    (mode, previousMode) => {
      if (!shouldResetSettingsBlockAttrsCleanupForModeChange(mode, previousMode)) {
        return;
      }
      blockAttrsCleanupScanResult.value = null;
      blockAttrsCleanupRunResult.value = null;
      blockAttrsCleanupError.value = '';
    },
  );

  async function handleScanBlockAttrsCleanup(): Promise<void> {
    if (blockAttrsCleanupBusy.value) {
      return;
    }
    blockAttrsCleanupBusy.value = true;
    blockAttrsCleanupError.value = '';
    blockAttrsCleanupRunResult.value = null;
    try {
      blockAttrsCleanupScanResult.value = await input.scanBlockAttrsCleanup(blockAttrsCleanupMode.value);
    } catch (error) {
      blockAttrsCleanupError.value = getSettingsBlockAttrsCleanupErrorMessage(error, '扫描失败');
    } finally {
      blockAttrsCleanupBusy.value = false;
    }
  }

  async function handleRunBlockAttrsCleanup(): Promise<void> {
    if (!canRunSettingsBlockAttrsCleanup({
      busy: blockAttrsCleanupBusy.value,
      scanResult: blockAttrsCleanupScanResult.value,
    })) {
      return;
    }

    for (const message of buildSettingsBlockAttrsCleanupConfirmMessages({
      mode: blockAttrsCleanupMode.value,
      t: input.t,
    })) {
      if (!confirm(message)) {
        return;
      }
    }

    blockAttrsCleanupBusy.value = true;
    blockAttrsCleanupError.value = '';
    try {
      blockAttrsCleanupRunResult.value = await input.runBlockAttrsCleanup(blockAttrsCleanupMode.value);
    } catch (error) {
      blockAttrsCleanupError.value = getSettingsBlockAttrsCleanupErrorMessage(error, '执行失败');
    } finally {
      blockAttrsCleanupBusy.value = false;
    }
  }

  return {
    blockAttrsCleanupMode,
    blockAttrsCleanupScanResult,
    blockAttrsCleanupRunResult,
    blockAttrsCleanupBusy,
    blockAttrsCleanupError,
    blockAttrsCleanupHasScan,
    blockAttrsCleanupAttrRows,
    handleScanBlockAttrsCleanup,
    handleRunBlockAttrsCleanup,
  };
}
