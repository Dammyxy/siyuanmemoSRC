import { describe, expect, it } from 'vitest';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

describe('WorkerSqliteDatabaseService', () => {
  it('loads previously persisted database bytes with sql.js runtime', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();

    const first = new WorkerSqliteDatabaseService(bridge);
    await first.init();
    await first.runTransaction('seed-worker-db', (db) => {
      db.run('CREATE TABLE worker_db_seed (id TEXT PRIMARY KEY, value TEXT)');
      db.run('INSERT INTO worker_db_seed (id, value) VALUES (?, ?)', ['a', 'persisted']);
    });
    await first.persist();
    first.dispose();

    const second = new WorkerSqliteDatabaseService(bridge);
    await second.init();
    const row = second.getOne<{ value: string }>(
      'SELECT value FROM worker_db_seed WHERE id = ?',
      ['a'],
    );

    expect(row).toEqual({ value: 'persisted' });
  });

  it('exposes transferable array buffer helper for binary bridge payloads', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const service = new WorkerSqliteDatabaseService(bridge);
    await service.init();
    await service.persist();

    const snapshot = bridge.snapshot();
    expect(snapshot.bytes).toBeTruthy();
    expect(snapshot.bytes!.byteLength).toBeGreaterThan(16);
  });
});
