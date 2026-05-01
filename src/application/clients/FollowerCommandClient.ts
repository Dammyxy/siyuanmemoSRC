import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';

export interface FollowerCommandRequest {
  instanceId: string;
  commandId?: string;
  method: string;
  params?: unknown;
}

export class FollowerCommandClient {
  constructor(private readonly sidecarClient: KernelSidecarClient) {}

  async submitAndWait<TResult>(request: FollowerCommandRequest, timeoutMs = 15_000): Promise<TResult> {
    const submitted = await this.sidecarClient.writerSubmitCommand({
      instanceId: request.instanceId,
      commandId: request.commandId,
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
        throw new Error(this.formatRelayError(result.error, 'writer relay failed'));
      }
      if (result.status === 'unavailable' || result.status === 'expired') {
        throw new Error(this.formatRelayError(result.error, 'writer relay unavailable'));
      }
      return result.result as TResult;
    }
    throw new Error('BACKEND_UNAVAILABLE: writer relay timeout');
  }

  private formatRelayError(
    error: { code: string; message: string } | undefined,
    fallbackMessage: string,
  ): string {
    const code = String(error?.code || 'INTERNAL_ERROR').trim() || 'INTERNAL_ERROR';
    const message = String(error?.message || fallbackMessage).trim() || fallbackMessage;
    return `${code}: ${message}`;
  }
}
