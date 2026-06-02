import type { BrowserAdvancedSqlQuerySourcePort } from '@/application/ports/BrowserAdvancedSqlQuerySourcePort';
import type { QuerySiyuanPort } from '@/application/ports/QuerySiyuanPort';

export class BrowserAdvancedSqlQuerySourceSiyuanAdapter implements BrowserAdvancedSqlQuerySourcePort {
  constructor(private readonly siyuanApi: Pick<QuerySiyuanPort, 'sql'>) {}

  async matchedIds(statement: string): Promise<string[]> {
    const rows = await this.siyuanApi.sql(statement);
    return extractBrowserAdvancedSqlResultIds(rows);
  }
}

export function extractBrowserAdvancedSqlResultIds(rows: unknown[]): string[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = extractBrowserAdvancedSqlResultId(row);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function extractBrowserAdvancedSqlResultId(row: unknown): string {
  if (!row || typeof row !== 'object') {
    return '';
  }
  const record = row as Record<string, unknown>;
  const raw = record.card_id
    ?? record.cardId
    ?? record.fsrs_card_id
    ?? record.fsrsCardId
    ?? record.id
    ?? record.block_id
    ?? record.blockId;
  return String(raw || '').trim();
}
