import type { BrowserCard } from '../types';
import type { BrowserSemanticEntryController } from './BrowserSemanticEntryController';
import type {
  BrowserSemanticCommandUiResult,
  BrowserSemanticReadModel,
  BrowserSemanticStartResult,
  BrowserSemanticUnavailable,
} from './types';
import type { BackendSemanticLens, BackendSemanticStationType } from '../../../../packages/contracts/src/backend-rpc';
import type { SemanticUnavailableReason } from '@/core/semantic/semanticActivationTypes';

export type BrowserSemanticWorkbenchStatus = 'idle' | 'pending' | 'ready' | 'unavailable';

export interface BrowserSemanticWorkbenchState {
  status: BrowserSemanticWorkbenchStatus;
  activeSessionId: string | null;
  model: BrowserSemanticReadModel | null;
  unavailable: BrowserSemanticUnavailable | null;
  pendingCommand: string | null;
}

export interface BrowserSemanticReviewHandoff {
  sessionId: string;
  currentNodeId: string;
  blockId: string;
  cardId: string | null;
  isReviewCard: boolean;
}

export interface BrowserSemanticStateControllerDeps {
  entryController: Pick<
    BrowserSemanticEntryController,
    | 'startFromBrowserCard'
    | 'followCandidate'
    | 'createStation'
    | 'archiveStation'
    | 'restorePathStation'
    | 'endSession'
  >;
  openReviewSession?: (handoff: BrowserSemanticReviewHandoff) => Promise<void> | void;
}

function emptyState(): BrowserSemanticWorkbenchState {
  return {
    status: 'idle',
    activeSessionId: null,
    model: null,
    unavailable: null,
    pendingCommand: null,
  };
}

function unavailableState(reason: SemanticUnavailableReason, message: string): BrowserSemanticWorkbenchState {
  return {
    ...emptyState(),
    status: 'unavailable',
    unavailable: { status: 'unavailable', reason, message },
  };
}

function isUnavailable(
  result: BrowserSemanticStartResult | BrowserSemanticCommandUiResult,
): result is BrowserSemanticUnavailable {
  return result.status === 'unavailable';
}

export class BrowserSemanticStateController {
  private readonly deps: BrowserSemanticStateControllerDeps;
  private stateValue: BrowserSemanticWorkbenchState = emptyState();

  constructor(deps: BrowserSemanticStateControllerDeps) {
    this.deps = deps;
  }

  get state(): BrowserSemanticWorkbenchState {
    return this.stateValue;
  }

  async start(card: BrowserCard | null | undefined): Promise<BrowserSemanticWorkbenchState> {
    this.setPending('start');
    const result = await this.deps.entryController.startFromBrowserCard(card);
    if (isUnavailable(result)) {
      return this.setUnavailable(result);
    }
    return this.setReady(result.model);
  }

  async followCandidate(candidateId: string, lens: BackendSemanticLens): Promise<BrowserSemanticWorkbenchState> {
    const sessionId = this.requireActiveSessionId();
    if (!sessionId) {
      return this.stateValue;
    }
    this.setPending('follow-candidate');
    return this.applyCommandResult(await this.deps.entryController.followCandidate(sessionId, candidateId, lens));
  }

  async createStation(stationType: BackendSemanticStationType): Promise<BrowserSemanticWorkbenchState> {
    const sessionId = this.requireActiveSessionId();
    if (!sessionId) {
      return this.stateValue;
    }
    this.setPending(`create-${stationType}-station`);
    return this.applyCommandResult(await this.deps.entryController.createStation(sessionId, stationType));
  }

  async archiveStation(stationId: string): Promise<BrowserSemanticWorkbenchState> {
    const sessionId = this.requireActiveSessionId();
    if (!sessionId) {
      return this.stateValue;
    }
    this.setPending('archive-station');
    return this.applyCommandResult(await this.deps.entryController.archiveStation(sessionId, stationId));
  }

  async restorePathStation(stationId: string): Promise<BrowserSemanticWorkbenchState> {
    const sessionId = this.requireActiveSessionId();
    if (!sessionId) {
      return this.stateValue;
    }
    this.setPending('restore-path-station');
    return this.applyCommandResult(await this.deps.entryController.restorePathStation(sessionId, stationId));
  }

  async openNodeStation(nodeId: string): Promise<BrowserSemanticWorkbenchState> {
    const sessionId = this.requireActiveSessionId();
    if (!sessionId) {
      return this.stateValue;
    }
    const lens = this.stateValue.model?.session.activeLens ?? 'free';
    this.setPending('open-node-station');
    return this.applyCommandResult(await this.deps.entryController.followCandidate(sessionId, nodeId, lens));
  }

  async endSession(): Promise<BrowserSemanticWorkbenchState> {
    const sessionId = this.requireActiveSessionId();
    if (!sessionId) {
      return this.stateValue;
    }
    this.setPending('end-session');
    const result = await this.deps.entryController.endSession(sessionId);
    if (isUnavailable(result)) {
      return this.setUnavailable(result);
    }
    this.stateValue = emptyState();
    return this.stateValue;
  }

  async openInReview(): Promise<BrowserSemanticWorkbenchState> {
    if (!this.stateValue.activeSessionId || !this.stateValue.model) {
      this.stateValue = unavailableState('session-unavailable', 'Semantic session is not ready for Review handoff');
      return this.stateValue;
    }
    await this.deps.openReviewSession?.({
      sessionId: this.stateValue.activeSessionId,
      currentNodeId: this.stateValue.model.session.currentNodeId,
      blockId: this.stateValue.model.currentNode.blockId,
      cardId: this.stateValue.model.currentNode.cardId,
      isReviewCard: this.stateValue.model.currentNode.isReviewCard,
    });
    return this.stateValue;
  }

  private setPending(command: string): void {
    this.stateValue = {
      ...this.stateValue,
      status: 'pending',
      pendingCommand: command,
      unavailable: null,
    };
  }

  private setReady(model: BrowserSemanticReadModel): BrowserSemanticWorkbenchState {
    this.stateValue = {
      status: 'ready',
      activeSessionId: model.session.sessionId,
      model,
      unavailable: null,
      pendingCommand: null,
    };
    return this.stateValue;
  }

  private setUnavailable(result: BrowserSemanticUnavailable): BrowserSemanticWorkbenchState {
    this.stateValue = {
      ...this.stateValue,
      status: 'unavailable',
      unavailable: result,
      pendingCommand: null,
    };
    return this.stateValue;
  }

  private async applyCommandResult(result: BrowserSemanticCommandUiResult): Promise<BrowserSemanticWorkbenchState> {
    if (isUnavailable(result)) {
      return this.setUnavailable(result);
    }
    if (result.model) {
      return this.setReady(result.model);
    }
    this.stateValue = {
      ...this.stateValue,
      status: 'ready',
      pendingCommand: null,
      unavailable: null,
    };
    return this.stateValue;
  }

  private requireActiveSessionId(): string | null {
    if (!this.stateValue.activeSessionId) {
      this.stateValue = unavailableState('session-unavailable', 'Semantic session is not active');
      return null;
    }
    return this.stateValue.activeSessionId;
  }
}
