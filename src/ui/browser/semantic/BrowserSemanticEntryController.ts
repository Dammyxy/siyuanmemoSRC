import type { BackendSemanticCommandResult, BackendSemanticLens, BackendSemanticStationType } from '../../../../packages/contracts/src/backend-rpc';
import type { SemanticActivationSessionController } from '@/application/services/SemanticActivationSessionController';
import type { BrowserCard } from '../types';
import { resolveBrowserSemanticFocus } from './browserSemanticFocus';
import type {
  BrowserSemanticCommandUiResult,
  BrowserSemanticReadModelResult,
  BrowserSemanticStartResult,
} from './types';
import type { SemanticSessionSnapshot } from '@/core/semantic/semanticActivationTypes';
import type { SemanticUnavailableReason } from '@/core/semantic/semanticActivationTypes';

type BrowserSemanticControllerFactory = (activeSessionId?: string | null) => Pick<
  SemanticActivationSessionController,
  | 'startSessionFromBrowserConcept'
  | 'restoreSession'
  | 'followCandidate'
  | 'createStation'
  | 'archiveStation'
  | 'restorePathStation'
  | 'endSession'
>;

export interface BrowserSemanticEntryControllerDeps {
  createSemanticController: BrowserSemanticControllerFactory;
  findActiveSessionByRoot: (rootFocusNodeId: string) => Promise<SemanticSessionSnapshot | null> | SemanticSessionSnapshot | null;
  loadReadModel: (sessionId: string) => Promise<BrowserSemanticReadModelResult> | BrowserSemanticReadModelResult;
}

function unavailable(reason: SemanticUnavailableReason, message: string): BrowserSemanticStartResult {
  return { status: 'unavailable', reason, message };
}

function commandUnavailable(result: BackendSemanticCommandResult): BrowserSemanticCommandUiResult {
  if (result.status === 'ok') {
    throw new Error('commandUnavailable called with ok result');
  }
  return {
    status: 'unavailable',
    reason: result.unavailableReason,
    message: result.message,
  };
}

function sessionIdFromResult(result: BackendSemanticCommandResult): string | null {
  if (result.status !== 'ok' || !result.session || typeof result.session !== 'object') {
    return null;
  }
  return String((result.session as { sessionId?: unknown }).sessionId || '').trim() || null;
}

export class BrowserSemanticEntryController {
  constructor(private readonly deps: BrowserSemanticEntryControllerDeps) {}

  async startFromBrowserCard(card: BrowserCard | null | undefined): Promise<BrowserSemanticStartResult> {
    const focus = resolveBrowserSemanticFocus(card);
    if (!focus) {
      return unavailable('focus-unavailable', 'Browser Semantic requires a Concept selection');
    }

    const activeSession = await this.deps.findActiveSessionByRoot(focus.rootFocusNodeId);
    if (activeSession && typeof activeSession.endedAt !== 'number') {
      const controller = this.deps.createSemanticController(activeSession.sessionId);
      const restored = await controller.restoreSession(activeSession.sessionId);
      if (restored.status !== 'ok') {
        return commandUnavailable(restored);
      }
      const model = await this.deps.loadReadModel(activeSession.sessionId);
      if (model.status !== 'ready') {
        return model;
      }
      return { status: 'ready', focus, restored: true, commandResult: restored, model };
    }

    const controller = this.deps.createSemanticController(null);
    const started = await controller.startSessionFromBrowserConcept(focus.rootFocusNodeId);
    if (started.status !== 'ok') {
      return commandUnavailable(started);
    }
    const sessionId = sessionIdFromResult(started);
    if (!sessionId) {
      return unavailable('session-unavailable', 'Semantic start succeeded without a session id');
    }
    const model = await this.deps.loadReadModel(sessionId);
    if (model.status !== 'ready') {
      return model;
    }
    return { status: 'ready', focus, restored: false, commandResult: started, model };
  }

  async followCandidate(
    sessionId: string,
    candidateId: string,
    lens: BackendSemanticLens,
  ): Promise<BrowserSemanticCommandUiResult> {
    const result = await this.deps.createSemanticController(sessionId).followCandidate(candidateId, lens);
    return this.withUpdatedModel(result);
  }

  async createStation(sessionId: string, stationType: BackendSemanticStationType): Promise<BrowserSemanticCommandUiResult> {
    const result = await this.deps.createSemanticController(sessionId).createStation(stationType);
    return this.withUpdatedModel(result);
  }

  async archiveStation(sessionId: string, stationId: string): Promise<BrowserSemanticCommandUiResult> {
    const result = await this.deps.createSemanticController(sessionId).archiveStation(stationId);
    return this.withUpdatedModel(result);
  }

  async restorePathStation(sessionId: string, stationId: string): Promise<BrowserSemanticCommandUiResult> {
    const result = await this.deps.createSemanticController(sessionId).restorePathStation(stationId);
    return this.withUpdatedModel(result);
  }

  async endSession(sessionId: string): Promise<BrowserSemanticCommandUiResult> {
    const result = await this.deps.createSemanticController(sessionId).endSession();
    if (result.status !== 'ok') {
      return commandUnavailable(result);
    }
    return { status: 'ok', commandResult: result, model: null };
  }

  private async withUpdatedModel(result: BackendSemanticCommandResult): Promise<BrowserSemanticCommandUiResult> {
    if (result.status !== 'ok') {
      return commandUnavailable(result);
    }
    const sessionId = sessionIdFromResult(result);
    if (!sessionId) {
      return { status: 'ok', commandResult: result, model: null };
    }
    const model = await this.deps.loadReadModel(sessionId);
    if (model.status !== 'ready') {
      return model;
    }
    return { status: 'ok', commandResult: result, model };
  }
}
