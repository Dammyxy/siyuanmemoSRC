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
  frontendRuntime?: Pick<FrontendInstanceRuntime, 'getMode' | 'getInstanceId'> | null;
  followerCommandClient?: Pick<FollowerCommandClient, 'submitAndWait'> | null;
}

export class PrivateApiClient {
  private readonly backendClient: Pick<SrsBackendClient, 'privateRead' | 'privateCommand'>;
  private readonly frontendRuntime: Pick<FrontendInstanceRuntime, 'getMode' | 'getInstanceId'> | null;
  private readonly followerCommandClient: Pick<FollowerCommandClient, 'submitAndWait'> | null;

  constructor(deps: PrivateApiClientDeps) {
    this.backendClient = deps.backendClient;
    this.frontendRuntime = deps.frontendRuntime ?? null;
    this.followerCommandClient = deps.followerCommandClient ?? null;
  }

  async read(request: PrivateApiReadRequest): Promise<PrivateApiReadResult> {
    return this.backendClient.privateRead(request);
  }

  async mutate(request: PrivateApiMutationRequest): Promise<PrivateApiMutationResult> {
    if (!this.isFollowerMode()) {
      return this.backendClient.privateCommand(request);
    }
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
