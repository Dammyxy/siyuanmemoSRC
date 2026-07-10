import { describe, expect, it } from 'vitest';
import type { PluginSettings } from '../settings';
import { ARENA_DEFAULT_OFF_MIGRATION_VERSION, SRS_ARENA_CONTESTANT_SET_VERSION } from '../arena';
import {
  ACTIVE_FSRS_VERSION,
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_SETTINGS,
  FSRS_WEIGHT_COUNT,
  LEGACY_FSRS_V5,
  normalizePluginSettings,
} from '../settings';

function cloneSettings(): PluginSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as PluginSettings;
}

describe('settings normalization', () => {
  it('fills FSRS weights from 19 to 21 with ts-fsrs defaults', () => {
    const legacy = cloneSettings();
    legacy.fsrs.weights = legacy.fsrs.weights.slice(0, FSRS_WEIGHT_COUNT - 2);

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.fsrs.weights).toHaveLength(FSRS_WEIGHT_COUNT);
    expect(normalized.settings.fsrs.weights.slice(0, FSRS_WEIGHT_COUNT - 2)).toEqual(
      legacy.fsrs.weights
    );
    expect(normalized.settings.fsrs.weights.slice(FSRS_WEIGHT_COUNT - 2)).toEqual(
      DEFAULT_FSRS_WEIGHTS.slice(FSRS_WEIGHT_COUNT - 2)
    );
  });

  it('keeps already normalized 21-weight settings unchanged', () => {
    const current = cloneSettings();

    const normalized = normalizePluginSettings(current);

    expect(normalized.changed).toBe(false);
    expect(normalized.settings.fsrs.weights).toHaveLength(FSRS_WEIGHT_COUNT);
    expect(normalized.settings.fsrs.weights).toEqual(current.fsrs.weights);
  });

  it('migrates scheduler aliases from fsrs-v5 to fsrs-v6', () => {
    const legacy = cloneSettings();
    if (!legacy.scheduler) {
      throw new Error('DEFAULT_SETTINGS.scheduler is required for this test');
    }
    legacy.scheduler.defaultScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.defaultScheduler;
    legacy.scheduler.itemScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.itemScheduler;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.scheduler?.defaultScheduler).toBe(ACTIVE_FSRS_VERSION);
    expect(normalized.settings.scheduler?.itemScheduler).toBe(ACTIVE_FSRS_VERSION);
  });

  it('fills SRS v2 scheduler defaults when missing', () => {
    const legacy = cloneSettings();
    if (!legacy.scheduler) {
      throw new Error('DEFAULT_SETTINGS.scheduler is required for this test');
    }
    delete (legacy.scheduler as Partial<typeof legacy.scheduler>).srsV2;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.scheduler?.srsV2).toEqual(DEFAULT_SETTINGS.scheduler?.srsV2);
  });

  it('fills quickCard.flashcard defaults when missing', () => {
    const legacy = cloneSettings();
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcard;
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcardSeededFromSiyuan;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.quickCard.flashcard).toEqual(DEFAULT_SETTINGS.quickCard.flashcard);
    expect(normalized.settings.quickCard.flashcardSeededFromSiyuan).toBe(false);
  });

  it('fills quickCard.topicDerivation defaults when missing', () => {
    const legacy = cloneSettings();
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).topicDerivation;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.quickCard.topicDerivation).toEqual(
      DEFAULT_SETTINGS.quickCard.topicDerivation
    );
  });

  it('fills hyperspace defaults when neural roam settings are missing', () => {
    const legacy = cloneSettings();
    delete (legacy.queues as Partial<typeof legacy.queues>).neuralRoam;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.queues.neuralRoam?.hyperspace).toEqual(
      DEFAULT_SETTINGS.queues.neuralRoam?.hyperspace
    );
  });

  it('fills nested hyperspace tree channel defaults when partially configured', () => {
    const legacy = cloneSettings();
    legacy.queues.neuralRoam = {
      hyperspace: {
        ...DEFAULT_SETTINGS.queues.neuralRoam!.hyperspace,
        treeChannels: {
          blockTree: true,
        },
      },
    } as typeof legacy.queues.neuralRoam;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.queues.neuralRoam?.hyperspace.treeChannels.blockTree).toBe(true);
    expect(normalized.settings.queues.neuralRoam?.hyperspace.treeChannels.documentTree).toBe(false);
  });

  it('fills progressiveReading defaults when missing', () => {
    const legacy = cloneSettings();
    delete (legacy as Partial<typeof legacy>).progressiveReading;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.progressiveReading.altXExcerptEnabled).toBe(false);
    expect(normalized.settings.progressiveReading.sourceMarkingEnabled).toBe(true);
    expect(normalized.settings.progressiveReading.storage).toEqual(DEFAULT_SETTINGS.progressiveReading.storage);
  });

  it('fills missing review UI open-mode defaults and marks settings as changed', () => {
    const legacy = cloneSettings();
    delete (legacy.ui as Partial<typeof legacy.ui>).reviewOpenInNewTabByDefault;
    delete (legacy.ui as Partial<typeof legacy.ui>).reviewOpenFullscreenByDefault;
    delete (legacy.ui as Partial<typeof legacy.ui>).reviewSourceBlockRefreshEnabled;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ui.reviewOpenInNewTabByDefault).toBe(false);
    expect(normalized.settings.ui.reviewOpenFullscreenByDefault).toBe(false);
    expect(normalized.settings.ui.reviewSourceBlockRefreshEnabled).toBe(false);
  });

  it('fills missing storage conflict resolution with merge', () => {
    const legacy = cloneSettings();
    delete (legacy as Partial<PluginSettings>).storageConflictResolution;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.storageConflictResolution).toBe('merge');
  });

  it('migrates legacy nested conflict resolution and drops retired Riff settings', () => {
    const legacy = cloneSettings() as PluginSettings & {
      riffIntegration?: {
        storageConflictResolution?: string;
        incrementalSync?: unknown;
        fullSync?: unknown;
        deleteSync?: unknown;
      };
    };
    legacy.riffIntegration = {
      storageConflictResolution: 'prefer-remote',
      incrementalSync: { enabled: true },
      fullSync: { enabled: true },
      deleteSync: { enabled: true },
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.storageConflictResolution).toBe('prefer-remote');
    expect(normalized.settings).not.toHaveProperty('riffIntegration');
  });

  it('drops the removed progressiveReading.dailyTraceEnabled field during normalization', () => {
    const legacy = cloneSettings() as PluginSettings & {
      progressiveReading: PluginSettings['progressiveReading'] & { dailyTraceEnabled?: boolean };
    };
    legacy.progressiveReading.dailyTraceEnabled = true;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.progressiveReading).not.toHaveProperty('dailyTraceEnabled');
  });

  it('fills progressive storage defaults when the nested storage config is missing', () => {
    const legacy = cloneSettings();
    delete (legacy.progressiveReading as Partial<typeof legacy.progressiveReading>).storage;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.progressiveReading.storage).toEqual(DEFAULT_SETTINGS.progressiveReading.storage);
  });

  it('fills progressive source marking default when missing', () => {
    const legacy = cloneSettings();
    delete (legacy.progressiveReading as Partial<typeof legacy.progressiveReading>).sourceMarkingEnabled;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.progressiveReading.sourceMarkingEnabled).toBe(true);
  });

  it('drops retired plugin AI settings when legacy persisted data still contains them', () => {
    const legacy = cloneSettings() as PluginSettings & { ai?: unknown };
    legacy.ai = {
      enabled: true,
      apiKey: 'legacy-key',
      promptProfiles: { explain: {} },
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings).not.toHaveProperty('ai');
  });

  it('fills Arena defaults when arena settings are missing without touching scheduler settings', () => {
    const legacy = cloneSettings();
    const originalScheduler = JSON.parse(JSON.stringify(legacy.scheduler));
    delete (legacy as Partial<typeof legacy>).arena;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.scheduler).toEqual(originalScheduler);
    expect(normalized.settings.arena.defaultOffMigrationVersion).toBe(ARENA_DEFAULT_OFF_MIGRATION_VERSION);
    expect(normalized.settings.arena.enabled).toBe(false);
    expect(normalized.settings.arena.ai.scenarios).toEqual({});
    expect(normalized.settings.arena.srs.contestantSetVersion).toBe(SRS_ARENA_CONTESTANT_SET_VERSION);
    expect(normalized.settings.arena.srs.contestantIds).toEqual(['fsrs-v6']);
  });

  it('drops unsupported SRS Arena contestant subsets to the current default set', () => {
    const legacy = cloneSettings();
    legacy.arena.srs.contestantIds = ['fsrs-v6', 'unsupported-a', 'unsupported-b'] as never;
    delete (legacy.arena.srs as Partial<typeof legacy.arena.srs>).contestantSetVersion;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.arena.srs.contestantSetVersion).toBe(SRS_ARENA_CONTESTANT_SET_VERSION);
    expect(normalized.settings.arena.srs.contestantIds).toEqual(['fsrs-v6']);
  });

  it('preserves current SRS Arena contestant subsets after the set migration has run', () => {
    const current = cloneSettings();
    current.arena.srs.contestantSetVersion = SRS_ARENA_CONTESTANT_SET_VERSION;
    current.arena.srs.contestantIds = ['fsrs-v6'];

    const normalized = normalizePluginSettings(current);

    expect(normalized.changed).toBe(false);
    expect(normalized.settings.arena.srs.contestantIds).toEqual(['fsrs-v6']);
  });

  it('turns off pre-migration Arena even when it was previously enabled', () => {
    const legacy = cloneSettings();
    legacy.arena.enabled = true;
    delete (legacy.arena as Partial<typeof legacy.arena>).defaultOffMigrationVersion;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.arena.defaultOffMigrationVersion).toBe(ARENA_DEFAULT_OFF_MIGRATION_VERSION);
    expect(normalized.settings.arena.enabled).toBe(false);
  });

  it('keeps Arena retired even after the default-off migration has already run', () => {
    const current = cloneSettings();
    current.arena.defaultOffMigrationVersion = ARENA_DEFAULT_OFF_MIGRATION_VERSION;
    current.arena.enabled = true;
    current.arena.ai.enabled = true;
    current.arena.manager.activeDomain = 'ai';

    const normalized = normalizePluginSettings(current);

    expect(normalized.settings.arena.defaultOffMigrationVersion).toBe(ARENA_DEFAULT_OFF_MIGRATION_VERSION);
    expect(normalized.changed).toBe(true);
    expect(normalized.settings.arena.enabled).toBe(false);
    expect(normalized.settings.arena.ai.enabled).toBe(false);
    expect(normalized.settings.arena.ai.surfaces).toEqual([]);
    expect(normalized.settings.arena.ai.scenarios).toEqual({});
    expect(normalized.settings.arena.ai.strategyPacks).toEqual([]);
    expect(normalized.settings.arena.manager.activeDomain).toBe('srs');
  });

  it('is idempotent after first normalization', () => {
    const legacy = cloneSettings();
    legacy.fsrs.weights = legacy.fsrs.weights.slice(0, FSRS_WEIGHT_COUNT - 2);
    if (legacy.scheduler) {
      legacy.scheduler.defaultScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.defaultScheduler;
      legacy.scheduler.itemScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.itemScheduler;
    }
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcard;
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcardSeededFromSiyuan;

    const firstPass = normalizePluginSettings(legacy);
    const secondPass = normalizePluginSettings(firstPass.settings);

    expect(firstPass.changed).toBe(true);
    expect(secondPass.changed).toBe(false);
    expect(secondPass.settings).toEqual(firstPass.settings);
  });
});
