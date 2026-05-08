/**
 * CardCreationHelper - 卡片创建辅助类
 * 
 * @description
 * 提供便捷的卡片创建方法，封装常见的卡片创建场景。
 * 每个方法内部构造 CreateCardCommand 并调用 CardApplicationService。
 * 
 * **设计原则**：
 * - 便捷性：简化常见卡片创建场景的 API
 * - 封装性：隐藏 CreateCardCommand 的构造细节
 * - 一致性：所有卡片创建都通过 CardApplicationService
 * 
 * **职责**：
 * - 提供语义化的卡片创建方法
 * - 构造合适的 CreateCardCommand
 * - 委托给 CardApplicationService 执行
 * 
 * **使用场景**：
 * - AutoCardHandler：自动卡片创建
 * - BlockMenuHandler：块菜单卡片创建
 * - 其他需要快速创建特定类型卡片的场景
 */

import { Result } from '@/types/result';
import { Card } from '@/core/xiuyuan/domain/Card';
import { CardApplicationService } from '../services/CardApplicationService';
import { CreateCardCommand } from '../commands/card/CreateCardCommand';

/**
 * 卡片创建选项
 */
export interface CardCreationOptions {
  /** 优先级（0-100，默认 50） */
  priority?: number;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
  /** 卡片类型（可选，用于覆盖默认类型） */
  cardType?: 'item' | 'topic' | 'concept' | 'descriptor';
}

/**
 * 概念卡创建选项
 */
export interface ConceptCardOptions extends CardCreationOptions {
  /** 描述符块 ID（可选，用于概念-描述符对） */
  descriptorBlockId?: string;
  /** 是否使用 A-Factor 调度器（默认根据是否有描述符自动选择） */
  useAFactor?: boolean;
}

/**
 * 卡片创建辅助类
 */
export class CardCreationHelper {
  /**
   * 构造函数
   * 
   * @param cardService - 卡片应用服务
   */
  constructor(
    private readonly cardService: CardApplicationService
  ) {}

  /**
   * 创建概念卡
   * 
   * @description
   * 创建概念类型的卡片。支持单块概念卡和概念-描述符对。
   * 
   * **自动模板选择**：
   * - 有描述符块 → builtin-concept-descriptor
   * - 无描述符块 → builtin-concept-simple
   * 
   * **自动调度器选择**：
   * - 有描述符块 → FSRS v6（默认）
   * - 无描述符块 → A-Factor（默认）
   * - 可通过 useAFactor 选项覆盖
   * 
   * @param blockId - 概念块 ID
   * @param options - 创建选项
   * @returns Result<Card> - 成功返回创建的卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * // 创建单块概念卡（使用 A-Factor）
   * const result = await helper.createConceptCard('block-1');
   * 
   * // 创建概念-描述符对（使用 FSRS v6）
   * const result = await helper.createConceptCard('block-1', {
   *   descriptorBlockId: 'block-2',
   *   priority: 80
   * });
   * 
   * // 强制使用 A-Factor
   * const result = await helper.createConceptCard('block-1', {
   *   descriptorBlockId: 'block-2',
   *   useAFactor: true
   * });
   * ```
   */
  async createConceptCard(
    blockId: string,
    options: ConceptCardOptions = {}
  ): Promise<Result<Card>> {
    // 构造块 ID 列表
    const blockIds = options.descriptorBlockId
      ? [blockId, options.descriptorBlockId]
      : [blockId];

    // 确定调度器类型
    // 有描述符 → FSRS v6（默认），无描述符 → A-Factor（默认）
    // 可通过 useAFactor 选项覆盖
    let schedulerType: 'fsrs-v6' | 'a-factor-v2';
    if (options.useAFactor) {
      schedulerType = 'a-factor-v2';
    } else {
      schedulerType = options.descriptorBlockId ? 'fsrs-v6' : 'a-factor-v2';
    }

    // 构造命令
    const command: CreateCardCommand = {
      blockIds,
      cardType: 'concept',
      schedulerType,
      priority: options.priority ?? 50,
      metadata: {
        source: 'auto',
        ...options.metadata,
      },
    };

    // 调用服务创建卡片
    return this.cardService.createCard(command);
  }

  /**
   * 创建符号检测卡
   * 
   * @description
   * 创建符号检测类型的卡片（块内容包含 <> 符号）。
   * 自动使用 builtin-quick-card 模板（统一版）。
   * 
   * @param blockId - 块 ID
   * @param options - 创建选项
   * @returns Result<Card> - 成功返回创建的卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * // 创建符号检测卡
   * const result = await helper.createSymbolCard('block-1', {
   *   priority: 70
   * });
   * ```
   */
  async createSymbolCard(
    blockId: string,
    options: CardCreationOptions = {}
  ): Promise<Result<Card>> {
    // 构造命令
    const command: CreateCardCommand = {
      blockIds: [blockId],
      templateId: 'builtin-quick-card',  // 使用统一的快速卡片模板
      cardType: options.cardType || 'item',  // 🆕 支持从 options 传入 cardType
      priority: options.priority ?? 50,
      metadata: {
        source: 'symbol',
        symbolDetected: true,
        ...options.metadata,
      },
    };

    // 调用服务创建卡片
    return this.cardService.createCard(command);
  }

  /**
   * 创建快速卡片
   * 
   * @description
   * 创建快速卡片（单块 Item 卡）。
   * 自动使用 builtin-quick-card 模板。
   * 
   * @param blockId - 块 ID
   * @param options - 创建选项
   * @returns Result<Card> - 成功返回创建的卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * // 创建快速卡片
   * const result = await helper.createQuickCard('block-1', {
   *   priority: 60
   * });
   * ```
   */
  async createQuickCard(
    blockId: string,
    options: CardCreationOptions = {}
  ): Promise<Result<Card>> {
    // 构造命令
    const command: CreateCardCommand = {
      blockIds: [blockId],
      cardType: options.cardType || 'item',
      priority: options.priority ?? 50,
      metadata: {
        source: 'quick',
        ...options.metadata,
      },
    };

    // 调用服务创建卡片
    return this.cardService.createCard(command);
  }

  /**
   * 创建双向卡片
   * 
   * @description
   * 创建双向卡片（正向和反向两张卡片）。
   * 使用 builtin-bidirectional 模板，生成两张卡片。
   * 
   * **注意**：此方法返回第一张创建的卡片，但实际会生成两张卡片。
   * 如需获取所有卡片，可以通过 blockId 查询。
   * 
   * @param termBlockId - 术语块 ID
   * @param definitionBlockId - 定义块 ID
   * @param options - 创建选项
   * @returns Result<Card> - 成功返回第一张创建的卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * // 创建双向卡片
   * const result = await helper.createBidirectionalCard(
   *   'term-block',
   *   'definition-block',
   *   { priority: 75 }
   * );
   * 
   * if (result.ok) {
   *   console.log('Created bidirectional cards');
   *   // 可以通过 blockId 查询所有卡片
   *   const allCards = cardService.getCardByBlockId('term-block');
   * }
   * ```
   */
  async createBidirectionalCard(
    termBlockId: string,
    definitionBlockId: string,
    options: CardCreationOptions = {}
  ): Promise<Result<Card>> {
    // 构造命令
    const command: CreateCardCommand = {
      blockIds: [termBlockId, definitionBlockId],
      templateId: 'builtin-bidirectional',
      cardType: 'item',
      priority: options.priority ?? 50,
      metadata: {
        source: 'manual',
        ...options.metadata,
      },
    };

    // 调用服务创建卡片
    // 注意：builtin-bidirectional 模板会生成两张卡片（forward 和 reverse）
    // 但 createCard 只返回第一张卡片
    return this.cardService.createCard(command);
  }

  /**
   * 创建列表模版卡
   * 
   * @description
   * 创建列表模版卡（从父块的子列表项生成多张卡片）。
   * 使用 builtin-list-item 模板，为每个子列表项生成一张卡片。
   * 
   * **注意**：此方法返回第一张创建的卡片，但实际会生成 N 张卡片（N = 子列表项数量）。
   * 如需获取所有卡片，可以通过 blockId 查询。
   * 
   * @param parentBlockId - 父块 ID（包含列表项的块）
   * @param options - 创建选项
   * @returns Result<Card> - 成功返回第一张创建的卡片，失败返回错误
   * 
   * @example
   * ```typescript
   * // 创建列表模版卡
   * const result = await helper.createListTemplateCard('parent-block', {
   *   priority: 65
   * });
   * 
   * if (result.ok) {
   *   console.log('Created list template cards');
   *   // 可以通过 blockId 查询所有卡片
   *   const allCards = cardService.getCardByBlockId('parent-block');
   * }
   * ```
   */
  async createListTemplateCard(
    parentBlockId: string,
    options: CardCreationOptions = {}
  ): Promise<Result<Card>> {
    // 构造命令
    const command: CreateCardCommand = {
      blockIds: [parentBlockId],
      templateId: 'builtin-list-item',
      cardType: 'item',
      priority: options.priority ?? 50,
      metadata: {
        source: 'manual',
        ...options.metadata,
      },
    };

    // 调用服务创建卡片
    // 注意：builtin-list-item 模板会为每个子列表项生成一张卡片
    // 但 createCard 只返回第一张卡片
    return this.cardService.createCard(command);
  }
}
