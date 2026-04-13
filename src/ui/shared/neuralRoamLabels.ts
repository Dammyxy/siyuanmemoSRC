import type { NeuralEngineMode } from '@/types/unified-data-source';

type TranslateFn = (key: string, fallback: string) => string;

export interface NeuralSourceLabelSet {
  sectionTitle: string;
  viewList: string;
  startPath: string;
  addItem: string;
  removeItem: string;
  emptyState: string;
  primaryAction: string;
  currentAction: string;
  modeHint: string;
}

export function getNeuralEngineLabel(
  engineMode: NeuralEngineMode,
  t: TranslateFn,
  variant: 'short' | 'full' = 'short',
): string {
  if (engineMode === 'hyperspace') {
    return variant === 'full'
      ? t('engineHyperspaceFull', 'Hyperspace Expedition Mode')
      : t('engineHyperspace', 'Hyperspace Expedition');
  }

  return variant === 'full'
    ? t('engineOrbitFull', 'Orbit Mode')
    : t('engineOrbit', 'Orbit');
}

export function getNeuralSourceLabelSet(
  engineMode: NeuralEngineMode,
  t: TranslateFn,
): NeuralSourceLabelSet {
  if (engineMode === 'hyperspace') {
    return {
      sectionTitle: t('activationSources', 'Activation Sources'),
      viewList: t('viewActivationSources', 'View Activation Sources'),
      startPath: t('startPathFromActivationSource', 'Start a New Path from Activation Source'),
      addItem: t('addActivationSource', 'Add Activation Source'),
      removeItem: t('removeActivationSource', 'Remove Activation Source'),
      emptyState: t('noActivationSources', 'No activation sources'),
      primaryAction: t('setPrimaryActivationSource', 'Set as Primary Activation Source'),
      currentAction: t('currentPrimaryActivationSource', 'Current Primary Activation Source'),
      modeHint: t('sourceModeHintHyperspace', 'Activation sources work as propagation roots in this mode.'),
    };
  }

  return {
    sectionTitle: t('orbitCenters', 'Orbit Centers'),
    viewList: t('viewOrbitCenters', 'View Orbit Centers'),
    startPath: t('startPathFromOrbitCenter', 'Start a New Path from Orbit Center'),
    addItem: t('addOrbitCenter', 'Add Orbit Center'),
    removeItem: t('removeOrbitCenter', 'Remove Orbit Center'),
    emptyState: t('noOrbitCenters', 'No orbit centers'),
    primaryAction: t('setCurrentFocus', 'Set as Current Orbit Center'),
    currentAction: t('currentOrbitCenter', 'Current Orbit Center'),
    modeHint: t('sourceModeHintOrbit', 'Orbit centers work as the current observation center in this mode.'),
  };
}
