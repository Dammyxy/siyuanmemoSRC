import type {
  PrivateApiMutationRequest,
  PrivateApiMutationResult,
  PrivateApiReadRequest,
  PrivateApiReadResult,
} from '../../../packages/contracts/src/backend-rpc';
import type { FollowerCommandClient } from '@/application/clients/FollowerCommandClient';
import type { FrontendInstanceRuntime } from '@/application/clients/FrontendInstanceRuntime';
import type { SrsBackendClient } from '@/application/clients/SrsBackendClient';

interface PrivateApiClientDeps {
  backendClient: Pick<SrsBackendClient, 'privateRead' | 'privateCommand'>;
  frontendRuntime?: Pick<FrontendInstanceRuntime, 'getMode' | 'getInstanceId' | 'ensureWritable'> | null;
  followerCommandClient?: Pick<FollowerCommandClient, 'submitAndWait'> | null;
  writerRelayRequiredForMutations?: boolean;
}

export class PrivateApiClient {
  private readonly backendClient: Pick<SrsBackendClient, 'privateRead' | 'privateCommand'>;
  private readonly frontendRuntime: Pick<FrontendInstanceRuntime, 'getMode' | 'getInstanceId' | 'ensureWritable'> | null;
  private readonly followerCommandClient: Pick<FollowerCommandClient, 'submitAndWait'> | null;
  private readonly writerRelayRequiredForMutations: boolean;

  constructor(deps: PrivateApiClientDeps) {
    this.backendClient = deps.backendClient;
    this.frontendRuntime = deps.frontendRuntime ?? null;
    this.followerCommandClient = deps.followerCommandClient ?? null;
    this.writerRelayRequiredForMutations = deps.writerRelayRequiredForMutations !== false;
  }

  async read(request: PrivateApiReadRequest): Promise<PrivateApiReadResult> {
    return this.backendClient.privateRead(request);
  }

  async mutate(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    if (this.writerRelayRequiredForMutations && !this.frontendRuntime) {
      throw new Error('WRITER_UNAVAILABLE: private mutation requires writer relay runtime');
    }
    if (this.isFollowerMode()) {
      return this.relayMutation(request);
    }
    if (this.writerRelayRequiredForMutations) {
      if (!this.frontendRuntime) {
        throw new Error('WRITER_UNAVAILABLE: private mutation requires writer relay runtime');
      }
      try {
        await this.frontendRuntime.ensureWritable();
      } catch (error) {
        if (this.isFollowerMode()) {
          return this.relayMutation(request);
        }
        throw error;
      }
      if (this.isFollowerMode()) {
        return this.relayMutation(request);
      }
    }
    if (!this.isFollowerMode()) {
      return this.backendClient.privateCommand(request);
    }
    return this.relayMutation(request);
  }

  private async relayMutation(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    if (!this.followerCommandClient || !this.frontendRuntime) {
      throw new Error('WRITER_UNAVAILABLE: private mutation relay is unavailable in follower mode');
    }
    const relayResult = await this.followerCommandClient.submitAndWait<unknown>({
      instanceId: this.frontendRuntime.getInstanceId(),
      commandId: request.requestId,
      method: request.method,
      params: request,
    }, 15_000);
    return relayResult as PrivateApiMutationResult;
  }

  private isFollowerMode(): boolean {
    return this.frontendRuntime?.getMode() === 'follower';
  }
}
