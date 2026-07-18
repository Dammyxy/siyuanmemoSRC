import type {
  KernelCompanionBroadcastHandlers,
  KernelCompanionBroadcastSubscription,
  KernelCompanionPort,
  KernelCompanionStatus,
} from '@/application/ports/KernelCompanionPort';
import type {
  KernelWriterCommandResultLookupEnvelope,
  KernelWriterCompleteCommandRequest,
  KernelWriterAcquireLeaseRequest,
  KernelWriterFailCommandRequest,
  KernelWriterGetCommandResultRequest,
  KernelWriterHelloRequest,
  KernelWriterLeaseEnvelope,
  KernelWriterLeaseSuccessEnvelope,
  KernelWriterTakeCommandLookupEnvelope,
  KernelWriterTakeCommandRequest,
  KernelWriterReleaseLeaseRequest,
  KernelWriterRenewLeaseRequest,
  KernelWriterSubmitCommandEnvelope,
  KernelWriterSubmitCommandRequest,
  KernelIdentityInitializationFenceAcquireRequest,
  KernelIdentityInitializationFenceEnvelope,
  KernelIdentityInitializationFenceReleaseRequest,
  KernelNetworkFetchExternalRequest,
  KernelNetworkFetchExternalResult,
  QueueProjectionIdentityBroadcastPayload,
  QueueProjectionIdentityPublishEnvelope,
} from '../../../packages/contracts/src/kernel-rpc';

export class KernelSidecarClient {
  constructor(private readonly companionPort: KernelCompanionPort) {}

  getStatus(): Promise<KernelCompanionStatus> {
    return this.companionPort.getStatus();
  }

  call<TResult>(method: string, params?: unknown): Promise<TResult> {
    return this.companionPort.call<TResult>(method, params);
  }

  subscribeBroadcast(handlers: KernelCompanionBroadcastHandlers): KernelCompanionBroadcastSubscription | null {
    if (typeof this.companionPort.subscribeBroadcast !== 'function') {
      return null;
    }
    return this.companionPort.subscribeBroadcast(handlers);
  }

  async writerHello(request: KernelWriterHelloRequest): Promise<KernelWriterLeaseSuccessEnvelope> {
    const result = await this.call<KernelWriterLeaseEnvelope>('writer.hello', request);
    return this.unwrapWriterLeaseEnvelope('writer.hello', result);
  }

  async identityAcquireInitializationFence(
    request: KernelIdentityInitializationFenceAcquireRequest,
  ): Promise<KernelIdentityInitializationFenceEnvelope> {
    const result = await this.call<KernelIdentityInitializationFenceEnvelope>(
      'identity.acquireInitializationFence',
      request,
    );
    this.assertIdentityFenceEnvelope('identity.acquireInitializationFence', result);
    return result;
  }

  async identityReleaseInitializationFence(
    request: KernelIdentityInitializationFenceReleaseRequest,
  ): Promise<KernelIdentityInitializationFenceEnvelope> {
    const result = await this.call<KernelIdentityInitializationFenceEnvelope>(
      'identity.releaseInitializationFence',
      request,
    );
    this.assertIdentityFenceEnvelope('identity.releaseInitializationFence', result);
    return result;
  }

  async writerGetLease(): Promise<KernelWriterLeaseSuccessEnvelope> {
    const result = await this.call<KernelWriterLeaseEnvelope>('writer.getLease');
    return this.unwrapWriterLeaseEnvelope('writer.getLease', result);
  }

  async writerAcquireLease(request: KernelWriterAcquireLeaseRequest): Promise<KernelWriterLeaseSuccessEnvelope> {
    const result = await this.call<KernelWriterLeaseEnvelope>('writer.acquireLease', request);
    return this.unwrapWriterLeaseEnvelope('writer.acquireLease', result);
  }

  async writerRenewLease(request: KernelWriterRenewLeaseRequest): Promise<KernelWriterLeaseSuccessEnvelope> {
    const result = await this.call<KernelWriterLeaseEnvelope>('writer.renewLease', request);
    return this.unwrapWriterLeaseEnvelope('writer.renewLease', result);
  }

  async writerReleaseLease(request: KernelWriterReleaseLeaseRequest): Promise<KernelWriterLeaseSuccessEnvelope> {
    const result = await this.call<KernelWriterLeaseEnvelope>('writer.releaseLease', request);
    return this.unwrapWriterLeaseEnvelope('writer.releaseLease', result);
  }

  async writerSubmitCommand(request: KernelWriterSubmitCommandRequest): Promise<{
    commandId: string;
    ownerInstanceId: string;
    ownerSurfaceId?: string;
    status: 'queued';
    now: number;
  }> {
    const result = await this.call<KernelWriterSubmitCommandEnvelope>('writer.submitCommand', request);
    return this.unwrapWriterSubmitEnvelope('writer.submitCommand', result);
  }

  async writerCompleteCommand(request: KernelWriterCompleteCommandRequest): Promise<{ ok: true; now: number }> {
    const result = await this.call<{ ok: true; now: number }>('writer.completeCommand', request);
    this.assertSimpleOkEnvelope('writer.completeCommand', result);
    return result;
  }

  async writerFailCommand(request: KernelWriterFailCommandRequest): Promise<{ ok: true; now: number }> {
    const result = await this.call<{ ok: true; now: number }>('writer.failCommand', request);
    this.assertSimpleOkEnvelope('writer.failCommand', result);
    return result;
  }

  async writerGetCommandResult(request: KernelWriterGetCommandResultRequest): Promise<{
    commandId: string;
    status: 'pending' | 'completed' | 'failed' | 'unavailable' | 'expired';
    ownerInstanceId?: string;
    ownerSurfaceId?: string;
    requesterInstanceId?: string;
    writerInstanceId?: string;
    result?: unknown;
    error?: {
      code: string;
      message: string;
    };
    completedAt?: number;
    now: number;
  }> {
    const result = await this.call<KernelWriterCommandResultLookupEnvelope>('writer.getCommandResult', request);
    return this.unwrapWriterCommandResultEnvelope('writer.getCommandResult', result);
  }

  async writerTakeCommand(request: KernelWriterTakeCommandRequest): Promise<{
      command: {
        commandId: string;
        requesterInstanceId: string;
        method: string;
        params?: unknown;
        idempotencyKey?: string;
        requestedAt: number;
        expiresAt?: number;
      } | null;
    pendingCommandCount?: number;
    now: number;
  }> {
    const result = await this.call<KernelWriterTakeCommandLookupEnvelope>('writer.takeCommand', request);
    return this.unwrapWriterTakeCommandEnvelope('writer.takeCommand', result);
  }

  async networkFetchExternal(request: KernelNetworkFetchExternalRequest): Promise<KernelNetworkFetchExternalResult> {
    const result = await this.call<KernelNetworkFetchExternalResult>('network.fetchExternal', request);
    if (!result || typeof result !== 'object') {
      throw new Error('Kernel companion network.fetchExternal returned invalid response envelope');
    }
    const candidate = result as KernelNetworkFetchExternalResult;
    if (typeof candidate.status !== 'number' || typeof candidate.body !== 'string') {
      throw new Error('Kernel companion network.fetchExternal returned invalid payload');
    }
    return {
      requestId: typeof candidate.requestId === 'string' ? candidate.requestId : '',
      status: candidate.status,
      headers: candidate.headers && typeof candidate.headers === 'object' ? candidate.headers : {},
      body: candidate.body,
    };
  }

  async queueProjectionPublishIdentityChanged(
    request: QueueProjectionIdentityBroadcastPayload,
  ): Promise<QueueProjectionIdentityPublishEnvelope> {
    const result = await this.call<QueueProjectionIdentityPublishEnvelope>(
      'queueProjection.publishIdentityChanged',
      request,
    );
    if (!result || typeof result !== 'object' || result.ok !== true || !result.broadcast) {
      throw new Error('Kernel companion queueProjection.publishIdentityChanged returned invalid response envelope');
    }
    return result;
  }

  private unwrapWriterLeaseEnvelope(
    method: string,
    envelope: KernelWriterLeaseEnvelope,
  ): KernelWriterLeaseSuccessEnvelope {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error(`Kernel companion ${method} returned invalid response envelope`);
    }
    if (!('ok' in envelope)) {
      throw new Error(`Kernel companion ${method} response missing ok field`);
    }
    if (envelope.ok === false) {
      throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
    }
    return envelope;
  }

  private unwrapWriterSubmitEnvelope(
    method: string,
    envelope: KernelWriterSubmitCommandEnvelope,
  ): {
    commandId: string;
    ownerInstanceId: string;
    ownerSurfaceId?: string;
    status: 'queued';
    now: number;
  } {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error(`Kernel companion ${method} returned invalid response envelope`);
    }
    if (!('ok' in envelope)) {
      throw new Error(`Kernel companion ${method} response missing ok field`);
    }
    if (envelope.ok === false) {
      throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
    }
    return envelope;
  }

  private unwrapWriterCommandResultEnvelope(
    method: string,
    envelope: KernelWriterCommandResultLookupEnvelope,
  ): {
    commandId: string;
    status: 'pending' | 'completed' | 'failed' | 'unavailable' | 'expired';
    ownerInstanceId?: string;
    ownerSurfaceId?: string;
    requesterInstanceId?: string;
    writerInstanceId?: string;
    result?: unknown;
    error?: {
      code: string;
      message: string;
    };
    completedAt?: number;
    now: number;
  } {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error(`Kernel companion ${method} returned invalid response envelope`);
    }
    if (!('ok' in envelope)) {
      throw new Error(`Kernel companion ${method} response missing ok field`);
    }
    if (envelope.ok === false) {
      throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
    }
    if (!this.isWriterCommandResultStatus(envelope.status)) {
      throw new Error(`Kernel companion ${method} returned invalid command status: ${String((envelope as { status?: unknown }).status)}`);
    }
    return envelope;
  }

  private assertSimpleOkEnvelope(method: string, envelope: unknown): void {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error(`Kernel companion ${method} returned invalid response envelope`);
    }
    if (!('ok' in envelope) || (envelope as { ok?: unknown }).ok !== true) {
      throw new Error(`Kernel companion ${method} response missing ok=true`);
    }
  }

  private assertIdentityFenceEnvelope(
    method: string,
    envelope: KernelIdentityInitializationFenceEnvelope,
  ): void {
    if (!envelope || typeof envelope !== 'object' || !('ok' in envelope) || typeof envelope.now !== 'number') {
      throw new Error(`Kernel companion ${method} returned invalid response envelope`);
    }
    if (envelope.ok === false && (!envelope.error || typeof envelope.error.message !== 'string')) {
      throw new Error(`Kernel companion ${method} returned invalid error envelope`);
    }
  }

  private unwrapWriterTakeCommandEnvelope(
    method: string,
    envelope: KernelWriterTakeCommandLookupEnvelope,
  ): {
      command: {
        commandId: string;
        requesterInstanceId: string;
        method: string;
        params?: unknown;
        idempotencyKey?: string;
        requestedAt: number;
        expiresAt?: number;
      } | null;
    pendingCommandCount?: number;
    now: number;
  } {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error(`Kernel companion ${method} returned invalid response envelope`);
    }
    if (!('ok' in envelope)) {
      throw new Error(`Kernel companion ${method} response missing ok field`);
    }
    if (envelope.ok === false) {
      throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
    }
    return envelope;
  }

  private isWriterCommandResultStatus(value: unknown): value is 'pending' | 'completed' | 'failed' | 'unavailable' | 'expired' {
    return value === 'pending'
      || value === 'completed'
      || value === 'failed'
      || value === 'unavailable'
      || value === 'expired';
  }
}
