import type { SemanticActivationBrowserReadClient } from '@/application/clients/SemanticActivationBrowserReadClient';
import type { SemanticSessionSnapshot } from '@/core/semantic/semanticActivationTypes';
import { buildBrowserSemanticReadModel } from './browserSemanticReadModel';
import type { BrowserSemanticReadModelResult } from './types';

interface BrowserSemanticBackendReadAdapterDeps {
  readClient: Pick<SemanticActivationBrowserReadClient, 'read'>;
  idFactory?: () => string;
}

export class BrowserSemanticBackendReadAdapter {
  private sequence = 0;

  constructor(private readonly deps: BrowserSemanticBackendReadAdapterDeps) {}

  async findActiveSessionByRoot(rootFocusNodeId: string): Promise<SemanticSessionSnapshot | null> {
    const result = await this.deps.readClient.read({
      requestId: this.nextRequestId('active-root'),
      method: 'semantic.browser.read',
      callerIntent: 'semantic.browser.active-session.read',
      rootFocusNodeId,
    });
    if (result.status !== 'ok') {
      return null;
    }
    return result.activeSession as SemanticSessionSnapshot | null;
  }

  async loadReadModel(sessionId: string): Promise<BrowserSemanticReadModelResult> {
    const result = await this.deps.readClient.read({
      requestId: this.nextRequestId('read-model'),
      method: 'semantic.browser.read',
      callerIntent: 'semantic.browser.read-model.load',
      sessionId,
    });
    if (result.status !== 'ok') {
      return {
        status: 'unavailable',
        reason: result.unavailableReason,
        message: result.message,
      };
    }
    if (!result.session || !result.rootNode || !result.currentNode) {
      return {
        status: 'unavailable',
        reason: 'session-unavailable',
        message: 'Semantic Browser read model has no active session',
      };
    }
    return buildBrowserSemanticReadModel({
      session: result.session,
      rootNode: result.rootNode,
      currentNode: result.currentNode,
      candidates: result.candidates,
      stations: result.stations,
      stationNodes: result.stationNodes,
      nodes: result.nodes,
      tree: result.projection?.tree,
      edgeExplanations: result.edgeExplanations,
      later: result.later,
      suggestions: result.suggestions,
      archivedBranches: result.archivedBranches,
    });
  }

  private nextRequestId(scope: string): string {
    return this.deps.idFactory?.() ?? `semantic-browser:${scope}:${Date.now()}:${++this.sequence}`;
  }
}
