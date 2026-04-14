import { describe, expect, it } from 'vitest';
import type { PluginSettings } from '../settings';
import {
  ACTIVE_FSRS_VERSION,
  createDefaultAIPromptProfileSet,
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

  it('fills AI draft storage defaults when the nested storage config is missing', () => {
    const legacy = cloneSettings();
    delete (legacy.ai as Partial<typeof legacy.ai>).draftStorage;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai.draftStorage).toEqual(DEFAULT_SETTINGS.ai.draftStorage);
  });

  it('keeps progressive excerpt storage in source-child mode but clamps AI draft storage away from it', () => {
    const legacy = cloneSettings();
    legacy.progressiveReading.storage = {
      mode: 'source-child',
      notebookId: 'notebook-a',
      targetBlockId: 'source-block-1',
    };
    legacy.ai.draftStorage = {
      mode: 'source-child' as typeof legacy.ai.draftStorage.mode,
      notebookId: 'notebook-b',
      targetBlockId: 'draft-block-1',
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.progressiveReading.storage).toEqual({
      mode: 'source-child',
      notebookId: 'notebook-a',
      targetBlockId: 'source-block-1',
    });
    expect(normalized.settings.ai.draftStorage).toEqual({
      mode: DEFAULT_SETTINGS.ai.draftStorage.mode,
      notebookId: 'notebook-b',
      targetBlockId: 'draft-block-1',
    });
  });

  it('fills nested AI prompt defaults when partially configured', () => {
    const legacy = cloneSettings();
    legacy.ai = {
      ...DEFAULT_SETTINGS.ai,
      prompts: {
        tutor: 'custom tutor',
      },
    } as typeof legacy.ai;
    delete (legacy.ai as Partial<typeof legacy.ai>).promptProfiles;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai.prompts.tutor).toBe('custom tutor');
    expect(normalized.settings.ai.prompts.explain).toBe(DEFAULT_SETTINGS.ai.prompts.explain);
    expect(normalized.settings.ai.prompts.cardCandidate).toBe(DEFAULT_SETTINGS.ai.prompts.cardCandidate);
    expect(normalized.settings.ai.promptProfiles.tutor).toEqual({
      preset: 'recommended',
      overrideEnabled: true,
      overrideTemplate: 'custom tutor',
    });
  });

  it('ships layered AI default prompts aligned with tutor, explain, and candidate tasks', () => {
    expect(DEFAULT_SETTINGS.ai.prompts.tutor).toContain('AI 导师');
    expect(DEFAULT_SETTINGS.ai.prompts.tutor).toContain('当前批次或路径里的核心线索');
    expect(DEFAULT_SETTINGS.ai.prompts.explain).toContain('学习教练');
    expect(DEFAULT_SETTINGS.ai.prompts.explain).toContain('工作定义');
    expect(DEFAULT_SETTINGS.ai.prompts.explain).toContain('补充理解，不是材料原文直接说明');
    expect(DEFAULT_SETTINGS.ai.prompts.cardCandidate).toContain('6-10 张');
    expect(DEFAULT_SETTINGS.ai.prompts.cardCandidate).toContain('五个视角');
    expect(DEFAULT_SETTINGS.ai.prompts.cardCandidate).toContain('宁可少出');
    expect(DEFAULT_SETTINGS.ai.promptProfiles).toEqual(createDefaultAIPromptProfileSet());
  });

  it('migrates legacy prompt overrides into prompt profiles', () => {
    const legacy = cloneSettings();
    delete (legacy.ai as Partial<typeof legacy.ai>).promptProfiles;
    legacy.ai.prompts = {
      tutor: 'custom tutor profile',
      explain: DEFAULT_SETTINGS.ai.prompts.explain,
      cardCandidate: 'custom card profile',
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai.prompts.tutor).toBe('custom tutor profile');
    expect(normalized.settings.ai.prompts.cardCandidate).toBe('custom card profile');
    expect(normalized.settings.ai.promptProfiles.tutor).toEqual({
      preset: 'recommended',
      overrideEnabled: true,
      overrideTemplate: 'custom tutor profile',
    });
    expect(normalized.settings.ai.promptProfiles.explain).toEqual({
      preset: 'recommended',
      overrideEnabled: false,
      overrideTemplate: '',
    });
    expect(normalized.settings.ai.promptProfiles.cardCandidate).toEqual({
      preset: 'recommended',
      overrideEnabled: true,
      overrideTemplate: 'custom card profile',
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
