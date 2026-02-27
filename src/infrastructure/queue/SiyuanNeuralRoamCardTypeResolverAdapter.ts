import { sql } from '@/infrastructure/siyuan/api';
import type { NeuralRoamCardTypeResolverPort } from '@/core/queue/domain/ports';

type AttributeRow = {
  name?: unknown;
  value?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export class SiyuanNeuralRoamCardTypeResolverAdapter implements NeuralRoamCardTypeResolverPort {
  async resolveCardType(blockId: string): Promise<'item' | 'topic'> {
    const escapedId = this.escapeSQL(blockId);
    const stmt = `
      SELECT name, value
      FROM attributes
      WHERE block_id = '${escapedId}'
        AND name IN (
          'custom-fsrs-card-id',
          'custom-xiuyuan-id',
          'custom-fsrs-xiuyuan-id',
          'custom-fsrs-card-type'
        )
    `;

    const rows = (await sql(stmt)) as AttributeRow[] | null | undefined;
    if (!rows || rows.length === 0) {
      return 'topic';
    }

    const attrMap = new Map<string, string>();
    for (const row of rows) {
      if (typeof row?.name !== 'string') {
        continue;
      }
      attrMap.set(row.name, typeof row.value === 'string' ? row.value : '');
    }

    const cardType = attrMap.get('custom-fsrs-card-type');
    if (cardType === 'concept' || cardType === 'topic') {
      return 'topic';
    }
    if (cardType === 'item' || cardType === 'descriptor' || cardType === 'cloze') {
      return 'item';
    }

    if (
      isNonEmptyString(attrMap.get('custom-fsrs-card-id')) ||
      isNonEmptyString(attrMap.get('custom-xiuyuan-id')) ||
      isNonEmptyString(attrMap.get('custom-fsrs-xiuyuan-id'))
    ) {
      return 'item';
    }

    return 'topic';
  }

  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }
}

