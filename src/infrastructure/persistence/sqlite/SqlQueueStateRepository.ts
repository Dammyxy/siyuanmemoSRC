import { stringifyJson, parseJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';

export class SqlQueueStateRepository {
  constructor(private readonly database: SqliteDatabaseService) {}

  loadAll(): Record<string, unknown> {
    const rows = this.database.getAll<{ key: string; value_json: string }>(
      'SELECT key, value_json FROM queue_state ORDER BY key',
    );
    return Object.fromEntries(rows.map((row) => [row.key, parseJson(row.value_json, null)]));
  }

  set(key: string, value: unknown): void {
    this.database.run(
      'INSERT OR REPLACE INTO queue_state (key, value_json, updated_at) VALUES (?, ?, ?)',
      [key, stringifyJson(value), Date.now()],
    );
  }

  delete(key: string): void {
    this.database.run('DELETE FROM queue_state WHERE key = ?', [key]);
  }

  replaceAll(values: Record<string, unknown>): void {
    this.database.run('DELETE FROM queue_state');
    for (const [key, value] of Object.entries(values)) {
      this.set(key, value);
    }
  }

  async persist(): Promise<void> {
    await this.database.persist();
  }
}
