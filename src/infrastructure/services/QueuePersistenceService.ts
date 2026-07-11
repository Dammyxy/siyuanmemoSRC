/**
 * Worker-backed queue state persistence.
 *
 * Queue domain objects keep an in-memory read cache, while every formal
 * mutation is acknowledged only after the Worker returns journal durability.
 */

import type {
  BackendQueueStateBatchMutateRequest,
  BackendQueueStateBatchMutateResult,
  BackendQueueStateLoadAllResult,
} from '../../../packages/contracts/src/backend-rpc';
import { stripTransientSchedulingPreviewFields } from '@/core/scheduler/schedulingStateCleanliness';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueuePersistenceService');

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function queueStateEquals(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

export interface QueueStateWorkerExecutor {
  loadAll(): Promise<BackendQueueStateLoadAllResult>;
  batchMutate(
    request: BackendQueueStateBatchMutateRequest,
  ): Promise<BackendQueueStateBatchMutateResult>;
}

export interface IQueuePersistenceService {
  init(): Promise<void>;
  get<T>(key: string): T | null;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): string[];
  flush(): Promise<void>;
}

export class QueuePersistenceError extends Error {
  constructor(
    public readonly operation: string,
    public readonly key: string,
    public readonly cause: Error,
  ) {
    super(`Queue persistence ${operation} failed for key "${key}": ${cause.message}`);
    this.name = 'QueuePersistenceError';
  }
}

export class QueuePersistenceService implements IQueuePersistenceService {
  private cache = new Map<string, unknown>();
  private initialized = false;

  constructor(
    private readonly executor?: QueueStateWorkerExecutor | null,
    private readonly createMutationId: () => string = createQueueMutationId,
  ) {}

  async init(): Promise<void> {
    if (this.initialized) {
      logger.warn('Already initialized, skipping');
      return;
    }

    try {
      if (!this.executor) {
        throw new Error('BACKEND_UNAVAILABLE: Worker queue state executor unavailable');
      }
      const result = await this.executor.loadAll();
      this.cache = new Map(Object.entries(result.values).map(([key, value]) => [
        key,
        stripTransientSchedulingPreviewFields(value).value,
      ]));
      this.initialized = true;
      logger.info(`Loaded ${this.cache.size} queue(s) from Worker`);
    } catch (error) {
      logger.error('Failed to initialize:', error);
      throw new QueuePersistenceError(
        'init',
        'all',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  get<T>(key: string): T | null {
    if (!this.initialized) {
      logger.warn('Service not initialized, returning null');
      return null;
    }

    const value = this.cache.get(key);
    return value !== undefined ? value as T : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.assertInitialized('set', key);
    const normalizedKey = normalizeQueueStateKey(key);
    const cleanValue = stripTransientSchedulingPreviewFields(value).value;

    try {
      JSON.stringify(cleanValue);
    } catch (error) {
      throw new QueuePersistenceError(
        'set',
        normalizedKey,
        new Error(`Value is not JSON-serializable: ${error instanceof Error ? error.message : String(error)}`),
      );
    }

    const currentValue = this.cache.get(normalizedKey);
    if (currentValue !== undefined && queueStateEquals(currentValue, cleanValue)) {
      return;
    }

    const mutationId = this.createMutationId();
    const result = await this.executor!.batchMutate({
      mutationId,
      mutations: [{
        operation: 'set',
        key: normalizedKey,
        value: cleanValue,
      }],
    });
    assertQueueDurabilityReceipt(result, mutationId, normalizedKey, 'set');
    this.cache.set(normalizedKey, cleanValue);
  }

  async delete(key: string): Promise<void> {
    this.assertInitialized('delete', key);
    const normalizedKey = normalizeQueueStateKey(key);
    if (!this.cache.has(normalizedKey)) {
      return;
    }

    const mutationId = this.createMutationId();
    const result = await this.executor!.batchMutate({
      mutationId,
      mutations: [{
        operation: 'delete',
        key: normalizedKey,
      }],
    });
    assertQueueDurabilityReceipt(result, mutationId, normalizedKey, 'delete');
    this.cache.delete(normalizedKey);
  }

  keys(): string[] {
    if (!this.initialized) {
      logger.warn('Service not initialized, returning empty array');
      return [];
    }
    return Array.from(this.cache.keys());
  }

  async flush(): Promise<void> {
    this.assertInitialized('flush', 'all');
  }

  async dispose(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    await this.flush();
    logger.info('QueuePersistenceService disposed');
  }

  private assertInitialized(operation: string, key: string): void {
    if (!this.initialized || !this.executor) {
      throw new QueuePersistenceError(
        operation,
        key,
        new Error('Service not initialized'),
      );
    }
  }
}

function assertQueueDurabilityReceipt(
  result: BackendQueueStateBatchMutateResult,
  mutationId: string,
  key: string,
  operation: 'set' | 'delete',
): void {
  const receipt = result.durabilityReceipt;
  const resultKeys = operation === 'set' ? result.updatedKeys : result.deletedKeys;
  if (
    receipt.family !== 'queue'
    || (receipt.stage !== 'journaled' && receipt.stage !== 'truth-committed')
    || receipt.mutationId !== mutationId
    || !resultKeys.includes(key)
  ) {
    throw new Error('STORAGE_JOURNAL_FAILED: Queue Worker mutation returned invalid durability receipt');
  }
}

function normalizeQueueStateKey(key: string): string {
  const normalized = String(key || '').trim();
  if (!normalized) {
    throw new Error('INVALID_REQUEST: Queue state key is required');
  }
  return normalized;
}

let fallbackMutationSequence = 0;

function createQueueMutationId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) {
    return `queue:${randomUUID}`;
  }
  fallbackMutationSequence += 1;
  return `queue:${Date.now()}:${fallbackMutationSequence}`;
}
