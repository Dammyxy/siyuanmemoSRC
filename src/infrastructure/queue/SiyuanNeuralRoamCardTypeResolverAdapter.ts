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
  private fsrsCardsAvailable: boolean | null = null;

  async resolveCardType(blockId: string): Promise<'item' | 'topic'> {
    if (this.fsrsCardsAvailable === false) {
      return 'topic';
    }

    const escapedId = this.escapeSQL(blockId);
    try {
      const rows = (await sql(`
        SELECT type, card_type_marker
        FROM fsrs_cards
        WHERE block_id = '${escapedId}'
      `)) as LocalCardRow[] | null | undefined;
      this.fsrsCardsAvailable = true;

      if (rows && rows.length > 0) {
        if (rows.some(resolveTopicLikeType)) {
          return 'topic';
        }
        return 'item';
      }
    } catch (error) {
      if (this.isFsrsCardsUnavailableError(error)) {
        this.fsrsCardsAvailable = false;
      }
      return 'topic';
    }

    return 'topic';
  }

  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }

  private isFsrsCardsUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();
    return (normalized.includes('no such table') && normalized.includes('fsrs_cards'))
      || (normalized.includes('syntax error') && (
        normalized.includes('near "limit"') || normalized.includes("near 'limit'")
      ));
  }
}
