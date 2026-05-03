import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import type { KernelRelayMethod } from '../../../packages/contracts/src/kernel-rpc';
import { createLogger } from '@/utils/logger';
import {
  getRelayCompletionExtraDiagnostics,
  shouldLogRelayCommandSubmitted,
} from '@/application/clients/relayDiagnostics';

export interface FollowerCommandRequest {
  instanceId: string;
  commandId?: string;
  method: KernelRelayMethod;
  params?: unknown;
}

export interface RelayDiagnosticsLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export class FollowerCommandClient {
  constructor(
    private readonly sidecarClient: KernelSidecarClient,
    private readonly logger: RelayDiagnosticsLogger = createLogger('FollowerCommandClient'),
  ) {}

  async submitAndWait<TResult>(request: FollowerCommandRequest, timeoutMs = 15_000): Promise<TResult> {
    const submitted = await this.sidecarClient.writerSubmitCommand({
      instanceId: request.instanceId,
      commandId: request.commandId,
      method: request.method,
      params: request.params,
    });
    if (shouldLogRelayCommandSubmitted(request.method)) {
      this.logger.info('[FollowerCommandClient] relay command submitted', {
        commandId: submitted.commandId,
        instanceId: request.instanceId,
        method: request.method,
        ownerInstanceId: submitted.ownerInstanceId,
        ...(submitted.ownerSurfaceId ? { ownerSurfaceId: submitted.ownerSurfaceId } : {}),
        status: submitted.status,
      });
    }
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
        this.logger.warn('[FollowerCommandClient] relay command failed', {
          commandId: submitted.commandId,
          instanceId: request.instanceId,
          method: request.method,
          ownerInstanceId: result.ownerInstanceId,
          ...(result.ownerSurfaceId ? { ownerSurfaceId: result.ownerSurfaceId } : {}),
          status: result.status,
          error: result.error,
        });
        throw new Error(this.formatRelayError(result.error, 'writer relay failed'));
      }
      if (result.status === 'unavailable' || result.status === 'expired') {
        this.logger.warn('[FollowerCommandClient] relay command unavailable', {
          commandId: submitted.commandId,
          instanceId: request.instanceId,
          method: request.method,
          ownerInstanceId: result.ownerInstanceId,
          ...(result.ownerSurfaceId ? { ownerSurfaceId: result.ownerSurfaceId } : {}),
          status: result.status,
          error: result.error,
        });
        throw new Error(this.formatRelayError(result.error, 'writer relay unavailable'));
      }
      const completionDiagnostics = getRelayCompletionExtraDiagnostics(request.method, result.result);
      if (completionDiagnostics) {
        this.logger.info('[FollowerCommandClient] relay command completed', {
          commandId: submitted.commandId,
          instanceId: request.instanceId,
          method: request.method,
          ownerInstanceId: result.ownerInstanceId,
          ...(result.ownerSurfaceId ? { ownerSurfaceId: result.ownerSurfaceId } : {}),
          status: result.status,
          ...completionDiagnostics,
        });
      }
      return result.result as TResult;
    }
    this.logger.warn('[FollowerCommandClient] relay command timeout', {
      commandId: submitted.commandId,
      instanceId: request.instanceId,
      method: request.method,
      timeoutMs,
    });
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
