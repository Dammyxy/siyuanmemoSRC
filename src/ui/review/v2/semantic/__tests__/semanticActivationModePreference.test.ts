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
  it('hides Semantic Activation from the user-facing Neural Roam picker', () => {
    const options = buildNeuralRoamModeOptions(t);

    expect(options.map((option) => option.mode)).toEqual(['orbit', 'hyperspace']);
    expect(options.some((option) => option.runtimeQueueType === 'semantic-activation')).toBe(false);
  });

  it('coerces stale Semantic Activation preference back to Orbit', () => {
    const next = setPreferredNeuralRoamUserMode(settings(), 'semantic-activation');

    expect(getPreferredNeuralRoamUserMode(next)).toBe('orbit');
    expect(resolvePrimaryNeuralRoamEntryMode(next)).toBe('orbit');
    expect(resolvePrimaryNeuralRoamEntryMode(next, 'hyperspace')).toBe('hyperspace');
  });
});
