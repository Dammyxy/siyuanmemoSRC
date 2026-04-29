import {
  getRecommendedPromptTemplateForSetting,
  type AIPromptSettingKey,
} from '@/application/services/AIPromptComposer';
import {
  normalizeArenaSettings,
  type ArenaSettings,
} from '@/types/arena';
import {
  ACTIVE_AI_PROMPT_CONTRACT_VERSION,
  DEFAULT_AI_SETTINGS,
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_SETTINGS,
  normalizeAISettings,
  normalizeAIPromptContractVersion,
  normalizeConfiguredCaptureStorageSettings,
  type AIConceptCoachPromptTemplates,
  type AIGeneralChatPromptTemplate,
  type AISettings,
  type ConfiguredCaptureStorageSettings,
  type QueueSettings,
  type QuickCardSettings,
  type UISettings,
} from '@/types';
import type { SettingsFormState } from './settingsSavePayload';

export function cloneSettingsSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultSettingsFormState(): SettingsFormState {
  return {
    requestRetention: 0.9,
    maximumInterval: 365,
    enableShortTerm: true,
    params: [...DEFAULT_FSRS_WEIGHTS],
    dayStartHour: 4,
    newCardsPerDay: DEFAULT_SETTINGS.newCardsPerDay,
    reviewsPerDay: DEFAULT_SETTINGS.reviewsPerDay,
    autoPostponeEnabled: false,
    autoPostponeSkipTopN: 20,
    autoSortEnabled: true,
    addToOutstandingEveryNth: 2,
    priorityRandomness: 0.1,
    quickCard: createDefaultQuickCardSettings(),
    progressiveAltXExcerptEnabled: false,
    progressiveStorage: createDefaultConfiguredCaptureStorageSettings(DEFAULT_SETTINGS.progressiveReading.storage),
  };
}

export function createDefaultQuickCardSettings(): QuickCardSettings {
  return cloneSettingsSerializable(DEFAULT_SETTINGS.quickCard) as QuickCardSettings;
}

export function mergeQuickCardSettings(source?: Partial<QuickCardSettings>): QuickCardSettings {
  const defaults = createDefaultQuickCardSettings();
  return {
    ...defaults,
    ...(source || {}),
    flashcard: {
      ...defaults.flashcard,
      ...(source?.flashcard || {}),
    },
    enabledSymbols: {
      ...defaults.enabledSymbols,
      ...(source?.enabledSymbols || {}),
    },
    debounceDelay: {
      ...defaults.debounceDelay,
      ...(source?.debounceDelay || {}),
    },
    topicDerivation: {
      ...defaults.topicDerivation,
      ...(source?.topicDerivation || {}),
    },
    descriptorUseXiuyuan: source?.descriptorUseXiuyuan ?? defaults.descriptorUseXiuyuan,
    flashcardSeededFromSiyuan: source?.flashcardSeededFromSiyuan ?? defaults.flashcardSeededFromSiyuan,
  };
}

export function createDefaultQueueSettings(): QueueSettings {
  return cloneSettingsSerializable(DEFAULT_SETTINGS.queues) as QueueSettings;
}

export function mergeQueueSettings(source?: Partial<QueueSettings>): QueueSettings {
  const defaults = createDefaultQueueSettings();
  return {
    ...defaults,
    ...(source || {}),
    neuralWandering: {
      ...defaults.neuralWandering,
      ...(source?.neuralWandering || {}),
      weights: {
        ...defaults.neuralWandering.weights,
        ...(source?.neuralWandering?.weights || {}),
      },
    },
    neuralRoam: {
      ...defaults.neuralRoam,
      ...(source?.neuralRoam || {}),
      history: {
        ...defaults.neuralRoam?.history,
        ...(source?.neuralRoam?.history || {}),
      },
      hyperspace: {
        ...defaults.neuralRoam?.hyperspace,
        ...(source?.neuralRoam?.hyperspace || {}),
        treeChannels: {
          ...defaults.neuralRoam?.hyperspace.treeChannels,
          ...(source?.neuralRoam?.hyperspace?.treeChannels || {}),
        },
      },
    },
    filterGroup: {
      ...defaults.filterGroup,
      ...(source?.filterGroup || {}),
    },
  };
}

export function createDefaultAISettings(): AISettings {
  return cloneSettingsSerializable(DEFAULT_AI_SETTINGS) as AISettings;
}

export function mergeAISettings(source?: Partial<AISettings>): AISettings {
  const legacyAwareSource = (source || {}) as Partial<AISettings> & {
    promptProfiles?: unknown;
    draftStorage?: unknown;
  };
  const {
    promptProfiles: _legacyPromptProfiles,
    draftStorage: _legacyDraftStorage,
    ...sourceWithoutLegacy
  } = legacyAwareSource;
  return normalizeAISettings({
    ...sourceWithoutLegacy,
    promptContractVersion: normalizeAIPromptContractVersion(sourceWithoutLegacy.promptContractVersion)
      || ACTIVE_AI_PROMPT_CONTRACT_VERSION,
  });
}

export function resetAiPromptToRecommended(settingsState: AISettings, settingKey: AIPromptSettingKey): void {
  switch (settingKey) {
    case 'generalChat':
      settingsState.prompts.skills.generalChat = getRecommendedPromptTemplateForSetting(settingKey) as AIGeneralChatPromptTemplate;
      break;
    case 'conceptCoach':
    default:
      settingsState.prompts.skills.conceptCoach = getRecommendedPromptTemplateForSetting(settingKey) as AIConceptCoachPromptTemplates;
      break;
  }
}

export function createDefaultArenaSettings(): ArenaSettings {
  return cloneSettingsSerializable(DEFAULT_SETTINGS.arena) as ArenaSettings;
}

export function mergeArenaSettings(source?: Partial<ArenaSettings>): ArenaSettings {
  return normalizeArenaSettings(source);
}

export function createDefaultUISettings(): UISettings {
  return cloneSettingsSerializable(DEFAULT_SETTINGS.ui) as UISettings;
}

export function mergeUISettings(source?: Partial<UISettings>): UISettings {
  const defaults = createDefaultUISettings();
  return {
    ...defaults,
    ...(source || {}),
  };
}

export function createDefaultConfiguredCaptureStorageSettings(
  source?: Partial<ConfiguredCaptureStorageSettings>,
): ConfiguredCaptureStorageSettings {
  return normalizeConfiguredCaptureStorageSettings(source, {
    allowSourceChild: true,
    fallback: DEFAULT_SETTINGS.progressiveReading.storage,
  });
}

export function mergeConfiguredCaptureStorageSettings(
  source: Partial<ConfiguredCaptureStorageSettings> | undefined,
  defaults: ConfiguredCaptureStorageSettings,
): ConfiguredCaptureStorageSettings {
  return normalizeConfiguredCaptureStorageSettings(source, {
    allowSourceChild: true,
    fallback: defaults,
  });
}
