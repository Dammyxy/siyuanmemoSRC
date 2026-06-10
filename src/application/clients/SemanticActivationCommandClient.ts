import type {
  BackendSemanticCommandRequest,
  BackendSemanticCommandResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { BackendSemanticClientFacet } from '@/application/clients/backend';
import type { FollowerCommandClient } from '@/application/clients/FollowerCommandClient';
import type { FrontendInstanceRuntime } from '@/application/clients/FrontendInstanceRuntime';

export type SemanticActivationCommandBackendClient = Pick<BackendSemanticClientFacet, 'semanticCommand'>;

interface SemanticActivationCommandClientDeps {
  backendClient: SemanticActivationCommandBackendClient;
  frontendRuntime?: Pick<FrontendInstanceRuntime, 'getMode' | 'getInstanceId' | 'ensureWritable'> | null;
  followerCommandClient?: Pick<FollowerCommandClient, 'submitAndWait'> | null;
  writerRelayRequiredForMutations?: boolean;
}

export class SemanticActivationCommandClient {
  private readonly backendClient: SemanticActivationCommandBackendClient;
  private readonly frontendRuntime: Pick<FrontendInstanceRuntime, 'getMode' | 'getInstanceId' | 'ensureWritable'> | null;
  private readonly followerCommandClient: Pick<FollowerCommandClient, 'submitAndWait'> | null;
  private readonly writerRelayRequiredForMutations: boolean;

  constructor(deps: SemanticActivationCommandClientDeps) {
    this.backendClient = deps.backendClient;
    this.frontendRuntime = deps.frontendRuntime ?? null;
    this.followerCommandClient = deps.followerCommandClient ?? null;
    this.writerRelayRequiredForMutations = deps.writerRelayRequiredForMutations !== false;
  }

  async execute(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> {
    if (this.writerRelayRequiredForMutations && !this.frontendRuntime) {
      return this.unavailable(request, 'semantic command requires writer relay runtime');
    }
    if (this.isFollowerMode()) {
      return this.relayMutation(request);
    }
    if (this.writerRelayRequiredForMutations) {
      try {
        await this.frontendRuntime?.ensureWritable();
      } catch (error) {
        if (this.isFollowerMode()) {
          return this.relayMutation(request);
        }
        return this.unavailable(request, error instanceof Error ? error.message : String(error || 'writer unavailable'));
      }
      if (this.isFollowerMode()) {
        return this.relayMutation(request);
      }
    }
    return this.backendClient.semanticCommand(request);
  }

  private async relayMutation(request: BackendSemanticCommandRequest): Promise<BackendSemanticCommandResult> {
    if (!this.followerCommandClient || !this.frontendRuntime) {
      return this.unavailable(request, 'semantic command relay is unavailable in follower mode');
    }
    try {
      const relayResult = await this.followerCommandClient.submitAndWait<unknown>({
        instanceId: this.frontendRuntime.getInstanceId(),
        commandId: request.requestId,
        method: request.method,
        params: request,
        idempotencyKey: request.idempotencyKey,
      }, 15_000);
      return relayResult as BackendSemanticCommandResult;
    } catch (error) {
      return this.unavailable(request, error instanceof Error ? error.message : String(error || 'writer relay unavailable'));
    }
  }

  private unavailable(request: BackendSemanticCommandRequest, message: string): BackendSemanticCommandResult {
    return {
      status: 'unavailable',
      unavailableReason: 'writer-unavailable',
      message: `WRITER_UNAVAILABLE: ${message}`,
      diagnosticEventId: `semantic-command-unavailable:${request.requestId || Date.now()}`,
    };
  }

  private isFollowerMode(): boolean {
    return this.frontendRuntime?.getMode() === 'follower';
  }
}
