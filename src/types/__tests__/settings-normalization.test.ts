import { describe, expect, it } from 'vitest';
import type { PluginSettings } from '../settings';
import { ARENA_DEFAULT_OFF_MIGRATION_VERSION, SRS_ARENA_CONTESTANT_SET_VERSION } from '../arena';
import {
  ACTIVE_AI_PROMPT_CONTRACT_VERSION,
  ACTIVE_FSRS_VERSION,
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_SETTINGS,
  FSRS_WEIGHT_COUNT,
  LEGACY_FSRS_V5,
  normalizeAISettings,
  normalizePluginSettings,
  type AISettings,
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

  it('fills Arena defaults when arena settings are missing without touching AI or scheduler settings', () => {
    const legacy = cloneSettings();
    const originalAI = JSON.parse(JSON.stringify(legacy.ai));
    const originalScheduler = JSON.parse(JSON.stringify(legacy.scheduler));
    delete (legacy as Partial<typeof legacy>).arena;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai).toEqual(originalAI);
    expect(normalized.settings.scheduler).toEqual(originalScheduler);
    expect(normalized.settings.arena.defaultOffMigrationVersion).toBe(ARENA_DEFAULT_OFF_MIGRATION_VERSION);
    expect(normalized.settings.arena.enabled).toBe(false);
    expect(Object.keys(normalized.settings.arena.ai.scenarios).sort()).toEqual([
      'candidate-card-generation',
      'card-prompt-rewrite',
      'concept-expression-coach',
      'descriptor-augmentation',
      'note-refinement',
      'topic-auto-card',
    ]);
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

  it('keeps Arena enabled after the default-off migration has already run', () => {
    const current = cloneSettings();
    current.arena.defaultOffMigrationVersion = ARENA_DEFAULT_OFF_MIGRATION_VERSION;
    current.arena.enabled = true;

    const normalized = normalizePluginSettings(current);

    expect(normalized.settings.arena.defaultOffMigrationVersion).toBe(ARENA_DEFAULT_OFF_MIGRATION_VERSION);
    expect(normalized.settings.arena.enabled).toBe(true);
  });

  it('prefers legacy single-provider AI fields when providers still contain only the empty default', () => {
    const normalized = normalizeAISettings({
      ...DEFAULT_SETTINGS.ai,
      enabled: true,
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'legacy-key',
      model: 'deepseek-chat',
    } satisfies AISettings);

    expect(normalized.apiKey).toBe('legacy-key');
    expect(normalized.baseUrl).toBe('https://api.deepseek.com');
    expect(normalized.model).toBe('deepseek-chat');
    expect(normalized.defaultModelId).toBe('deepseek-chat');
    expect(normalized.providers[0].id).toBe('deepseek');
    expect(normalized.providers[0].apiKey).toBe('legacy-key');
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

  it('normalizes AI tool defaults and preserves explicitly enabled tools', () => {
    const legacy = cloneSettings();
    legacy.ai.toolPolicies = {
      ...legacy.ai.toolPolicies,
      toolDefaults: {
        StageFlashcardDraft: true,
        ReadBlock: false,
      },
    };

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(false);
    expect(normalized.settings.ai.toolPolicies.toolDefaults).toEqual({
      StageFlashcardDraft: true,
      ReadBlock: false,
    });
  });

  it('fills nested AI prompt defaults when partially configured', () => {
    const legacy = cloneSettings();
    legacy.ai = {
      ...DEFAULT_SETTINGS.ai,
      prompts: {
        skills: {
          conceptCoach: {
            baseRun: 'custom base',
            tabs: {
              'working-definition': {
                run: 'custom working definition',
              },
            },
          },
        },
      },
    } as typeof legacy.ai;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.ai.prompts.skills.conceptCoach.baseRun).toBe('custom base');
    expect(normalized.settings.ai.prompts.skills.conceptCoach.tabs['working-definition']).toEqual({
      run: 'custom working definition',
      followUp: DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach.tabs['working-definition'].followUp,
    });
    expect(normalized.settings.ai.prompts.skills.conceptCoach.tabs.perspectives)
      .toEqual(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach.tabs.perspectives);
  });

  it('ships the concept-coach AI default prompt set', () => {
    expect(DEFAULT_SETTINGS.ai.promptContractVersion).toBe(ACTIVE_AI_PROMPT_CONTRACT_VERSION);
    expect(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach.baseRun).toContain('学习教练');
    expect(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach.baseRun).toContain('已有水平=略懂');
    expect(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach.baseRun).not.toContain('workingDefinition');
    expect(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach.tabs['self-test-cards'].run).toContain('高质量自测问答卡');
    expect(DEFAULT_SETTINGS.ai.prompts.skills.conceptCoach.tabs['self-test-cards'].run).toContain('3-20 个字');
    expect(DEFAULT_SETTINGS.ai.conceptCoach.selfTest.defaultCreationMode).toBe('list-item');
    expect(DEFAULT_SETTINGS.ai.chatDefaults.reviewDefaultSkillId).toBe('general-chat');
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

  it('resets legacy flat prompt strings to the current skill defaults and ignores legacy promptProfiles', () => {
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
    expect(normalized.settings.ai.prompts).toEqual(DEFAULT_SETTINGS.ai.prompts);
  });

  it('normalizes declarative user skills and resolves reserved or duplicate ids', () => {
    const normalized = normalizeAISettings({
      ...DEFAULT_SETTINGS.ai,
      userSkills: [
        {
          id: 'general-chat',
          title: 'Chat Skill',
          enabled: true,
          mode: 'chat',
          systemPromptTemplate: 'Chat prompt',
          composerPreset: 'Ask',
          primaryActionLabel: 'Chat',
          defaultToolGroups: ['context-read', 'invalid-tool'],
          sections: [],
          version: 1,
        },
        {
          id: 'outline',
          title: 'Outline',
          enabled: true,
          mode: 'structured',
          systemPromptTemplate: 'Structured prompt',
          composerPreset: 'Run',
          primaryActionLabel: 'Run',
          defaultToolGroups: ['context-read'],
          sections: [
            {
              id: 'summary',
              title: 'Summary',
              responseKey: 'summary',
              renderer: 'list',
              runPrompt: 'Generate summary',
              followUpPrompt: 'Follow up',
            },
          ],
          version: 1,
        },
        {
          id: 'outline',
          title: '',
          enabled: true,
          mode: 'structured',
          systemPromptTemplate: 'Disabled prompt',
          composerPreset: 'Run',
          primaryActionLabel: 'Run',
          defaultToolGroups: ['context-read'],
          sections: [],
          version: 1,
        },
      ],
    });

    expect(normalized.userSkills[0]?.id).toBe('general-chat-1');
    expect(normalized.userSkills[0]?.defaultToolGroups).toEqual(['context-read']);
    expect(normalized.userSkills[1]?.sections[0]).toMatchObject({
      id: 'summary',
      responseKey: 'summary',
      renderer: 'list',
      required: true,
    });
    expect(normalized.userSkills[2]?.enabled).toBe(false);
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
