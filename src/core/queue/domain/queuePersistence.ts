import type { QueuePersistencePort } from './ports';

interface QueuePersistenceLogger {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface QueueLoadResult<T> {
  value: T;
  fromStorage: boolean;
}

interface LoadQueueStateOptions<T> {
  persistence: QueuePersistencePort;
  key: string;
  initialValue: T;
  logger: QueuePersistenceLogger;
  context: string;
  validate?: (value: unknown) => value is T;
}

interface SaveQueueStateOptions<T> {
  persistence: QueuePersistencePort;
  key: string;
  value: T;
  logger: QueuePersistenceLogger;
  context: string;
}

export function loadQueueState<T>(options: LoadQueueStateOptions<T>): QueueLoadResult<T> {
  const { persistence, key, initialValue, logger, context, validate } = options;

  try {
    const raw = persistence.get<unknown>(key);
    if (raw == null) {
      return { value: initialValue, fromStorage: false };
    }

    if (validate && !validate(raw)) {
      logger.warn(`[${context}] Invalid persisted queue state for key "${key}", using initial value`);
      return { value: initialValue, fromStorage: false };
    }

    return { value: raw as T, fromStorage: true };
  } catch (error) {
    logger.error(`[${context}] Failed to load queue state for key "${key}":`, error);
    return { value: initialValue, fromStorage: false };
  }
}

export async function saveQueueState<T>(options: SaveQueueStateOptions<T>): Promise<void> {
  const { persistence, key, value, logger, context } = options;

  try {
    await persistence.set(key, value);
  } catch (error) {
    logger.error(`[${context}] Failed to save queue state for key "${key}":`, error);
    throw error;
  }
}
