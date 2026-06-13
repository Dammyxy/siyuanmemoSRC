import type { NeuralRoamSessionQueue } from '@/types/unified-data-source/neural-roam-session';

export type NeuralRoamTemporaryRouteCloseChoice = 'save' | 'discard' | 'cancel';

export type NeuralRoamTemporaryRouteClosePrompt = (input: {
  routeId: string;
  previousRouteId: string | null;
}) => Promise<NeuralRoamTemporaryRouteCloseChoice>;

export type NeuralRoamTemporaryRouteCloseLifecycleResult =
  | { status: 'none' }
  | { status: 'closed'; action: 'save' | 'discard'; routeId: string }
  | { status: 'cancelled'; routeId: string };

export async function closeTemporaryRouteWithPrompt(
  neuralQueue: Pick<
    NeuralRoamSessionQueue,
    'resolveTemporaryRouteCloseAction' | 'closeTemporaryRoute'
  > | null | undefined,
  promptChoice: NeuralRoamTemporaryRouteClosePrompt,
): Promise<NeuralRoamTemporaryRouteCloseLifecycleResult> {
  const closeAction = await neuralQueue?.resolveTemporaryRouteCloseAction?.();
  if (!closeAction || closeAction.kind === 'none') {
    return { status: 'none' };
  }
  if (!neuralQueue?.closeTemporaryRoute) {
    throw new Error('NEURAL_ROAM_ROUTE_UNAVAILABLE: temporary route close command is unavailable');
  }
  if (closeAction.kind === 'discard-clean') {
    await neuralQueue.closeTemporaryRoute({
      action: 'discard',
      routeId: closeAction.routeId,
    });
    return {
      status: 'closed',
      action: 'discard',
      routeId: closeAction.routeId,
    };
  }

  const choice = await promptChoice({
    routeId: closeAction.routeId,
    previousRouteId: closeAction.previousRouteId,
  });
  if (choice === 'cancel') {
    return {
      status: 'cancelled',
      routeId: closeAction.routeId,
    };
  }
  await neuralQueue.closeTemporaryRoute({
    action: choice,
    routeId: closeAction.routeId,
  });
  return {
    status: 'closed',
    action: choice,
    routeId: closeAction.routeId,
  };
}
