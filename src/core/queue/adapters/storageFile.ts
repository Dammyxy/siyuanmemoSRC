import type { PersistenceAdapter } from '../persistence.ts';
import type { StorageManager } from '../../storage/manager.ts';

export class StorageFileJsonAdapter<TSnapshot extends object> implements PersistenceAdapter<TSnapshot> {
  private readonly storage: StorageManager;
  private readonly fileName: string;

  constructor(
    storage: StorageManager,
    fileName: string,
  ) {
    this.storage = storage;
    this.fileName = fileName;
  }

  async load(): Promise<TSnapshot | null> {
    const raw = await this.storage.readPluginFile(this.fileName);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TSnapshot;
    } catch {
      return null;
    }
  }

  async save(snapshot: TSnapshot): Promise<void> {
    await this.storage.writePluginFile(this.fileName, JSON.stringify(snapshot, null, 2));
  }

  async clear(): Promise<void> {
    await this.storage.writePluginFile(this.fileName, JSON.stringify({}, null, 2));
  }
}

