import { KernelSidecarClient } from '@/application/clients/KernelSidecarClient';
import type { KernelRelayMethod } from '../../../packages/contracts/src/kernel-rpc';
import type { KernelBroadcastEvent } from '../../../packages/contracts/src/kernel-rpc';
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
    const pushedResultCommandIds = new Set<string>();
    let wakePendingResultPoll: (() => void) | null = null;
    const broadcastSubscription = this.sidecarClient.subscribeBroadcast?.({
      onEvent: (event) => {
        if (!this.isMatchingCommandResultEvent(event, submitted.commandId)) {
          return;
        }
        pushedResultCommandIds.add(submitted.commandId);
        const wake = wakePendingResultPoll;
        wakePendingResultPoll = null;
        wake?.();
      },
    });
    try {
      while (Date.now() - startedAt <= timeoutMs) {
        const result = await this.sidecarClient.writerGetCommandResult({
          commandId: submitted.commandId,
        });
        if (result.status === 'pending') {
          await this.waitForResultNotificationOrPollDelay(
            submitted.commandId,
            pushedResultCommandIds,
            (wake) => {
              wakePendingResultPoll = wake;
            },
            200,
          );
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
    } finally {
      wakePendingResultPoll = null;
      broadcastSubscription?.close();
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

  private isMatchingCommandResultEvent(event: KernelBroadcastEvent, commandId: string): boolean {
    return event.method === 'memo.writer.commandResult'
      && !!event.params
      && typeof event.params === 'object'
      && (event.params as { commandId?: unknown }).commandId === commandId;
  }

  private async waitForResultNotificationOrPollDelay(
    commandId: string,
    pushedResultCommandIds: Set<string>,
    registerWake: (wake: () => void) => void,
    pollDelayMs: number,
  ): Promise<void> {
    if (pushedResultCommandIds.delete(commandId)) {
      return;
    }
    await new Promise<void>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(finish, pollDelayMs);
      registerWake(finish);
    });
  }
}
