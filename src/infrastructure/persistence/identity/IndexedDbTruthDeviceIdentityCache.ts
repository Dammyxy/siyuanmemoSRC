import type {
  TruthDeviceIdentityCachePort,
  TruthDeviceIdentityRecord,
} from '@/application/ports/TruthDeviceIdentityPort';

const DATABASE_NAME = 'siyuanmemo-device-identity';
const DATABASE_VERSION = 1;
const STORE_NAME = 'identity';
const INSTALLATION_KEY = 'installation';

function unavailableError(reason: string): Error {
  return new Error(`TRUTH_DEVICE_IDENTITY_CACHE_UNAVAILABLE: ${reason}`);
}

function resolveIndexedDbFactory(): IDBFactory | null {
  const runtimeGlobal = globalThis as typeof globalThis & {
    indexedDB?: IDBFactory;
    window?: { indexedDB?: IDBFactory };
  };
  const candidate = runtimeGlobal.indexedDB ?? runtimeGlobal.window?.indexedDB;
  return candidate && typeof candidate.open === 'function' ? candidate : null;
}

function requestToPromise<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? unavailableError('indexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? unavailableError('indexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? unavailableError('indexedDB transaction aborted'));
  });
}

export class IndexedDbTruthDeviceIdentityCache implements TruthDeviceIdentityCachePort {
  readonly kind = 'indexeddb' as const;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDbFactory: IDBFactory | null = resolveIndexedDbFactory()) {}

  async readCache(): Promise<unknown | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).get(INSTALLATION_KEY);
    const [record] = await Promise.all([requestToPromise(request), done]);
    return record ?? null;
  }

  async writeCache(record: TruthDeviceIdentityRecord): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).put(record, INSTALLATION_KEY);
    await Promise.all([requestToPromise(request), done]);
  }

  async clearCache(): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).delete(INSTALLATION_KEY);
    await Promise.all([requestToPromise(request), done]);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) {
      return this.databasePromise;
    }
    if (!this.indexedDbFactory) {
      throw unavailableError('indexedDB unavailable');
    }
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDbFactory!.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? unavailableError('indexedDB open failed'));
      request.onblocked = () => reject(unavailableError('indexedDB open blocked'));
    });
    return this.databasePromise;
  }
}
