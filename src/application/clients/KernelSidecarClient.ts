import type {
  KernelCompanionPort,
  KernelCompanionStatus,
} from '@/application/ports/KernelCompanionPort';
import type {
  KernelWriterAcquireLeaseRequest,
  KernelWriterHelloRequest,
  KernelWriterLeaseEnvelope,
  KernelWriterLeaseSuccessEnvelope,
  KernelWriterReleaseLeaseRequest,
  KernelWriterRenewLeaseRequest,
} from '../../../packages/contracts/src/kernel-rpc';

export class KernelSidecarClient {
  constructor(private readonly companionPort: KernelCompanionPort) {}

  getStatus(): Promise<KernelCompanionStatus> {
    return this.companionPort.getStatus();
  }

  call<TResult>(method: string, params?: unknown): Promise<TResult> {
    return this.companionPort.call<TResult>(method, params);
  }

  async writerHello(request: KernelWriterHelloRequest): Promise<KernelWriterLeaseSuccessEnvelope> {
    const result = await this.call<KernelWriterLeaseEnvelope>('writer.hello', request);
    return this.unwrapWriterLeaseEnvelope('writer.hello', result);
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
}
