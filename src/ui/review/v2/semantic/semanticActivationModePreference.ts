import { DEFAULT_SETTINGS, type PluginSettings } from '@/types/settings';

export type NeuralRoamUserMode = 'orbit' | 'hyperspace' | 'semantic-activation';

export interface NeuralRoamModeOption {
  mode: NeuralRoamUserMode;
  label: string;
  description: string;
  runtimeQueueType: 'neural-roam' | 'semantic-activation';
}

type TranslateFn = (key: string, fallback: string) => string;

export function normalizeNeuralRoamUserMode(value: unknown): NeuralRoamUserMode {
  return value === 'hyperspace' || value === 'semantic-activation' ? value : 'orbit';
}

export function getPreferredNeuralRoamUserMode(settings: Pick<PluginSettings, 'queues'> | null | undefined): NeuralRoamUserMode {
  return normalizeNeuralRoamUserMode(settings?.queues?.neuralRoam?.preferredMode);
}

export function setPreferredNeuralRoamUserMode<T extends Pick<PluginSettings, 'queues'>>(
  settings: T,
  mode: NeuralRoamUserMode,
): T {
  const fallback = DEFAULT_SETTINGS.queues.neuralRoam!;
  const neuralRoam = settings.queues.neuralRoam ?? fallback;
  settings.queues.neuralRoam = {
    ...fallback,
    ...neuralRoam,
    history: {
      ...fallback.history,
      ...(neuralRoam.history || {}),
    },
    hyperspace: {
      ...fallback.hyperspace,
      ...(neuralRoam.hyperspace || {}),
      treeChannels: {
        ...fallback.hyperspace.treeChannels,
        ...(neuralRoam.hyperspace?.treeChannels || {}),
      },
    },
    preferredMode: normalizeNeuralRoamUserMode(mode),
  };
  return settings;
}

export function resolvePrimaryNeuralRoamEntryMode(
  settings: Pick<PluginSettings, 'queues'> | null | undefined,
  explicitMode?: NeuralRoamUserMode | null,
): NeuralRoamUserMode {
  return explicitMode ? normalizeNeuralRoamUserMode(explicitMode) : getPreferredNeuralRoamUserMode(settings);
}

export function buildNeuralRoamModeOptions(t: TranslateFn): NeuralRoamModeOption[] {
  return [
    {
      mode: 'orbit',
      label: t('engineOrbit', 'Orbit'),
      description: t('engineOrbitIntro', 'Roam locally around orbit centers, concept cards, and nearby stations.'),
      runtimeQueueType: 'neural-roam',
    },
    {
      mode: 'hyperspace',
      label: t('engineHyperspace', 'Hyperspace Expedition'),
      description: t('engineHyperspaceIntro', 'Propagate outward layer by layer from activation sources through links and optional tree relations.'),
      runtimeQueueType: 'neural-roam',
    },
    {
      mode: 'semantic-activation',
      label: t('semanticActivation', 'Semantic Activation'),
      description: t('semanticActivationIntro', 'Use old knowledge, new tension, and the actual path you traverse as one semantic activation session.'),
      runtimeQueueType: 'semantic-activation',
    },
  ];
}
