import type {
  KernelCompanionPort,
  KernelCompanionStatus,
} from '@/application/ports/KernelCompanionPort';

export class KernelSidecarClient {
  constructor(private readonly companionPort: KernelCompanionPort) {}

  getStatus(): Promise<KernelCompanionStatus> {
    return this.companionPort.getStatus();
  }

  call<TResult>(method: string, params?: unknown): Promise<TResult> {
    return this.companionPort.call<TResult>(method, params);
  }
}
