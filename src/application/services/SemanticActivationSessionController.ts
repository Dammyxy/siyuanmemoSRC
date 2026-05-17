import type { SemanticActivationCommandClient } from '@/application/clients/SemanticActivationCommandClient';
import type {
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
  BackendSemanticLens,
  BackendSemanticStationType,
} from '../../../packages/contracts/src/backend-rpc';
import { relationDecisionAltersSemanticMemory } from '@/core/semantic/SemanticActivationPresentation';

interface SemanticActivationSessionControllerDeps {
  commandClient: Pick<SemanticActivationCommandClient, 'execute'>;
  activeSessionId?: string | null;
  idFactory?: () => string;
}

export class SemanticActivationSessionController {
  private readonly commandClient: Pick<SemanticActivationCommandClient, 'execute'>;
  private readonly idFactory: () => string;
  private activeSessionId: string | null;
  private sequence = 0;

  constructor(deps: SemanticActivationSessionControllerDeps) {
    this.commandClient = deps.commandClient;
    this.activeSessionId = this.normalizeString(deps.activeSessionId);
    this.idFactory = deps.idFactory ?? (() => `semantic-session:${Date.now()}:${++this.sequence}`);
  }

  async startSessionFromReviewConcept(rootFocusNodeId: string): Promise<BackendSemanticCommandResult> {
    const sessionId = this.idFactory();
    return this.execute('semantic.review-concept.start', {
      type: 'start-session',
      rootFocusNodeId,
      sessionId,
    });
  }

  async startSessionFromBrowserConcept(rootFocusNodeId: string): Promise<BackendSemanticCommandResult> {
    const sessionId = this.idFactory();
    return this.execute('semantic.browser-concept.start', {
      type: 'start-session',
      rootFocusNodeId,
      sessionId,
    });
  }

  async followCandidate(candidateId: string, lens: BackendSemanticLens): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.navigation.follow-candidate', (sessionId) => ({
      type: 'follow-candidate',
      sessionId,
      candidateId,
      lens,
    }));
  }

  async createBranchEdge(input: {
    fromNodeId: string;
    toNodeId: string;
    lens: BackendSemanticLens;
  }): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.branch.create-edge', (sessionId) => ({
      type: 'create-branch-edge',
      sessionId,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      lens: input.lens,
    }));
  }

  async moveActiveCursor(nodeId: string): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.navigation.move-active-cursor', (sessionId) => ({
      type: 'move-active-cursor',
      sessionId,
      nodeId,
    }));
  }

  async archiveBranch(branchId: string): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.branch.archive', (sessionId) => ({
      type: 'archive-branch',
      sessionId,
      branchId,
    }));
  }

  async restoreBranch(branchId: string): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.branch.restore', (sessionId) => ({
      type: 'restore-branch',
      sessionId,
      branchId,
    }));
  }

  async switchLens(lens: BackendSemanticLens): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.navigation.switch-lens', (sessionId) => ({
      type: 'switch-lens',
      sessionId,
      lens,
    }));
  }

  async createStation(stationType: BackendSemanticStationType): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.station.create', (sessionId) => ({
      type: 'create-station',
      sessionId,
      stationType,
    }));
  }

  async recordImplicitNodeAction(
    nodeId: string,
    action: 'follow' | 'expand' | 'node-station' | 'path-station' | 'skip' | 'mark-irrelevant',
    lens?: BackendSemanticLens,
  ): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.implicit-node.action', (sessionId) => ({
      type: 'record-implicit-node-action',
      sessionId,
      nodeId,
      action,
      lens,
    }));
  }

  async acceptRelation(input: {
    relationId: string;
    fromNodeId: string;
    toNodeId: string;
    confidence?: number;
    reason?: string | null;
  }): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.ai-relation.accept', (sessionId) => ({
      type: 'accept-relation',
      sessionId,
      relationId: input.relationId,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      confidence: input.confidence,
      reason: input.reason,
      source: 'ai',
    }));
  }

  async rejectRelation(input: {
    relationId: string;
    fromNodeId: string;
    toNodeId: string;
    confidence?: number;
    reason?: string | null;
  }): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.ai-relation.reject', (sessionId) => ({
      type: 'reject-relation',
      sessionId,
      relationId: input.relationId,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      confidence: input.confidence,
      reason: input.reason,
      source: 'ai',
    }));
  }

  async ignoreRelation(): Promise<BackendSemanticCommandResult> {
    if (!relationDecisionAltersSemanticMemory('ignored')) {
      return {
        status: 'ok',
        commandId: 'semantic-ai-relation-ignore',
        writerInstanceId: 'local-noop',
        changed: {},
        diagnosticEventId: 'semantic-ai-relation-ignore',
      };
    }
    throw new Error('ignored semantic relation unexpectedly mutates memory');
  }

  async markIrrelevant(nodeId: string): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.node.mark-irrelevant', (sessionId) => ({
      type: 'mark-irrelevant',
      sessionId,
      nodeId,
    }));
  }

  async archiveStation(stationId: string): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.station.archive', (sessionId) => ({
      type: 'archive-station',
      sessionId,
      stationId,
    }));
  }

  async restorePathStation(stationId: string): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.station.restore-path', (sessionId) => ({
      type: 'restore-path-station',
      sessionId,
      stationId,
    }));
  }

  async endSession(): Promise<BackendSemanticCommandResult> {
    return this.executeWithSession('semantic.session.end', (sessionId) => ({
      type: 'end-session',
      sessionId,
    }));
  }

  async restoreSession(sessionId: string): Promise<BackendSemanticCommandResult> {
    return this.execute('semantic.session.restore', {
      type: 'restore-session',
      sessionId,
    });
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  private async executeWithSession(
    callerIntent: string,
    buildCommand: (sessionId: string) => BackendSemanticCommandRequest['command'],
  ): Promise<BackendSemanticCommandResult> {
    if (!this.activeSessionId) {
      return {
        status: 'unavailable',
        unavailableReason: 'session-unavailable',
        message: 'SESSION_UNAVAILABLE: semantic session is not active',
        diagnosticEventId: `semantic-session-controller-unavailable:${callerIntent}`,
      };
    }
    return this.execute(callerIntent, buildCommand(this.activeSessionId));
  }

  private async execute(
    callerIntent: string,
    command: BackendSemanticCommandRequest['command'],
  ): Promise<BackendSemanticCommandResult> {
    const request = this.buildRequest(callerIntent, command);
    const result = await this.commandClient.execute(request);
    if (result.status === 'ok') {
      const sessionId = this.extractSessionId(result.session) ?? this.extractSessionIdFromCommand(command);
      if (sessionId) {
        this.activeSessionId = sessionId;
      }
    }
    return result;
  }

  private buildRequest(
    callerIntent: string,
    command: BackendSemanticCommandRequest['command'],
  ): BackendSemanticCommandRequest {
    const id = `${callerIntent}:${Date.now()}:${++this.sequence}`;
    return {
      requestId: id,
      method: 'semantic.command.execute',
      callerIntent,
      idempotencyKey: id,
      command,
    };
  }

  private extractSessionId(session: unknown): string | null {
    if (!session || typeof session !== 'object') {
      return null;
    }
    return this.normalizeString((session as { sessionId?: unknown }).sessionId);
  }

  private extractSessionIdFromCommand(command: BackendSemanticCommandRequest['command']): string | null {
    if ('sessionId' in command) {
      return this.normalizeString(command.sessionId);
    }
    return null;
  }

  private normalizeString(value: unknown): string | null {
    const normalized = String(value || '').trim();
    return normalized || null;
  }
}
