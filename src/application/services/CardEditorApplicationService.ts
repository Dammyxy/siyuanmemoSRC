import type { ReviewSiyuanPort } from '@/application/ports/ReviewSiyuanPort';
import type { RescheduleOptions, ReviewApplicationService } from '@/application/services/ReviewApplicationService';
import type { IUnifiedDataSourceManagerFacade } from '@/types/unified-data-source';
import { CardState, type FSRSCard } from '@/types/card';
import { createLogger } from '@/utils/logger';
import {
  applyCardTypeTransition,
  type CardTypeTransitionOptions,
  type EditableCardType,
} from './card-editor/applyCardTypeTransition';
import {
  applyRenderTargetTransition,
  type EditableRenderTarget,
} from './card-editor/applyRenderTargetTransition';

const logger = createLogger('CardEditorApplicationService');

export interface CardEditorBlockInfo {
  createdAt: number | null;
  updatedAt: number | null;
}

export interface CardEditorSnapshot {
  card: FSRSCard;
  blockInfo: CardEditorBlockInfo;
}

export class CardEditorApplicationService {
  constructor(
    private readonly manager: IUnifiedDataSourceManagerFacade,
    private readonly reviewService: ReviewApplicationService,
    private readonly siyuanApi: ReviewSiyuanPort = reviewService.getSiyuanApi(),
  ) {}

  async loadSnapshot(blockId: string, preferredCardId?: string): Promise<CardEditorSnapshot> {
    const card = await this.loadCardByReference(blockId, preferredCardId);
    return this.createSnapshot(card);
  }

  async updatePriority(cardId: string, priority: number): Promise<CardEditorSnapshot> {
    const card = await this.manager.getCard(cardId);
    const normalizedPriority = Math.max(0, Math.min(100, Math.floor(Number(priority) || 0)));
    const nextCard: FSRSCard = {
      ...card,
      priority: normalizedPriority,
      updatedAt: Date.now(),
    };

    await this.manager.updateCard(nextCard);
    return this.createSnapshot(nextCard);
  }

  async updateCardType(
    cardId: string,
    targetType: EditableCardType,
    options?: CardTypeTransitionOptions,
  ): Promise<CardEditorSnapshot> {
    const card = await this.manager.getCard(cardId);
    const transition = applyCardTypeTransition(card, targetType, options);
    const nextCard = transition.changed ? transition.card : card;

    if (transition.changed) {
      await this.manager.updateCard(nextCard);
    }

    return this.createSnapshot(nextCard);
  }

  async updateRender(cardId: string, targetRender: EditableRenderTarget): Promise<CardEditorSnapshot> {
    const card = await this.manager.getCard(cardId);
    const transition = applyRenderTargetTransition(card, targetRender);
    const nextCard = transition.changed ? transition.card : card;

    if (transition.changed) {
      await this.manager.updateCard(nextCard);
    }

    return this.createSnapshot(nextCard);
  }

  async resetProgress(cardId: string): Promise<CardEditorSnapshot> {
    const card = await this.manager.getCard(cardId);
    const now = Date.now();
    const nextCard: FSRSCard = {
      ...card,
      state: CardState.New,
      due: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      lastReview: 0,
      learning_step: 0,
      leechCount: 0,
      isLeech: false,
      postponeCount: 0,
      lastPostponeDate: undefined,
      rescheduleHistory: undefined,
      updatedAt: now,
    };

    await this.manager.updateCard(nextCard);
    return this.createSnapshot(nextCard);
  }

  async scheduleCard(cardId: string, options: RescheduleOptions): Promise<CardEditorSnapshot> {
    const card = await this.reviewService.rescheduleCard(cardId, options);
    return this.createSnapshot(card);
  }

  private async loadCardByReference(blockId: string, preferredCardId?: string): Promise<FSRSCard> {
    const normalizedPreferredCardId = String(preferredCardId || '').trim();
    if (normalizedPreferredCardId) {
      try {
        const preferredCard = await this.manager.getCard(normalizedPreferredCardId, { silent: true });
        if (preferredCard?.blockId === blockId) {
          return preferredCard;
        }

        logger.warn('Preferred card does not belong to requested block, falling back to block lookup', {
          blockId,
          preferredCardId: normalizedPreferredCardId,
          resolvedBlockId: preferredCard?.blockId,
        });
      } catch (error) {
        logger.warn('Preferred card lookup failed, falling back to block lookup', {
          blockId,
          preferredCardId: normalizedPreferredCardId,
          error,
        });
      }
    }

    const cards = await this.manager.getCards({
      blockIds: [blockId],
    });
    const preferredCard = normalizedPreferredCardId
      ? cards.find((item) => item.id === normalizedPreferredCardId)
      : undefined;
    const card = preferredCard ?? cards.find((item) => item.blockId === blockId) ?? cards[0];

    if (!card) {
      throw new Error(`Card not found for block: ${blockId}`);
    }

    return card;
  }

  private async createSnapshot(card: FSRSCard): Promise<CardEditorSnapshot> {
    return {
      card,
      blockInfo: await this.loadBlockInfo(card.blockId),
    };
  }

  private async loadBlockInfo(blockId: string): Promise<CardEditorBlockInfo> {
    try {
      const info = await this.siyuanApi.getBlockInfo(blockId);
      const createdAt = this.resolveTimestamp([
        info?.created_time,
        info?.created,
        info?.createdAt,
        info?.created_at,
      ]);
      const updatedAt = this.resolveTimestamp([
        info?.last_edited_time,
        info?.updated,
        info?.updatedAt,
        info?.updated_at,
      ]);

      return {
        createdAt,
        updatedAt: updatedAt ?? createdAt,
      };
    } catch (error) {
      logger.warn('Failed to load block info for card editor snapshot', { blockId, error });
      return {
        createdAt: null,
        updatedAt: null,
      };
    }
  }

  private resolveTimestamp(candidates: unknown[]): number | null {
    for (const candidate of candidates) {
      const parsed = this.parseTimestamp(candidate);
      if (parsed != null) {
        return parsed;
      }
    }
    return null;
  }

  private parseTimestamp(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 1e12) {
        return value;
      }
      if (value > 1e9) {
        return value * 1000;
      }
      return value;
    }

    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }

    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) {
        return null;
      }

      if (/^\d{14}$/.test(raw)) {
        const date = new Date(
          Number(raw.slice(0, 4)),
          Number(raw.slice(4, 6)) - 1,
          Number(raw.slice(6, 8)),
          Number(raw.slice(8, 10)),
          Number(raw.slice(10, 12)),
          Number(raw.slice(12, 14)),
        );
        const timestamp = date.getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
      }

      if (/^\d{13}$/.test(raw)) {
        return Number(raw);
      }

      if (/^\d{10}$/.test(raw)) {
        return Number(raw) * 1000;
      }

      const direct = new Date(raw);
      if (!Number.isNaN(direct.getTime())) {
        return direct.getTime();
      }

      const normalized = new Date(raw.replace(/-/g, '/'));
      if (!Number.isNaN(normalized.getTime())) {
        return normalized.getTime();
      }
    }

    return null;
  }
}
