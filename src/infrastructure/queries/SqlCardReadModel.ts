import type { ICardReadModel } from '@/application/queries/card/ICardReadModel';
import type { SqlUnifiedStorageRepository } from '@/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository';
import type { FSRSCard } from '@/types/card';
import type { StructuredCardQuery } from '@/types/card-query';

export class SqlCardReadModel implements ICardReadModel {
  constructor(private readonly repository: SqlUnifiedStorageRepository) {}

  getAllCards(): FSRSCard[] {
    return this.repository.getAllCards();
  }

  queryCards(query?: StructuredCardQuery): FSRSCard[] {
    return this.repository.queryCards(query);
  }

  getDueCards(limit = 100): FSRSCard[] {
    return this.repository.getDueCards(limit);
  }

  getCard(cardId: string): FSRSCard | undefined {
    return this.repository.getCard(cardId);
  }

  getCardByBlockId(blockId: string): FSRSCard | undefined {
    return this.repository.getCardByBlockId(blockId);
  }

  getCardsByBlockId(blockId: string): FSRSCard[] {
    return this.repository.getCardsByBlockId(blockId);
  }
}
