import type {
  TruthDeviceIdentityPort,
  TruthDeviceIdentityRecord,
} from '@/application/ports/TruthDeviceIdentityPort';

const DATABASE_NAME = 'siyuanmemo-device-identity';
const DATABASE_VERSION = 1;
const STORE_NAME = 'identity';
const INSTALLATION_KEY = 'installation';

function unavailableError(reason: string): Error {
  return new Error(`TRUTH_DEVICE_IDENTITY_UNAVAILABLE: ${reason}`);
}

function resolveIndexedDbFactory(): IDBFactory | null {
  const candidate = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
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

export class IndexedDbTruthDeviceIdentityStore implements TruthDeviceIdentityPort {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDbFactory: IDBFactory | null = resolveIndexedDbFactory()) {}

  async readRecord(): Promise<unknown | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).get(INSTALLATION_KEY);
    const [record] = await Promise.all([requestToPromise(request), done]);
    return record ?? null;
  }

  async writeRecord(record: TruthDeviceIdentityRecord): Promise<void> {
    const database = await this.openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const done = transactionDone(transaction);
    const request = transaction.objectStore(STORE_NAME).put(record, INSTALLATION_KEY);
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
