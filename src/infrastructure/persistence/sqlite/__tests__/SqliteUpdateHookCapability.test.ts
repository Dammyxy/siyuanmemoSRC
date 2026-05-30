import path from 'node:path';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';

describe('sql.js updateHook capability', () => {
  it('exposes Database.updateHook in the shipped wasm runtime', async () => {
    const SQL = await initSqlJs({
      locateFile: (file) => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
    });
    const db = new SQL.Database();
    const events: Array<{ operation: string; table: string; rowid: number }> = [];

    try {
      expect(typeof db.updateHook).toBe('function');
      db.updateHook((operation, _database, table, rowid) => {
        events.push({ operation, table, rowid });
      });
      db.run('CREATE TABLE update_hook_probe (id INTEGER PRIMARY KEY, value TEXT)');
      db.run('INSERT INTO update_hook_probe (id, value) VALUES (1, ?)', ['one']);
      db.run('UPDATE update_hook_probe SET value = ? WHERE id = 1', ['two']);
      db.run('DELETE FROM update_hook_probe WHERE id = 1');

      expect(events).toEqual([
        { operation: 'insert', table: 'update_hook_probe', rowid: 1 },
        { operation: 'update', table: 'update_hook_probe', rowid: 1 },
        { operation: 'delete', table: 'update_hook_probe', rowid: 1 },
      ]);
    } finally {
      db.close();
    }
  });

  it('proves updateHook alone cannot read a deleted row payload', async () => {
    const SQL = await initSqlJs({
      locateFile: (file) => path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
    });
    const db = new SQL.Database();
    const deletedRows: unknown[] = [];

    try {
      db.run('CREATE TABLE delete_hook_probe (id INTEGER PRIMARY KEY, value TEXT)');
      db.run('INSERT INTO delete_hook_probe (id, value) VALUES (7, ?)', ['before-delete']);
      db.updateHook((operation, _database, table, rowid) => {
        if (operation !== 'delete' || table !== 'delete_hook_probe') {
          return;
        }
        const stmt = db.prepare('SELECT id, value FROM delete_hook_probe WHERE rowid = ?');
        try {
          stmt.bind([rowid]);
          if (stmt.step()) {
            deletedRows.push(stmt.getAsObject());
          }
        } finally {
          stmt.free();
        }
      });
      db.run('DELETE FROM delete_hook_probe WHERE id = 7');

      expect(deletedRows).toEqual([]);
    } finally {
      db.close();
    }
  });
});
