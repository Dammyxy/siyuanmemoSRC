import { ref } from 'vue';
import type { SemanticActivationCommandClient } from '@/application/clients/SemanticActivationCommandClient';
import type { SemanticActivationBrowserReadClient } from '@/application/clients/SemanticActivationBrowserReadClient';
import { SemanticActivationSessionController } from '@/application/services/SemanticActivationSessionController';
import type { BrowserCard } from '../types';
import { BrowserSemanticBackendReadAdapter } from './BrowserSemanticBackendReadAdapter';
import { BrowserSemanticEntryController } from './BrowserSemanticEntryController';
import {
  BrowserSemanticStateController,
  type BrowserSemanticReviewHandoff,
  type BrowserSemanticWorkbenchState,
} from './BrowserSemanticStateController';
import { openBrowserSemanticHandoffInReview } from './BrowserSemanticReviewHandoff';
import { isBrowserSemanticConceptCard } from './browserSemanticFocus';
import type { BackendSemanticLens, BackendSemanticStationType } from '../../../../packages/contracts/src/backend-rpc';
import type { SemanticUnavailableReason } from '@/core/semantic/semanticActivationTypes';

export type BrowserSemanticWorkspaceRuntimeDeps = {
  getCommandClient: () => SemanticActivationCommandClient | Pick<SemanticActivationCommandClient, 'execute'> | null | undefined;
  getReadClient: () => SemanticActivationBrowserReadClient | Pick<SemanticActivationBrowserReadClient, 'read'> | null | undefined;
  loadRootCard: (nodeId: string) => Promise<BrowserCard | null> | BrowserCard | null;
  openSemanticReviewSession?: (options: {
    sessionId: string;
    currentNodeId: string;
    focusBlockId?: string;
  }) => Promise<void> | void;
  pushErrMsg: (message: string) => Promise<void> | void;
  t: (key: string, fallback: string) => string;
};

function emptyState(): BrowserSemanticWorkbenchState {
  return {
    status: 'idle',
    activeSessionId: null,
    model: null,
    unavailable: null,
    pendingCommand: null,
  };
}

function unavailableState(
  reason: SemanticUnavailableReason,
  message: string,
  current?: BrowserSemanticWorkbenchState,
): BrowserSemanticWorkbenchState {
  return {
    status: 'unavailable',
    activeSessionId: current?.activeSessionId ?? null,
    model: current?.model ?? null,
    unavailable: {
      status: 'unavailable',
      reason,
      message,
    },
    pendingCommand: null,
  };
}

export function createBrowserSemanticWorkspaceRuntime(deps: BrowserSemanticWorkspaceRuntimeDeps) {
  const state = ref<BrowserSemanticWorkbenchState>(emptyState());
  let controller: BrowserSemanticStateController | null = null;

  function setUnavailable(reason: SemanticUnavailableReason, message: string): BrowserSemanticWorkbenchState {
    state.value = unavailableState(reason, message, state.value);
    return state.value;
  }

  function ensureController(): BrowserSemanticStateController | null {
    if (controller) {
      return controller;
    }

    const commandClient = deps.getCommandClient();
    const readClient = deps.getReadClient();
    if (!commandClient || !readClient) {
      return null;
    }

    const readAdapter = new BrowserSemanticBackendReadAdapter({ readClient });
    const entryController = new BrowserSemanticEntryController({
      createSemanticController: (activeSessionId) => new SemanticActivationSessionController({
        commandClient,
        activeSessionId,
      }),
      findActiveSessionByRoot: (rootFocusNodeId) => readAdapter.findActiveSessionByRoot(rootFocusNodeId),
      loadReadModel: (sessionId) => readAdapter.loadReadModel(sessionId),
    });

    controller = new BrowserSemanticStateController({
      entryController,
      openReviewSession: openReviewHandoff,
    });
    return controller;
  }

  async function openReviewHandoff(handoff: BrowserSemanticReviewHandoff): Promise<boolean> {
    return openBrowserSemanticHandoffInReview(handoff, {
      openSemanticReviewSession: deps.openSemanticReviewSession,
      pushErrMsg: deps.pushErrMsg,
      t: deps.t,
    });
  }

  function activateEmptyWorkspace(): BrowserSemanticWorkbenchState {
    if (state.value.status !== 'idle') {
      return state.value;
    }
    return setUnavailable(
      'focus-unavailable',
      deps.t('browserSemanticNoSession', 'Select a Concept from the pool to start Semantic.'),
    );
  }

  async function startFromCard(targetCard: BrowserCard | null | undefined): Promise<BrowserSemanticWorkbenchState> {
    if (!targetCard) {
      return setUnavailable(
        'session-unavailable',
        deps.t('browserSemanticNoSelection', 'Select a Concept card before starting Semantic.'),
      );
    }

    if (!isBrowserSemanticConceptCard(targetCard)) {
      return setUnavailable(
        'focus-unavailable',
        deps.t('browserSemanticConceptRequired', 'Browser Semantic requires a Concept card selection.'),
      );
    }

    const nextController = ensureController();
    if (!nextController) {
      return setUnavailable(
        'session-unavailable',
        deps.t('browserSemanticRuntimeUnavailable', 'Semantic runtime is unavailable in Browser.'),
      );
    }

    state.value = await nextController.start(targetCard);
    return state.value;
  }

  async function startFromNeuralRoot(nodeId: string): Promise<BrowserSemanticWorkbenchState> {
    const targetCard = await deps.loadRootCard(nodeId);
    if (!targetCard) {
      return setUnavailable(
        'focus-unavailable',
        deps.t('browserSemanticRootUnavailable', 'Semantic root cannot be resolved from this concept pool item.'),
      );
    }
    return startFromCard(targetCard);
  }

  async function runAction(
    action: (controller: BrowserSemanticStateController) => Promise<BrowserSemanticWorkbenchState>,
  ): Promise<void> {
    const nextController = ensureController();
    if (!nextController) {
      setUnavailable(
        'session-unavailable',
        deps.t('browserSemanticRuntimeUnavailable', 'Semantic runtime is unavailable in Browser.'),
      );
      return;
    }
    state.value = await action(nextController);
  }

  async function follow(candidateId: string, lens: BackendSemanticLens): Promise<void> {
    await runAction((nextController) => nextController.followCandidate(candidateId, lens));
  }

  async function createStation(stationType: BackendSemanticStationType): Promise<void> {
    await runAction((nextController) => nextController.createStation(stationType));
  }

  async function archiveStation(stationId: string): Promise<void> {
    await runAction((nextController) => nextController.archiveStation(stationId));
  }

  async function openNodeStation(nodeId: string): Promise<void> {
    await runAction((nextController) => nextController.openNodeStation(nodeId));
  }

  async function restorePathStation(stationId: string): Promise<void> {
    await runAction((nextController) => nextController.restorePathStation(stationId));
  }

  async function endSession(): Promise<void> {
    await runAction((nextController) => nextController.endSession());
  }

  async function openInReview(): Promise<void> {
    await runAction((nextController) => nextController.openInReview());
  }

  return {
    state,
    activateEmptyWorkspace,
    archiveStation,
    createStation,
    endSession,
    follow,
    openInReview,
    openNodeStation,
    restorePathStation,
    startFromCard,
    startFromNeuralRoot,
  };
}
