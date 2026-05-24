import type { BackendNeuralRoamCommand } from '../../packages/contracts/src/backend-rpc';

export interface WorkerNeuralRoamCommandQueue {
  setEngineMode?: (mode: 'orbit' | 'hyperspace', options: { carryCurrentNode: boolean }) => Promise<void>;
  startRoamingFromFocus?: (focusId: string, options: {
    includeFocusAsFirst?: boolean;
    resetHistory?: boolean;
    startNewSession?: boolean;
  }) => Promise<void>;
  switchRoute?: (routeId: string) => Promise<unknown>;
  createRoute?: (input: { name?: string }) => Promise<unknown>;
  renameRoute?: (routeId: string, name: string) => Promise<unknown>;
  deleteRoute?: (routeId: string) => Promise<unknown>;
  jumpToHistoryNode?: (nodeId: string) => Promise<void>;
  setNavigationMode?: (mode: 'explore' | 'follow') => void;
  returnToBookmark?: () => void;
  createTemporaryRoute?: (input: {
    name?: string;
    seedBlockId: string;
    previousRouteId: string | null;
  }) => Promise<unknown>;
  replaceActiveTemporaryRoute?: (input: {
    name?: string;
    seedBlockId: string;
  }) => Promise<unknown>;
  saveTemporaryRoute?: (routeId?: string | null, name?: string | null) => Promise<unknown>;
  closeTemporaryRoute?: (input: {
    action: 'save' | 'discard' | 'cancel';
    routeId: string | null;
    name: string | null;
  }) => Promise<unknown>;
  setSourceEntries?: (nodeIds: string[], enabled: boolean) => Promise<void>;
  setSourceEntry?: (nodeId: string, enabled: boolean) => Promise<void>;
  setAnchorEntry?: (nodeId: string, enabled: boolean) => Promise<void>;
  setCurrentFocus?: (nodeId: string, options: {
    includeFocusAsFirst?: boolean;
    resetHistory?: boolean;
    bookmarkCurrentPath?: boolean;
  }) => Promise<void>;
  clearHistory?: (scope: 'current' | 'all') => Promise<void>;
  clearRouteHistory?: () => Promise<void>;
}

export async function applyWorkerNeuralRoamCommand(
  queue: WorkerNeuralRoamCommandQueue,
  command: BackendNeuralRoamCommand,
): Promise<void> {
  switch (command.type) {
    case 'switch-engine-mode':
      await requireCommandMethod(queue.setEngineMode, 'setEngineMode').call(
        queue,
        command.mode,
        { carryCurrentNode: command.carryCurrentNode !== false },
      );
      return;
    case 'start-roaming-from-focus':
      await requireCommandMethod(queue.startRoamingFromFocus, 'startRoamingFromFocus').call(
        queue,
        command.focusId,
        {
          includeFocusAsFirst: command.includeFocusAsFirst,
          resetHistory: command.resetHistory,
          startNewSession: command.startNewSession,
        },
      );
      return;
    case 'switch-route':
      await requireCommandMethod(queue.switchRoute, 'switchRoute').call(queue, command.routeId);
      return;
    case 'create-route':
      await requireCommandMethod(queue.createRoute, 'createRoute').call(queue, { name: command.name ?? undefined });
      return;
    case 'rename-route':
      await requireCommandMethod(queue.renameRoute, 'renameRoute').call(queue, command.routeId, command.name);
      return;
    case 'delete-route':
      await requireCommandMethod(queue.deleteRoute, 'deleteRoute').call(queue, command.routeId);
      return;
    case 'jump-history-node':
      await requireCommandMethod(queue.jumpToHistoryNode, 'jumpToHistoryNode').call(queue, command.nodeId);
      return;
    case 'set-navigation-mode':
      requireCommandMethod(queue.setNavigationMode, 'setNavigationMode').call(queue, command.mode);
      return;
    case 'return-to-bookmark':
      requireCommandMethod(queue.returnToBookmark, 'returnToBookmark').call(queue);
      return;
    case 'create-temporary-route':
      await requireCommandMethod(queue.createTemporaryRoute, 'createTemporaryRoute').call(queue, {
        name: command.name ?? undefined,
        seedBlockId: command.seedBlockId,
        previousRouteId: command.previousRouteId ?? null,
      });
      return;
    case 'replace-active-temporary-route':
      await requireCommandMethod(queue.replaceActiveTemporaryRoute, 'replaceActiveTemporaryRoute').call(queue, {
        name: command.name ?? undefined,
        seedBlockId: command.seedBlockId,
      });
      return;
    case 'save-temporary-route':
      await requireCommandMethod(queue.saveTemporaryRoute, 'saveTemporaryRoute').call(queue, command.routeId, command.name);
      return;
    case 'close-temporary-route':
      await requireCommandMethod(queue.closeTemporaryRoute, 'closeTemporaryRoute').call(queue, {
        action: command.action,
        routeId: command.routeId ?? null,
        name: command.name ?? null,
      });
      return;
    case 'set-sources': {
      const uniqueNodeIds = normalizeUniqueNodeIds(command.nodeIds);
      if (uniqueNodeIds.length === 0) {
        return;
      }
      if (typeof queue.setSourceEntries === 'function') {
        await queue.setSourceEntries(uniqueNodeIds, command.enabled !== false);
        return;
      }
      const setSourceEntry = requireCommandMethod(queue.setSourceEntry, 'setSourceEntry');
      for (const nodeId of uniqueNodeIds) {
        await setSourceEntry.call(queue, nodeId, command.enabled !== false);
      }
      return;
    }
    case 'set-source':
      await requireCommandMethod(queue.setSourceEntry, 'setSourceEntry').call(queue, command.nodeId, command.enabled !== false);
      return;
    case 'set-anchor':
      await requireCommandMethod(queue.setAnchorEntry, 'setAnchorEntry').call(queue, command.nodeId, command.enabled !== false);
      return;
    case 'set-current-focus':
      await requireCommandMethod(queue.setCurrentFocus, 'setCurrentFocus').call(
        queue,
        command.nodeId,
        {
          includeFocusAsFirst: command.includeFocusAsFirst,
          resetHistory: command.resetHistory,
          bookmarkCurrentPath: command.bookmarkCurrentPath,
        },
      );
      return;
    case 'clear-history':
      await requireCommandMethod(queue.clearHistory, 'clearHistory').call(queue, command.scope ?? 'all');
      return;
    case 'clear-route-history':
      await requireCommandMethod(queue.clearRouteHistory, 'clearRouteHistory').call(queue);
      return;
    default:
      throw new Error(`INVALID_REQUEST: unsupported neural-roam command: ${(command as { type?: unknown }).type}`);
  }
}

function requireCommandMethod<TMethod extends (...args: never[]) => unknown>(
  method: TMethod | undefined,
  name: string,
): TMethod {
  if (typeof method !== 'function') {
    throw new Error(`NeuralRoam command queue method is unavailable: ${name}`);
  }
  return method;
}

function normalizeUniqueNodeIds(nodeIds: readonly unknown[]): string[] {
  return Array.from(new Set(
    nodeIds
      .map((nodeId) => String(nodeId || '').trim())
      .filter((nodeId) => nodeId.length > 0),
  ));
}
