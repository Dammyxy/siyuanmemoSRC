import { describe, expect, it } from 'vitest';
import type { PluginSettings } from '../settings';
import {
  ACTIVE_AI_PROMPT_CONTRACT_VERSION,
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
    expect(normalized.settings.progressiveReading.storage).toEqual(DEFAULT_SETTINGS.progressiveReading.storage);
  });

  it('fills missing review UI open-mode defaults and marks settings as changed', () => {
    const legacy = cloneSettings();
    delete (legacy.ui as Partial<typeof legacy.ui>).reviewOpenInNewTabByDefault;
    delete (legacy.ui as Partial<typeof legacy.ui>).reviewOpenFullscreenByDefault;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ui.reviewOpenInNewTabByDefault).toBe(false);
    expect(normalized.settings.ui.reviewOpenFullscreenByDefault).toBe(false);
  });

  it('normalizes the legacy default incremental sync trigger triplet down to plugin-start only', () => {
    const legacy = cloneSettings();
    legacy.riffIntegration = {
      ...legacy.riffIntegration!,
      incrementalSync: {
        ...legacy.riffIntegration!.incrementalSync,
        triggers: ['plugin-start', 'browser-open', 'review-open'],
      },
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.riffIntegration?.incrementalSync.triggers).toEqual(['plugin-start']);
  });

  it('preserves user-customized incremental sync trigger combinations', () => {
    const legacy = cloneSettings();
    legacy.riffIntegration = {
      ...legacy.riffIntegration!,
      incrementalSync: {
        ...legacy.riffIntegration!.incrementalSync,
        triggers: ['plugin-start', 'browser-open'],
      },
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.settings.riffIntegration?.incrementalSync.triggers).toEqual(['plugin-start', 'browser-open']);
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

  it('fills AI defaults when ai settings are missing', () => {
    const legacy = cloneSettings();
    delete (legacy as Partial<typeof legacy>).ai;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai).toEqual(DEFAULT_SETTINGS.ai);
  });

  it('drops legacy AI draft storage config when it is still present', () => {
    const legacy = cloneSettings();
    (legacy.ai as typeof legacy.ai & { draftStorage?: unknown }).draftStorage = {
      mode: 'library',
      notebookId: 'notebook-a',
      targetBlockId: 'block-a',
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai).not.toHaveProperty('draftStorage');
  });

  it('fills nested AI prompt defaults when partially configured', () => {
    const legacy = cloneSettings();
    legacy.ai = {
      ...DEFAULT_SETTINGS.ai,
      prompts: {
        explain: {
          run: 'custom explain',
        },
      },
    } as typeof legacy.ai;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai.prompts.explain).toEqual({
      run: 'custom explain',
      followUp: DEFAULT_SETTINGS.ai.prompts.explain.followUp,
    });
  });

  it('ships the explain-only AI default prompt pair', () => {
    expect(DEFAULT_SETTINGS.ai.promptContractVersion).toBe(ACTIVE_AI_PROMPT_CONTRACT_VERSION);
    expect(DEFAULT_SETTINGS.ai.prompts.explain.run).toContain('学习教练');
    expect(DEFAULT_SETTINGS.ai.prompts.explain.run).not.toContain('workingDefinition');
  });

  it('resets AI prompts to the current behavior-prompt contract when legacy settings lack the new contract version', () => {
    const legacy = cloneSettings();
    delete (legacy.ai as Partial<typeof legacy.ai>).promptContractVersion;
    legacy.ai.prompts = {
      explain: {
        run: 'legacy explain prompt with workingDefinition',
        followUp: 'legacy explain follow-up',
      },
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai.promptContractVersion).toBe(ACTIVE_AI_PROMPT_CONTRACT_VERSION);
    expect(normalized.settings.ai.prompts).toEqual(DEFAULT_SETTINGS.ai.prompts);
  });

  it('migrates legacy flat prompt strings into run prompts and ignores legacy promptProfiles', () => {
    const legacy = cloneSettings();
    (legacy.ai as typeof legacy.ai & { promptProfiles?: Record<string, unknown> }).promptProfiles = {
      explain: {
        preset: 'recommended',
        overrideEnabled: true,
        overrideTemplate: 'should be ignored',
      },
    };
    legacy.ai.prompts = {
      explain: 'custom explain profile',
    } as unknown as typeof legacy.ai.prompts;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai.prompts.explain).toEqual({
      run: 'custom explain profile',
      followUp: DEFAULT_SETTINGS.ai.prompts.explain.followUp,
    });
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
