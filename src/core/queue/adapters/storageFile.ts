import type { PersistenceAdapter } from '../persistence.ts';
import type { PluginFilePort } from '../../storage/ports.ts';

export class StorageFileJsonAdapter<TSnapshot extends object> implements PersistenceAdapter<TSnapshot> {
  private readonly storage: PluginFilePort;
  private readonly fileName: string;

  constructor(
    storage: PluginFilePort,
    fileName: string,
  ) {
    this.storage = storage;
    this.fileName = fileName;
  }

  async load(): Promise<TSnapshot | null> {
    if (typeof this.storage.readPluginFile !== 'function') {
      return null;
    }
    const raw = await this.storage.readPluginFile(this.fileName);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TSnapshot;
    } catch {
      return null;
    }
  }

  async save(snapshot: TSnapshot): Promise<void> {
    if (typeof this.storage.writePluginFile !== 'function') {
      throw new Error('writePluginFile is not available');
    }
    await this.storage.writePluginFile(this.fileName, JSON.stringify(snapshot, null, 2));
  }

  async clear(): Promise<void> {
    if (typeof this.storage.writePluginFile !== 'function') {
      throw new Error('writePluginFile is not available');
    }
    await this.storage.writePluginFile(this.fileName, JSON.stringify({}, null, 2));
  }
}

