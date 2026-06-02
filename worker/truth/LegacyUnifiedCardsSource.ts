import type { BackendStorageErrorCode } from '../../packages/contracts/src/backend-rpc';

export const LEGACY_UNIFIED_CARDS_SOURCE_PATH = 'unified-cards.msgpack';
export const LEGACY_SPLIT_CARDS_SOURCE_PATH = 'cards.msgpack';
export const LEGACY_SPLIT_XIUYUAN_SOURCE_PATH = 'xiuyuan.msgpack';
export const LEGACY_SPLIT_SOURCE_PATHS = [
  LEGACY_SPLIT_CARDS_SOURCE_PATH,
  LEGACY_SPLIT_XIUYUAN_SOURCE_PATH,
] as const;

export type LegacyMessagePackSourcePath =
  | typeof LEGACY_UNIFIED_CARDS_SOURCE_PATH
  | typeof LEGACY_SPLIT_SOURCE_PATHS[number];

export interface LegacyUnifiedCardsSourceFileStore {
  readBinary(fileName: string): Promise<Uint8Array | null>;
}

export interface LegacyUnifiedCardsSourceAbsent {
  status: 'absent';
  sourceFile: typeof LEGACY_UNIFIED_CARDS_SOURCE_PATH;
  byteLength: 0;
  sha256: null;
  bytes: null;
}

export interface LegacyUnifiedCardsSourcePresent {
  status: 'present';
  sourceFile: typeof LEGACY_UNIFIED_CARDS_SOURCE_PATH;
  byteLength: number;
  sha256: `sha256:${string}`;
  bytes: Uint8Array;
}

export type LegacyUnifiedCardsSource =
  | LegacyUnifiedCardsSourceAbsent
  | LegacyUnifiedCardsSourcePresent;

export class LegacyUnifiedCardsSourceReadError extends Error {
  readonly code: BackendStorageErrorCode = 'SOURCE_READ_UNAVAILABLE';

  constructor(
    readonly sourceFile: LegacyMessagePackSourcePath,
    readonly cause: Error,
  ) {
    super(`SOURCE_READ_UNAVAILABLE: failed to read legacy source ${sourceFile}: ${cause.message}`);
    this.name = 'LegacyUnifiedCardsSourceReadError';
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('SHA-256 support unavailable');
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

function toReadError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function detectLegacyUnifiedCardsSource(
  fileStore: LegacyUnifiedCardsSourceFileStore,
): Promise<LegacyUnifiedCardsSource> {
  try {
    const sourceFile = LEGACY_UNIFIED_CARDS_SOURCE_PATH;
    const bytes = await fileStore.readBinary(sourceFile);
    if (bytes === null) {
      return {
        status: 'absent',
        sourceFile,
        byteLength: 0,
        sha256: null,
        bytes: null,
      };
    }

    const immutableBytes = new Uint8Array(bytes);
    return {
      status: 'present',
      sourceFile,
      byteLength: immutableBytes.byteLength,
      sha256: await sha256(immutableBytes),
      bytes: immutableBytes,
    };
  } catch (error) {
    throw new LegacyUnifiedCardsSourceReadError(
      LEGACY_UNIFIED_CARDS_SOURCE_PATH,
      toReadError(error),
    );
  }
}
