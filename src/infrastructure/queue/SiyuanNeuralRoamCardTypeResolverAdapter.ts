import { sql } from '@/infrastructure/siyuan/api';
import type { NeuralRoamCardTypeResolverPort } from '@/core/queue/domain/ports';

export class SiyuanNeuralRoamCardTypeResolverAdapter implements NeuralRoamCardTypeResolverPort {
  async resolveCardType(blockId: string): Promise<'item' | 'topic'> {
    const stmt = `
      SELECT value
      FROM attributes
      WHERE block_id = '${this.escapeSQL(blockId)}'
        AND name = 'custom-card-id'
      LIMIT 1
    `;

    const rows = await sql(stmt);
    if (rows && rows.length > 0 && rows[0]?.value) {
      return 'item';
    }

    return 'topic';
  }

  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }
}
