import type {
  BackendNeuralRoamAdvanceRequest,
  BackendNeuralRoamAdvanceUnavailableReason,
  BackendNeuralRoamCommand,
  BackendNeuralRoamViewStateRequest,
} from '../../packages/contracts/src/backend-rpc';

export type WorkerNeuralRoamRouteRequestKind = 'advance' | 'view-state' | 'command';

export interface WorkerNeuralRoamRouteMismatch {
  reason: Extract<BackendNeuralRoamAdvanceUnavailableReason, 'route-mismatch'>;
  message: string;
}

export function normalizeWorkerNeuralRoamString(value: unknown): string {
  return String(value ?? '').trim();
}

export function resolveWorkerNeuralRoamAdvanceRequestedRouteId(
  request: BackendNeuralRoamAdvanceRequest,
): string {
  return normalizeWorkerNeuralRoamString(request.routeId ?? request.startFromFocus?.routeId);
}

export function resolveWorkerNeuralRoamViewStateRequestedRouteId(
  request: BackendNeuralRoamViewStateRequest,
): string {
  return normalizeWorkerNeuralRoamString(request.routeId);
}

export function resolveWorkerNeuralRoamRouteMismatch(input: {
  requestKind: WorkerNeuralRoamRouteRequestKind;
  requestedRouteId: unknown;
  activeRouteId: unknown;
}): WorkerNeuralRoamRouteMismatch | null {
  const requestedRouteId = normalizeWorkerNeuralRoamString(input.requestedRouteId);
  const activeRouteId = normalizeWorkerNeuralRoamString(input.activeRouteId);
  if (!requestedRouteId || !activeRouteId || requestedRouteId === activeRouteId) {
    return null;
  }
  return {
    reason: 'route-mismatch',
    message: neuralRoamRouteMismatchMessage(input.requestKind),
  };
}

export function resolveWorkerNeuralRoamCommandRouteMismatch(
  command: BackendNeuralRoamCommand,
  activeRouteId: unknown,
): WorkerNeuralRoamRouteMismatch | null {
  if (command.type === 'switch-route') {
    return null;
  }
  return resolveWorkerNeuralRoamRouteMismatch({
    requestKind: 'command',
    requestedRouteId: (command as { routeId?: unknown }).routeId,
    activeRouteId,
  });
}

export function isWorkerNeuralRoamAdvanceMismatchReason(
  reason: BackendNeuralRoamAdvanceUnavailableReason,
): boolean {
  return reason === 'generation-mismatch'
    || reason === 'policy-mismatch'
    || reason === 'route-mismatch';
}

function neuralRoamRouteMismatchMessage(kind: WorkerNeuralRoamRouteRequestKind): string {
  if (kind === 'view-state') {
    return 'NeuralRoam view-state request route is no longer active';
  }
  if (kind === 'command') {
    return 'NeuralRoam command route is no longer active';
  }
  return 'NeuralRoam advance request route is no longer active';
}
