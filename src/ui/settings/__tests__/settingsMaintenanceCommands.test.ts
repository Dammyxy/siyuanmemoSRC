import { effectScope, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  useSettingsMaintenanceCommands,
  type SettingsMaintenanceCommandsInput,
} from '../settingsMaintenanceCommands';
import type {
  SettingsBlockAttrsCleanupMode,
  SettingsBlockAttrsCleanupRunResult,
  SettingsBlockAttrsCleanupScanResult,
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

const runResult: SettingsBlockAttrsCleanupRunResult = {
  ...scanResult,
  mode: 'safe',
  cleanedBlocks: 2,
  cleanedAttrs: 10,
};

function createCommands(overrides: Partial<SettingsMaintenanceCommandsInput> = {}) {
  const scanBlockAttrsCleanup = overrides.scanBlockAttrsCleanup || vi.fn(async () => scanResult);
  const runBlockAttrsCleanup = overrides.runBlockAttrsCleanup || vi.fn(async () => runResult);
  const confirm = overrides.confirm || vi.fn(() => true);
  const scope = effectScope();
  const commands = scope.run(() => useSettingsMaintenanceCommands({
    t,
    scanBlockAttrsCleanup,
    runBlockAttrsCleanup,
    confirm,
  }))!;

  return {
    commands,
    confirm,
    runBlockAttrsCleanup,
    scanBlockAttrsCleanup,
    scope,
  };
}

describe('settingsMaintenanceCommands', () => {
  it('runs block attrs scan and projects derived rows', async () => {
    const {
      commands,
      scanBlockAttrsCleanup,
      scope,
    } = createCommands();
    commands.blockAttrsCleanupRunResult.value = runResult;

    await commands.handleScanBlockAttrsCleanup();

    expect(scanBlockAttrsCleanup).toHaveBeenCalledWith('safe');
    expect(commands.blockAttrsCleanupScanResult.value).toEqual(scanResult);
    expect(commands.blockAttrsCleanupRunResult.value).toBeNull();
    expect(commands.blockAttrsCleanupHasScan.value).toBe(true);
    expect(commands.blockAttrsCleanupAttrRows.value).toEqual([
      ['custom-a', 7],
      ['custom-b', 3],
    ]);
    scope.stop();
  });

  it('guards run until scan exists and asks for confirmation before executing', async () => {
    const {
      commands,
      confirm,
      runBlockAttrsCleanup,
      scope,
    } = createCommands();

    await commands.handleRunBlockAttrsCleanup();

    expect(confirm).not.toHaveBeenCalled();
    expect(runBlockAttrsCleanup).not.toHaveBeenCalled();

    commands.blockAttrsCleanupScanResult.value = scanResult;
    await commands.handleRunBlockAttrsCleanup();

    expect(confirm).toHaveBeenCalledWith('safe confirm');
    expect(runBlockAttrsCleanup).toHaveBeenCalledWith('safe');
    expect(commands.blockAttrsCleanupRunResult.value).toEqual(runResult);
    scope.stop();
  });

  it('resets stale preview state when cleanup mode changes', async () => {
    const { commands, scope } = createCommands();
    commands.blockAttrsCleanupScanResult.value = scanResult;
    commands.blockAttrsCleanupRunResult.value = runResult;
    commands.blockAttrsCleanupError.value = 'old error';

    commands.blockAttrsCleanupMode.value = 'full';
    await nextTick();

    expect(commands.blockAttrsCleanupScanResult.value).toBeNull();
    expect(commands.blockAttrsCleanupRunResult.value).toBeNull();
    expect(commands.blockAttrsCleanupError.value).toBe('');
    scope.stop();
  });

  it('surfaces scan and run errors without leaving busy state stuck', async () => {
    const scanError = createCommands({
      scanBlockAttrsCleanup: vi.fn(async () => {
        throw new Error('scan boom');
      }),
    });

    await scanError.commands.handleScanBlockAttrsCleanup();

    expect(scanError.commands.blockAttrsCleanupError.value).toBe('scan boom');
    expect(scanError.commands.blockAttrsCleanupBusy.value).toBe(false);
    scanError.scope.stop();

    const runError = createCommands({
      runBlockAttrsCleanup: vi.fn(async (_mode: SettingsBlockAttrsCleanupMode) => {
        throw new Error('run boom');
      }),
    });
    runError.commands.blockAttrsCleanupScanResult.value = scanResult;

    await runError.commands.handleRunBlockAttrsCleanup();

    expect(runError.commands.blockAttrsCleanupError.value).toBe('run boom');
    expect(runError.commands.blockAttrsCleanupBusy.value).toBe(false);
    runError.scope.stop();
  });
});
