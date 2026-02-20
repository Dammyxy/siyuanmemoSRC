/**
 * CardRepository - 卡片仓储实现
 * 
 * @module CardRepository
 * @description
 * 实现 ICardRepository 接口，提供卡片的持久化功能。
 * 
 * **职责**：
 * 1. 将领域操作转换为存储操作
 * 2. 使用 Mapper 进行模型转换
 * 3. 委托给 UnifiedStorageManager 进行实际存储
 * 
 * **设计模式**：
 * - Repository 模式：封装持久化逻辑
 * - Adapter 模式：适配 UnifiedStorageManager
 * 
 * @see ICardRepository - 仓储接口
 * @see Card - 领域实体
 * @see UnifiedStorageManager - 存储管理器
 */

import type { ICardRepository } from '../../domain/repositories/ICardRepository';
import type { Card } from '../../domain/entities/Card';
import type { CardType } from '../../types/card';
import type { Result } from '../../types/result';
import { ok, err, isErr } from '../../types/result';
import { CardMapper } from './mappers/CardMapper';
import type { UnifiedStorageManager } from '../../core/storage/UnifiedStorageManager';

/**
 * 卡片仓储实现
 */
export class CardRepository implements ICardRepository {
  constructor(private readonly storage: UnifiedStorageManager) {}

  // ==================== CRUD 操作 ====================

  async save(card: Card): Promise<Result<void>> {
    try {
      // 1. Entity → DTO
      const dto = CardMapper.fromEntity(card);
      
      // 2. 保存 DTO
      // 注意：这里需要 UnifiedStorageManager 支持 DTO 操作
      // 暂时使用 FSRSCard 接口（向后兼容）
      const fsrsCard = CardMapper.toDomain(dto);
      
      // 3. 检查是否存在
      const existing = this.storage.getCard(card.id.value);
      if (existing) {
        await this.storage.updateCard(fsrsCard);
      } else {
        // 需要 Xiuyuan 信息
        if (card.isXiuyuanCard()) {
          const xiuyuanMetadata = card.xiuyuanMetadata!;
          const xiuyuan = {
            id: xiuyuanMetadata.xiuyuanID,
            blockIDs: [card.blockId.value],
            fields: [],
            templateID: xiuyuanMetadata.templateID,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          };
          await this.storage.createCard(xiuyuan, fsrsCard);
        } else {
          // 普通卡片，创建空 Xiuyuan
          const xiuyuan = {
            id: `xy_${card.id.value}`,
            blockIDs: [card.blockId.value],
            fields: [],
            templateID: 'builtin-quick-card',
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          };
          await this.storage.createCard(xiuyuan, fsrsCard);
        }
      }
      
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async saveBatch(cards: Card[]): Promise<Result<void>> {
    try {
      for (const card of cards) {
        const result = await this.save(card);
        if (!result.ok) {
          return result;
        }
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(id: string): Promise<Result<Card | null>> {
    try {
      const fsrsCard = this.storage.getCard(id);
      if (!fsrsCard) {
        return ok(null);
      }
      
      // FSRSCard → DTO → Entity
      const dto = CardMapper.toPersistence(fsrsCard);
      const entityResult = CardMapper.toEntity(dto);
      
      if (isErr(entityResult)) {
        return err(entityResult.error);
      }
      
      return ok(entityResult.value);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByBlockId(blockId: string): Promise<Result<Card[]>> {
    try {
      const fsrsCards = this.storage.getCardsByBlockId(blockId);
      const cards: Card[] = [];
      
      for (const fsrsCard of fsrsCards) {
        const dto = CardMapper.toPersistence(fsrsCard);
        const entityResult = CardMapper.toEntity(dto);
        if (!isErr(entityResult)) {
          cards.push(entityResult.value);
        }
      }
      
      return ok(cards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByXiuyuanId(xiuyuanId: string): Promise<Result<Card[]>> {
    try {
      const fsrsCards = this.storage.getCardsByXiuyuanId(xiuyuanId);
      const cards: Card[] = [];
      
      for (const fsrsCard of fsrsCards) {
        const dto = CardMapper.toPersistence(fsrsCard);
        const entityResult = CardMapper.toEntity(dto);
        if (!isErr(entityResult)) {
          cards.push(entityResult.value);
        }
      }
      
      return ok(cards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findByType(type: CardType): Promise<Result<Card[]>> {
    try {
      const fsrsCards = this.storage.getCardsByType(type);
      const cards: Card[] = [];
      
      for (const fsrsCard of fsrsCards) {
        const dto = CardMapper.toPersistence(fsrsCard);
        const entityResult = CardMapper.toEntity(dto);
        if (!isErr(entityResult)) {
          cards.push(entityResult.value);
        }
      }
      
      return ok(cards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findAll(): Promise<Result<Card[]>> {
    try {
      const fsrsCards = this.storage.getAllCards();
      const cards: Card[] = [];
      
      for (const fsrsCard of fsrsCards) {
        const dto = CardMapper.toPersistence(fsrsCard);
        const entityResult = CardMapper.toEntity(dto);
        if (!isErr(entityResult)) {
          cards.push(entityResult.value);
        }
      }
      
      return ok(cards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async delete(id: string): Promise<Result<void>> {
    try {
      return await this.storage.deleteCard(id);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async deleteBatch(ids: string[]): Promise<Result<void>> {
    try {
      for (const id of ids) {
        const result = await this.delete(id);
        if (!result.ok) {
          return result;
        }
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==================== 查询方法 ====================

  async findDueCards(limit: number): Promise<Result<Card[]>> {
    try {
      const fsrsCards = this.storage.getDueCards(limit);
      const cards: Card[] = [];
      
      for (const fsrsCard of fsrsCards) {
        const dto = CardMapper.toPersistence(fsrsCard);
        const entityResult = CardMapper.toEntity(dto);
        if (!isErr(entityResult)) {
          cards.push(entityResult.value);
        }
      }
      
      return ok(cards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findNewCards(limit: number): Promise<Result<Card[]>> {
    try {
      const allCards = await this.findAll();
      if (!allCards.ok) {
        return allCards;
      }
      
      const newCards = allCards.value
        .filter(card => card.isNew())
        .slice(0, limit);
      
      return ok(newCards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findLearningCards(): Promise<Result<Card[]>> {
    try {
      const allCards = await this.findAll();
      if (!allCards.ok) {
        return allCards;
      }
      
      const learningCards = allCards.value.filter(card => card.isLearning());
      return ok(learningCards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findReviewCards(): Promise<Result<Card[]>> {
    try {
      const allCards = await this.findAll();
      if (!allCards.ok) {
        return allCards;
      }
      
      const reviewCards = allCards.value.filter(card => card.isReview());
      return ok(reviewCards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findLeechCards(): Promise<Result<Card[]>> {
    try {
      const allCards = await this.findAll();
      if (!allCards.ok) {
        return allCards;
      }
      
      const leechCards = allCards.value.filter(card => card.isLeech);
      return ok(leechCards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findSkippedCards(): Promise<Result<Card[]>> {
    try {
      const allCards = await this.findAll();
      if (!allCards.ok) {
        return allCards;
      }
      
      const skippedCards = allCards.value.filter(card => card.skipped);
      return ok(skippedCards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async exists(id: string): Promise<Result<boolean>> {
    try {
      const card = this.storage.getCard(id);
      return ok(card !== undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async count(): Promise<Result<number>> {
    try {
      const stats = this.storage.getStats();
      return ok(stats.totalCards);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async countByType(): Promise<Result<Record<CardType, number>>> {
    try {
      const stats = this.storage.getStats();
      return ok(stats.cardsByType);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==================== 持久化控制 ====================

  async flush(): Promise<Result<void>> {
    try {
      return await this.storage.save();
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async reload(): Promise<Result<void>> {
    try {
      return await this.storage.load();
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
