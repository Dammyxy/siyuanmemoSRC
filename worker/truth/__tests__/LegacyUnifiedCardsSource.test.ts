import { describe, expect, it } from 'vitest';
import {
  detectLegacyUnifiedCardsSource,
  LEGACY_UNIFIED_CARDS_SOURCE_PATH,
  LegacyUnifiedCardsSourceReadError,
  type LegacyUnifiedCardsSourceFileStore,
} from '../LegacyUnifiedCardsSource';

class MemoryLegacySourceFileStore implements LegacyUnifiedCardsSourceFileStore {
  readonly binaryFiles = new Map<string, Uint8Array>();
  readonly reads: string[] = [];
  readError: Error | null = null;

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    this.reads.push(fileName);
    if (this.readError) {
      throw this.readError;
    }
    const bytes = this.binaryFiles.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }
}

describe('LegacyUnifiedCardsSource', () => {
  it('detects missing unified-cards source without reading split legacy files', async () => {
    const fileStore = new MemoryLegacySourceFileStore();

    const source = await detectLegacyUnifiedCardsSource(fileStore);

    expect(source).toEqual({
      status: 'absent',
      sourceFile: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
      byteLength: 0,
      sha256: null,
      bytes: null,
    });
    expect(fileStore.reads).toEqual([LEGACY_UNIFIED_CARDS_SOURCE_PATH]);
  });

  it('returns SHA-256 metadata and immutable bytes for unified-cards.msgpack', async () => {
    const fileStore = new MemoryLegacySourceFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, new Uint8Array([1, 2, 3, 4, 5]));

    const source = await detectLegacyUnifiedCardsSource(fileStore);

    expect(source.status).toBe('present');
    expect(source.sourceFile).toBe(LEGACY_UNIFIED_CARDS_SOURCE_PATH);
    expect(source.byteLength).toBe(5);
    expect(source.sha256).toBe('sha256:74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0');
    expect(source.bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]));

    if (source.bytes) {
      source.bytes[0] = 99;
    }
    expect(fileStore.binaryFiles.get(LEGACY_UNIFIED_CARDS_SOURCE_PATH)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('fails closed with SOURCE_READ_UNAVAILABLE when the source cannot be read or hashed', async () => {
    const fileStore = new MemoryLegacySourceFileStore();
    fileStore.readError = new Error('host file read failed');

    await expect(detectLegacyUnifiedCardsSource(fileStore)).rejects.toMatchObject({
      code: 'SOURCE_READ_UNAVAILABLE',
      sourceFile: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
    });
    await expect(detectLegacyUnifiedCardsSource(fileStore)).rejects.toBeInstanceOf(LegacyUnifiedCardsSourceReadError);
  });
});
