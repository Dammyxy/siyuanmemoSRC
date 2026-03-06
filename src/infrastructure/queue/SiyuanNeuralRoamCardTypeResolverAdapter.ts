import { sql } from '@/infrastructure/siyuan/api';
import type { NeuralRoamCardTypeResolverPort } from '@/core/queue/domain/ports';

type LocalCardRow = {
  type?: unknown;
  card_type_marker?: unknown;
};

function resolveTopicLikeType(row: LocalCardRow): boolean {
  return row.type === 'topic' || row.type === 'concept' || row.card_type_marker === 'concept';
}

export class SiyuanNeuralRoamCardTypeResolverAdapter implements NeuralRoamCardTypeResolverPort {
  async resolveCardType(blockId: string): Promise<'item' | 'topic'> {
    const escapedId = this.escapeSQL(blockId);
    try {
      const rows = (await sql(`
        SELECT type, card_type_marker
        FROM fsrs_cards
        WHERE block_id = '${escapedId}'
        LIMIT 5
      `)) as LocalCardRow[] | null | undefined;

      if (rows && rows.length > 0) {
        if (rows.some(resolveTopicLikeType)) {
          return 'topic';
        }
        return 'item';
      }
    } catch {
      return 'topic';
    }

    return 'topic';
  }

  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }
}
