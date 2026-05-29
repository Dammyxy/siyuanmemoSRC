import { stringifyJson, parseJson } from './json';
import type { SqliteDatabaseService } from './SqliteDatabaseService';
import { stripTransientSchedulingPreviewFields } from '@/core/scheduler/schedulingStateCleanliness';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJson(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function isQueueStateJsonEqual(storedJson: string, nextValue: unknown, nextJson: string): boolean {
  if (storedJson === nextJson) {
    return true;
  }
  return stableJson(parseJson(storedJson, null)) === stableJson(nextValue);
}

export class SqlQueueStateRepository {
  constructor(private readonly database: SqliteDatabaseService) {}

  loadAll(): Record<string, unknown> {
    const rows = this.database.getAll<{ key: string; value_json: string }>(
      'SELECT key, value_json FROM queue_state ORDER BY key',
    );
    return Object.fromEntries(rows.map((row) => [
      row.key,
      stripTransientSchedulingPreviewFields(parseJson(row.value_json, null)).value,
    ]));
  }

  set(key: string, value: unknown): void {
    const cleanValue = stripTransientSchedulingPreviewFields(value).value;
    const valueJson = stringifyJson(cleanValue);
    const existing = this.database.getOne<{ value_json: string }>(
      'SELECT value_json FROM queue_state WHERE key = ?',
      [key],
    );
    if (existing && isQueueStateJsonEqual(existing.value_json, cleanValue, valueJson)) {
      return;
    }
    this.database.run(
      'INSERT OR REPLACE INTO queue_state (key, value_json, updated_at) VALUES (?, ?, ?)',
      [key, valueJson, Date.now()],
    );
  }

  delete(key: string): void {
    const existing = this.database.getOne<{ key: string }>(
      'SELECT key FROM queue_state WHERE key = ?',
      [key],
    );
    if (!existing) {
      return;
    }
    this.database.run('DELETE FROM queue_state WHERE key = ?', [key]);
  }

  replaceAll(values: Record<string, unknown>): void {
    const current = this.loadAll();
    const nextEntries = Object.entries(values).map(([key, value]) => [
      key,
      stripTransientSchedulingPreviewFields(value).value,
    ] as const);
    if (
      Object.keys(current).length === nextEntries.length
      && nextEntries.every(([key, value]) => stableJson(current[key]) === stableJson(value))
    ) {
      return;
    }

    this.database.run('DELETE FROM queue_state');
    for (const [key, value] of nextEntries) {
      this.set(key, value);
    }
  }

  async persist(): Promise<void> {
    await this.database.persist('queue-state.repository.persist');
  }
}
