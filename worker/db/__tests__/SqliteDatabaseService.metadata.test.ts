import { describe, expect, it, vi } from 'vitest';
import {
  createSqliteFileServiceAdapter,
  normalizeSqlitePersistenceHostEffectMetadata,
} from '../SqliteDatabaseService';
import type {
  SqlitePersistenceBridge,
  SqlitePersistenceHostEffectMetadata,
} from '../SqlitePersistenceBridge';

describe('Worker SQLite persistence metadata adapter', () => {
  it('normalizes runtime delta diagnostics before forwarding host effects', async () => {
    const calls: Array<{ kind: string; metadata?: SqlitePersistenceHostEffectMetadata }> = [];
    const bridge: SqlitePersistenceBridge = {
      readBinary: vi.fn(async (_path, metadata) => {
        calls.push({ kind: 'readBinary', metadata });
        return null;
      }),
      writeBinary: vi.fn(async (_path, _bytes, metadata) => {
        calls.push({ kind: 'writeBinary', metadata });
      }),
      readJSON: vi.fn(async (_path, metadata) => {
        calls.push({ kind: 'readJSON', metadata });
        return null;
      }),
      writeJSON: vi.fn(async (_path, _value, metadata) => {
        calls.push({ kind: 'writeJSON', metadata });
      }),
    };
    const adapter = createSqliteFileServiceAdapter(bridge);
    const runtimeMetadata = {
      diagnostics: {
        sqliteDeltaPurpose: 'sqlite-delta.append-preflight',
        sqliteDeltaSubstep: 'read-append-hot-path-snapshot',
        ignored: 'not-forwarded',
      },
    };

    await adapter.readBinary('sqlite-delta/v2/sqlite-delta-log.v2.sealed-3.msgpack', runtimeMetadata);
    await adapter.writeBinary('sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack', new Uint8Array([1]), runtimeMetadata);
    await adapter.readJSON('sqlite-delta/v2/manifest.json', runtimeMetadata);
    await adapter.writeJSON('sqlite-delta/v2/manifest.json', {}, runtimeMetadata);

    expect(calls).toEqual([
      {
        kind: 'readBinary',
        metadata: {
          purpose: 'sqlite-delta.append-preflight',
          substep: 'read-append-hot-path-snapshot',
        },
      },
      {
        kind: 'writeBinary',
        metadata: {
          purpose: 'sqlite-delta.append-preflight',
          substep: 'read-append-hot-path-snapshot',
        },
      },
      {
        kind: 'readJSON',
        metadata: {
          purpose: 'sqlite-delta.append-preflight',
          substep: 'read-append-hot-path-snapshot',
        },
      },
      {
        kind: 'writeJSON',
        metadata: {
          purpose: 'sqlite-delta.append-preflight',
          substep: 'read-append-hot-path-snapshot',
        },
      },
    ]);
  });

  it('preserves direct bridge metadata and ignores unrelated diagnostics', () => {
    expect(normalizeSqlitePersistenceHostEffectMetadata({
      purpose: 'direct-purpose',
      substep: 'direct-substep',
    })).toEqual({
      purpose: 'direct-purpose',
      substep: 'direct-substep',
    });
    expect(normalizeSqlitePersistenceHostEffectMetadata({
      diagnostics: {
        otherPurpose: 'not-a-sqlite-delta-key',
      },
    })).toBeUndefined();
  });
});
