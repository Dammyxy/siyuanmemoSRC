import { describe, expect, it } from 'vitest';
import {
  buildNeuralRoamModeOptions,
  getPreferredNeuralRoamUserMode,
  resolvePrimaryNeuralRoamEntryMode,
  setPreferredNeuralRoamUserMode,
} from '../semanticActivationModePreference';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/types/settings';

const t = (_key: string, fallback: string) => fallback;

function settings(): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    queues: {
      ...DEFAULT_SETTINGS.queues,
      neuralRoam: {
        ...DEFAULT_SETTINGS.queues.neuralRoam!,
        history: { ...DEFAULT_SETTINGS.queues.neuralRoam!.history },
        hyperspace: {
          ...DEFAULT_SETTINGS.queues.neuralRoam!.hyperspace,
          treeChannels: { ...DEFAULT_SETTINGS.queues.neuralRoam!.hyperspace.treeChannels },
        },
      },
    },
  };
}

describe('semanticActivationModePreference', () => {
  it('exposes Semantic Activation as a third user-facing Neural Roam mode with separate runtime identity', () => {
    const options = buildNeuralRoamModeOptions(t);

    expect(options.map((option) => option.mode)).toEqual(['orbit', 'hyperspace', 'semantic-activation']);
    expect(options[2]).toMatchObject({
      label: 'Semantic Activation',
      runtimeQueueType: 'semantic-activation',
    });
  });

  it('persists and resolves preferred Neural Roam mode without mutating Orbit or Hyperspace state', () => {
    const next = setPreferredNeuralRoamUserMode(settings(), 'semantic-activation');

    expect(getPreferredNeuralRoamUserMode(next)).toBe('semantic-activation');
    expect(resolvePrimaryNeuralRoamEntryMode(next)).toBe('semantic-activation');
    expect(resolvePrimaryNeuralRoamEntryMode(next, 'hyperspace')).toBe('hyperspace');
  });
});
