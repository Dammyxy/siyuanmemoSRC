import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';

export interface FollowerCommandRequest {
  instanceId: string;
  method: string;
  params?: unknown;
}

export class FollowerCommandClient {
  constructor(private readonly sidecarClient: KernelSidecarClient) {}

  async submitAndWait<TResult>(request: FollowerCommandRequest, timeoutMs = 15_000): Promise<TResult> {
    const submitted = await this.sidecarClient.writerSubmitCommand({
      instanceId: request.instanceId,
      method: request.method,
      params: request.params,
    });
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const result = await this.sidecarClient.writerGetCommandResult({
        commandId: submitted.commandId,
      });
      if (result.status === 'pending') {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      if (result.status === 'failed') {
        const code = result.error?.code || 'INTERNAL_ERROR';
        const message = result.error?.message || 'writer relay failed';
        throw new Error(`${code}: ${message}`);
      }
      return result.result as TResult;
    }
    throw new Error('BACKEND_UNAVAILABLE: writer relay timeout');
  }
}

