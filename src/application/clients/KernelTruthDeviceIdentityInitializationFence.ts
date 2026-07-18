import type { TruthDeviceIdentityInitializationFencePort } from '@/application/ports/TruthDeviceIdentityPort';
import { KernelSidecarClient } from './KernelSidecarClient';

export interface KernelTruthDeviceIdentityInitializationFenceOptions {
  instanceId?: string;
  acquireTimeoutMs?: number;
  retryDelayMs?: number;
  leaseTtlMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}

function createInstanceId(): string {
  const randomId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `identity-init-${randomId}`;
}

export class KernelTruthDeviceIdentityInitializationFence implements TruthDeviceIdentityInitializationFencePort {
  private readonly instanceId: string;
  private readonly acquireTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly leaseTtlMs: number;
  private readonly now: () => number;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(
    private readonly kernelSidecarClient: KernelSidecarClient,
    options: KernelTruthDeviceIdentityInitializationFenceOptions = {},
  ) {
    this.instanceId = String(options.instanceId || '').trim() || createInstanceId();
    this.acquireTimeoutMs = Math.max(250, Math.floor(options.acquireTimeoutMs ?? 10_000));
    this.retryDelayMs = Math.max(10, Math.floor(options.retryDelayMs ?? 50));
    this.leaseTtlMs = Math.max(1_000, Math.floor(options.leaseTtlMs ?? 15_000));
    this.now = options.now ?? Date.now;
    this.delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const deadline = this.now() + this.acquireTimeoutMs;
    let token: string | null = null;
    let lastAcquireError: string | null = null;
    while (this.now() <= deadline) {
      let acquired: Awaited<ReturnType<KernelSidecarClient['identityAcquireInitializationFence']>>;
      try {
        acquired = await this.kernelSidecarClient.identityAcquireInitializationFence({
          instanceId: this.instanceId,
          ttlMs: this.leaseTtlMs,
        });
      } catch (error) {
        lastAcquireError = error instanceof Error ? error.message : String(error);
        if (this.now() >= deadline) break;
        await this.delay(this.retryDelayMs);
        continue;
      }
      if (acquired.ok === true && acquired.fence?.instanceId === this.instanceId) {
        token = acquired.fence.token;
        break;
      }
      if (acquired.ok === false && acquired.error.code !== 'FENCE_UNAVAILABLE') {
        throw new Error(`${acquired.error.code}: ${acquired.error.message}`);
      }
      lastAcquireError = acquired.ok === false
        ? `${acquired.error.code}: ${acquired.error.message}`
        : 'initialization fence returned a mismatched owner';
      if (this.now() >= deadline) break;
      await this.delay(this.retryDelayMs);
    }
    if (!token) {
      throw new Error(
        `TRUTH_DEVICE_IDENTITY_AUTHORITY_UNAVAILABLE: initialization fence timeout${lastAcquireError ? ` (${lastAcquireError})` : ''}`,
      );
    }

    let operationError: unknown = null;
    try {
      return await operation();
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      try {
        const released = await this.kernelSidecarClient.identityReleaseInitializationFence({
          instanceId: this.instanceId,
          token,
        });
        if (released.ok === false && released.error.code !== 'FENCE_UNAVAILABLE') {
          throw new Error(`${released.error.code}: ${released.error.message}`);
        }
      } catch (releaseError) {
        if (operationError === null) {
          throw releaseError;
        }
      }
    }
  }
}
