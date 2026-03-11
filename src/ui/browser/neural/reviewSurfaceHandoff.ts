export interface NeuralReviewSurfaceHandoffDeps {
  tabManager?: {
    syncExistingNeuralReviewTabToCurrentNode?: (options?: {
      fallbackNodeId?: string | null;
      focus?: boolean;
    }) => Promise<'synced' | 'missing' | 'failed'> | 'synced' | 'missing' | 'failed';
  } | null;
  dialogManager?: {
    openNeuralRoamDialog?: () => Promise<void> | void;
  } | null;
}

export async function handoffNeuralNavigationToReviewSurface(
  deps: NeuralReviewSurfaceHandoffDeps,
  options?: { fallbackNodeId?: string | null },
): Promise<'tab' | 'dialog' | 'failed' | 'none'> {
  const syncResult = await deps.tabManager?.syncExistingNeuralReviewTabToCurrentNode?.({
    fallbackNodeId: options?.fallbackNodeId ?? null,
    focus: true,
  });

  if (syncResult === 'synced') {
    return 'tab';
  }

  if (syncResult === 'failed') {
    return 'failed';
  }

  if (typeof deps.dialogManager?.openNeuralRoamDialog === 'function') {
    await deps.dialogManager.openNeuralRoamDialog();
    return 'dialog';
  }

  return 'none';
}
