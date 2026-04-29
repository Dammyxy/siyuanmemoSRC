import type { EventHandler } from '@/core/shared/domain/events/EventBus';
import type { CardCreatedEvent, CardDeletedEvent } from '@/core/xiuyuan/domain/events';
import type { CardsDeletedEvent } from '@/core/xiuyuan/domain/events/CardsDeletedEvent';
import type { CardApplicationService } from '@/application/services/CardApplicationService';
import { UnifiedDataSourceManager } from '@/application/services/UnifiedDataSourceManager';
import { DocTreeReviewScopeService } from '@/application/services/DocTreeReviewScopeService';
import type { ManagerSiyuanPort } from '@/application/ports/ManagerSiyuanPort';
import type { EventBus } from '@/core/shared/domain/events/EventBus';
import type { FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ReviewScopeCardCreationSyncService');

interface BlockRootRow extends Record<string, unknown> {
  id?: string;
  root_id?: string;
  type?: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(values: readonly unknown[] | undefined): string[] {
  return Array.from(new Set(
    (values ?? [])
      .map((value) => asString(value))
      .filter((value) => value.length > 0)
  ));
}

export class ReviewScopeCardCreationSyncService {
  private readonly handleCardCreated: EventHandler<CardCreatedEvent>;
  private readonly handleCardDeleted: EventHandler<CardDeletedEvent>;
  private readonly handleCardsDeleted: EventHandler<CardsDeletedEvent>;
  private disposed = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly cardService: CardApplicationService,
    private readonly unifiedDataSourceManager: UnifiedDataSourceManager,
    private readonly docTreeReviewScopeService: DocTreeReviewScopeService,
    ports: { siyuanApi: ManagerSiyuanPort },
  ) {
    this.siyuanApi = ports.siyuanApi;
    this.handleCardCreated = async (event) => {
      await this.syncCreatedCard(event);
    };
    this.handleCardDeleted = async (event) => {
      await this.syncDeletedCard(event);
    };
    this.handleCardsDeleted = async (event) => {
      await this.syncDeletedCards(event);
    };

    this.eventBus.subscribe('CardCreated', this.handleCardCreated);
    this.eventBus.subscribe('CardDeleted', this.handleCardDeleted);
    this.eventBus.subscribe('CardsDeleted', this.handleCardsDeleted);
  }

  private readonly siyuanApi: ManagerSiyuanPort;

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.eventBus.unsubscribe('CardCreated', this.handleCardCreated);
    this.eventBus.unsubscribe('CardDeleted', this.handleCardDeleted);
    this.eventBus.unsubscribe('CardsDeleted', this.handleCardsDeleted);
  }

  private async syncCreatedCard(event: CardCreatedEvent): Promise<void> {
    const cardId = asString(event.cardId);
    if (!cardId) {
      return;
    }

    try {
      const result = await this.cardService.getCard({ cardId });
      const persistedCard = result.card;
      if (!persistedCard) {
        logger.warn('[ReviewScopeCardCreationSyncService] Created card not found after event:', { cardId });
        return;
      }

      const syncedCard = await this.ensureCardRootId(persistedCard);
      const rootId = this.extractCardRootId(syncedCard);
      if (rootId) {
        this.docTreeReviewScopeService.registerCardRootId(syncedCard.blockId, rootId);
      }

      await this.unifiedDataSourceManager.onCardCreated(syncedCard);
    } catch (error) {
      logger.error('[ReviewScopeCardCreationSyncService] Failed to sync created card into review scope:', {
        cardId,
        error,
      });
    }
  }

  private async syncDeletedCard(event: CardDeletedEvent): Promise<void> {
    const cardId = asString(event.cardId);
    const blockId = asString(event.blockId);
    if (!cardId && !blockId) {
      return;
    }

    try {
      await this.unifiedDataSourceManager.onCardsDeleted(
        cardId ? [cardId] : [],
        blockId ? [blockId] : [],
      );
    } catch (error) {
      logger.error('[ReviewScopeCardCreationSyncService] Failed to sync deleted card into review scope:', {
        cardId,
        blockId,
        error,
      });
    }
  }

  private async syncDeletedCards(event: CardsDeletedEvent): Promise<void> {
    const cardIds = asStringArray(event.cardIds);
    const blockIds = asStringArray(event.blockIds);
    if (cardIds.length === 0 && blockIds.length === 0) {
      return;
    }

    try {
      await this.unifiedDataSourceManager.onCardsDeleted(cardIds, blockIds);
    } catch (error) {
      logger.error('[ReviewScopeCardCreationSyncService] Failed to sync deleted cards into review scope:', {
        cardIds,
        blockIds,
        error,
      });
    }
  }

  private async ensureCardRootId(card: FSRSCard): Promise<FSRSCard> {
    const existingRootId = this.extractCardRootId(card);
    if (existingRootId) {
      return card;
    }

    const resolvedRootId = await this.resolveRootId(card.blockId);
    if (!resolvedRootId) {
      return card;
    }

    const nextCard: FSRSCard = {
      ...card,
      meta: {
        ...(card.meta || {}),
        rootId: resolvedRootId,
      },
    };

    const updateResult = await this.cardService.batchUpdateCardsWithoutEvents([nextCard]);
    if (!updateResult.ok) {
      logger.warn('[ReviewScopeCardCreationSyncService] Failed to persist resolved rootId for created card:', {
        cardId: card.id,
        blockId: card.blockId,
        rootId: resolvedRootId,
        error: updateResult.error,
      });
      return card;
    }

    if (updateResult.value.failedCount > 0 || updateResult.value.updatedCount === 0) {
      logger.warn('[ReviewScopeCardCreationSyncService] Created card rootId persistence was incomplete:', {
        cardId: card.id,
        blockId: card.blockId,
        rootId: resolvedRootId,
        result: updateResult.value,
      });
      return card;
    }

    return nextCard;
  }

  private async resolveRootId(blockId: string): Promise<string> {
    const normalizedBlockId = asString(blockId);
    if (!normalizedBlockId) {
      return '';
    }

    try {
      const rows = await this.siyuanApi.sql<BlockRootRow>(`
        SELECT id, root_id, type
        FROM blocks
        WHERE id = '${this.escapeSql(normalizedBlockId)}'
        LIMIT 1
      `);

      const row = rows[0];
      if (!row) {
        return '';
      }

      const rowType = asString(row.type);
      if (rowType === 'd') {
        return asString(row.id) || normalizedBlockId;
      }

      return asString(row.root_id);
    } catch (error) {
      logger.warn('[ReviewScopeCardCreationSyncService] Failed to resolve rootId for created card:', {
        blockId: normalizedBlockId,
        error,
      });
      return '';
    }
  }

  private extractCardRootId(card: FSRSCard): string {
    const meta = card.meta as Record<string, unknown> | null | undefined;
    if (!meta) {
      return '';
    }
    return asString(meta.rootId ?? meta.rootID ?? meta.root_id);
  }

  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }
}
