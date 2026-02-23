/**
 * Xiuyuan - 修缘聚合根
 * 
 * @description
 * Xiuyuan 聚合根，管理卡片的生命周期和业务规则。
 * 
 * **设计原则**：
 * - 聚合根：管理 Card 实体的生命周期
 * - 业务不变性：至少一个 BlockId，至少一个 CardFace
 * - 领域事件：发布创建、删除等事件
 * - 使用值对象：XiuyuanId, BlockId, TemplateId, CardFace, Priority
 */

import { Result, ok, err } from '../../../types/result';
import { XiuyuanId } from './XiuyuanId';
import { BlockId } from './BlockId';
import { TemplateId } from './TemplateId';
import { CardFace } from './CardFace';
import { Priority } from './Priority';
import { Card } from './Card';
import { CardId } from './CardId';
import { 
  DomainEvent, 
  XiuyuanCreatedEvent, 
  CardCreatedEvent, 
  CardDeletedEvent 
} from './events';

export interface CreateXiuyuanProps {
  id?: XiuyuanId;
  blockIDs: BlockId[];
  templateID: TemplateId;
  faces: CardFace[];
  priority?: Priority;
  meta?: Record<string, unknown>;
}

export interface XiuyuanProps {
  id: XiuyuanId;
  blockIDs: BlockId[];
  templateID: TemplateId;
  faces: CardFace[];
  priority: Priority;
  cards: Map<CardId, Card>;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class Xiuyuan {
  private domainEvents: DomainEvent[] = [];

  private constructor(
    private readonly id: XiuyuanId,
    private blockIDs: BlockId[],
    private templateID: TemplateId,
    private faces: CardFace[],
    private priority: Priority,
    private cards: Map<CardId, Card>,
    private meta: Record<string, unknown>,
    private readonly createdAt: Date,
    private updatedAt: Date
  ) {}

  /**
   * 创建新的 Xiuyuan 聚合根
   * 
   * @param props - 创建属性
   * @returns Result<Xiuyuan> - 成功返回 Xiuyuan，失败返回错误
   */
  static create(props: CreateXiuyuanProps): Result<Xiuyuan> {
    // 验证：至少一个 BlockId
    if (!props.blockIDs || props.blockIDs.length === 0) {
      return err(new Error('Xiuyuan must have at least one BlockId'));
    }

    // 验证：至少一个 CardFace
    if (!props.faces || props.faces.length === 0) {
      return err(new Error('Xiuyuan must have at least one CardFace'));
    }

    // 生成 ID（如果未提供）
    let id: XiuyuanId;
    if (props.id) {
      id = props.id;
    } else {
      const idResult = XiuyuanId.create(`xiuyuan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      if (!idResult.ok) {
        return idResult as Result<Xiuyuan>;
      }
      id = idResult.value;
    }

    const now = new Date();
    const priority = props.priority || Priority.createDefault();
    const meta = props.meta || {};

    const xiuyuan = new Xiuyuan(
      id,
      props.blockIDs,
      props.templateID,
      props.faces,
      priority,
      new Map(),
      meta,
      now,
      now
    );

    // 发布领域事件
    xiuyuan.addDomainEvent(new XiuyuanCreatedEvent(
      xiuyuan.id.getValue(),
      xiuyuan.templateID.getValue(),
      xiuyuan.blockIDs.map(b => b.getValue())
    ));

    return ok(xiuyuan);
  }

  /**
   * 从持久化数据重建 Xiuyuan
   * 
   * @param props - Xiuyuan 属性
   * @returns Result<Xiuyuan> - 成功返回 Xiuyuan，失败返回错误
   */
  static reconstitute(props: XiuyuanProps): Result<Xiuyuan> {
    // 验证：至少一个 BlockId
    if (!props.blockIDs || props.blockIDs.length === 0) {
      return err(new Error('Xiuyuan must have at least one BlockId'));
    }

    // 验证：至少一个 CardFace
    if (!props.faces || props.faces.length === 0) {
      return err(new Error('Xiuyuan must have at least one CardFace'));
    }

    return ok(new Xiuyuan(
      props.id,
      props.blockIDs,
      props.templateID,
      props.faces,
      props.priority,
      props.cards,
      props.meta,
      props.createdAt,
      props.updatedAt
    ));
  }

  // === 卡片操作方法 ===

  /**
   * 创建卡片
   * 
   * @param faceIndex - 面索引
   * @param cardId - 卡片 ID（可选，如果不提供则自动生成）
   * @returns Result<Card> - 成功返回 Card，失败返回错误
   */
  createCard(faceIndex: number, cardId?: CardId): Result<Card> {
    // 验证：faceIndex 必须有效
    if (faceIndex < 0 || faceIndex >= this.faces.length) {
      return err(new Error(`Invalid faceIndex: ${faceIndex}. Must be between 0 and ${this.faces.length - 1}`));
    }

    // 生成卡片 ID（如果未提供）
    let id: CardId;
    if (cardId) {
      id = cardId;
    } else {
      const idResult = CardId.create(`card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      if (!idResult.ok) {
        return idResult as Result<Card>;
      }
      id = idResult.value;
    }

    // 创建卡片
    const cardResult = Card.createNew(id, this.id, faceIndex);
    if (!cardResult.ok) {
      return cardResult;
    }

    const card = cardResult.value;

    // 添加到卡片集合
    this.cards.set(card.getId(), card);

    // 更新时间戳
    this.updatedAt = new Date();

    // 发布领域事件
    this.addDomainEvent(new CardCreatedEvent(
      this.id.getValue(),
      card.getId().getValue(),
      faceIndex
    ));

    return ok(card);
  }

  /**
   * 添加已创建的卡片到 Xiuyuan
   * 
   * 用于将外部创建的 Card 实体添加到聚合根中。
   * 与 createCard() 不同，此方法接受已经创建好的 Card 实例。
   * 
   * @param card - 已创建的卡片实体
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  addCard(card: Card): Result<void> {
    // 验证：卡片必须属于当前 Xiuyuan
    if (!card.getXiuyuanId().equals(this.id)) {
      return err(new Error('Card does not belong to this Xiuyuan'));
    }

    // 🔧 修复：使用 equals() 方法检查卡片是否已存在
    for (const key of this.cards.keys()) {
      if (key.equals(card.getId())) {
        return err(new Error(`Card already exists: ${card.getId().getValue()}`));
      }
    }

    // 验证：faceIndex 必须有效
    const faceIndex = card.getFaceIndex();
    if (faceIndex < 0 || faceIndex >= this.faces.length) {
      return err(new Error(`Invalid faceIndex: ${faceIndex}. Must be between 0 and ${this.faces.length - 1}`));
    }

    // 添加到卡片集合
    this.cards.set(card.getId(), card);

    // 更新时间戳
    this.updatedAt = new Date();

    // 发布领域事件
    this.addDomainEvent(new CardCreatedEvent(
      this.id.getValue(),
      card.getId().getValue(),
      faceIndex
    ));

    return ok(undefined);
  }

  /**
   * 删除卡片
   * 
   * @param cardId - 卡片 ID
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  deleteCard(cardId: CardId): Result<void> {
    // 🔧 修复：使用 equals() 方法查找要删除的卡片
    let foundKey: CardId | null = null;
    for (const key of this.cards.keys()) {
      if (key.equals(cardId)) {
        foundKey = key;
        break;
      }
    }
    
    // 验证：卡片必须存在
    if (!foundKey) {
      return err(new Error(`Card not found: ${cardId.getValue()}`));
    }

    // 删除卡片
    this.cards.delete(foundKey);

    // 更新时间戳
    this.updatedAt = new Date();

    // 发布领域事件
    this.addDomainEvent(new CardDeletedEvent(
      this.id.getValue(),
      cardId.getValue()
    ));

    return ok(undefined);
  }

  /**
   * 更新卡片
   * 
   * @param cardId - 卡片 ID
   * @param updatedCard - 更新后的卡片
   * @returns Result<void> - 成功返回 void，失败返回错误
   */
  updateCard(cardId: CardId, updatedCard: Card): Result<void> {
    // 🔧 修复：使用 equals() 方法查找要更新的卡片
    let foundKey: CardId | null = null;
    for (const key of this.cards.keys()) {
      if (key.equals(cardId)) {
        foundKey = key;
        break;
      }
    }
    
    // 验证：卡片必须存在
    if (!foundKey) {
      return err(new Error(`Card not found: ${cardId.getValue()}`));
    }

    // 验证：卡片必须属于当前 Xiuyuan
    if (!updatedCard.getXiuyuanId().equals(this.id)) {
      return err(new Error('Card does not belong to this Xiuyuan'));
    }

    // 更新卡片（删除旧的，添加新的）
    this.cards.delete(foundKey);
    this.cards.set(updatedCard.getId(), updatedCard);

    // 更新时间戳
    this.updatedAt = new Date();

    return ok(undefined);
  }

  // === 查询方法 ===

  /**
   * 获取所有卡片
   */
  getCards(): Card[] {
    return Array.from(this.cards.values());
  }

  /**
   * 获取卡片
   * 
   * @param cardId - 卡片 ID
   * @returns Card | null
   */
  getCard(cardId: CardId): Card | null {
    // 🔧 修复：使用 equals() 方法比较值对象，而不是引用比较
    // Map.get() 使用引用相等（===），对于值对象需要遍历并使用 equals()
    for (const [key, card] of this.cards.entries()) {
      if (key.equals(cardId)) {
        return card;
      }
    }
    return null;
  }

  /**
   * 获取卡片数量
   */
  getCardCount(): number {
    return this.cards.size;
  }

  /**
   * 获取 ID
   */
  getId(): XiuyuanId {
    return this.id;
  }

  /**
   * 获取块 ID 列表
   */
  getBlockIDs(): BlockId[] {
    return [...this.blockIDs];
  }

  /**
   * 获取模板 ID
   */
  getTemplateID(): TemplateId {
    return this.templateID;
  }

  /**
   * 获取卡片面列表
   */
  getFaces(): CardFace[] {
    return [...this.faces];
  }

  /**
   * 获取优先级
   */
  getPriority(): Priority {
    return this.priority;
  }

  /**
   * 获取元数据
   */
  getMeta(): Record<string, unknown> {
    return { ...this.meta };
  }

  /**
   * 获取指定卡片面的正面块 ID 列表
   * 
   * 对于描述符模板，需要包含概念块 ID，以便渲染时能够获取概念信息
   * 
   * @param faceIndex 卡片面索引
   * @returns 正面块 ID 列表
   */
  getFrontBlockIDs(faceIndex: number): string[] {
    if (faceIndex < 0 || faceIndex >= this.faces.length) {
      return [];
    }

    const face = this.faces[faceIndex];
    const templateID = this.templateID.getValue();
    
    // 描述符模板需要包含概念块ID
    if (this.isDescriptorTemplate(templateID)) {
      const conceptId = (this.meta.fieldMapping as any)?.concept;
      return conceptId 
        ? [conceptId, face.questionBlockId].filter(Boolean)
        : [face.questionBlockId].filter(Boolean);
    }
    
    return [face.questionBlockId].filter(Boolean);
  }

  /**
   * 获取指定卡片面的背面块 ID 列表
   * 
   * @param faceIndex 卡片面索引
   * @returns 背面块 ID 列表
   */
  getBackBlockIDs(faceIndex: number): string[] {
    if (faceIndex < 0 || faceIndex >= this.faces.length) {
      return [];
    }

    const face = this.faces[faceIndex];
    return [face.answerBlockId].filter(Boolean);
  }

  /**
   * 判断是否为描述符模板
   * 
   * @param templateID 模板 ID
   * @returns 是否为描述符模板
   */
  private isDescriptorTemplate(templateID: string): boolean {
    return templateID === 'builtin-concept-descriptor' 
      || templateID === 'builtin-concept-descriptor-reverse'
      || templateID === 'builtin-concept-descriptor-both';
  }

  /**
   * 获取代表性块 ID
   * 
   * 对于描述符模板，返回描述符块 ID（第二个块）
   * 对于其他模板，返回第一个块 ID
   * 
   * @returns 代表性块 ID
   */
  getRepresentativeBlockId(): string {
    const templateID = this.templateID.getValue();
    
    if (this.isDescriptorTemplate(templateID) && this.blockIDs.length >= 2) {
      return this.blockIDs[1].getValue();  // 描述符块
    }
    
    return this.blockIDs[0]?.getValue() || '';
  }

  /**
   * 获取创建时间
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * 获取更新时间
   */
  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // === 领域事件管理 ===

  /**
   * 获取领域事件
   */
  getDomainEvents(): DomainEvent[] {
    return [...this.domainEvents];
  }

  /**
   * 清除领域事件
   */
  clearDomainEvents(): void {
    this.domainEvents = [];
  }

  /**
   * 添加领域事件
   */
  private addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  // === 业务方法 ===

  /**
   * 更新优先级
   * 
   * @param priority - 新的优先级
   * @returns Result<void>
   */
  updatePriority(priority: Priority): Result<void> {
    this.priority = priority;
    this.updatedAt = new Date();
    return ok(undefined);
  }

  /**
   * 更新元数据
   * 
   * @param meta - 新的元数据
   * @returns Result<void>
   */
  updateMeta(meta: Record<string, unknown>): Result<void> {
    this.meta = { ...this.meta, ...meta };
    this.updatedAt = new Date();
    return ok(undefined);
  }

  /**
   * 更新卡片类型标记
   * 
   * 用于同步时更新卡片的类型标记（concept/descriptor）
   * 
   * @param cardTypeMarker - 卡片类型标记
   * @returns Result<void>
   */
  updateCardTypeMarker(cardTypeMarker: 'concept' | 'descriptor'): Result<void> {
    this.meta = {
      ...this.meta,
      cardTypeMarker
    };
    this.updatedAt = new Date();
    return ok(undefined);
  }

  /**
   * 更新卡片类型
   * 
   * 用于同步时更新卡片的技术类型（topic/item）
   * 
   * @param cardType - 卡片类型
   * @returns Result<void>
   */
  updateCardType(cardType: 'topic' | 'item' | 'concept' | 'descriptor'): Result<void> {
    this.meta = {
      ...this.meta,
      cardType
    };
    this.updatedAt = new Date();
    return ok(undefined);
  }

  /**
   * 更新 A-Factor（Topic 卡片的难度因子）
   * 
   * 用于同步时更新 Topic 卡片的 A-Factor
   * 
   * @param aFactor - A-Factor 值
   * @returns Result<void>
   */
  updateAFactor(aFactor: number): Result<void> {
    // 验证：A-Factor 必须在合理范围内（SuperMemo 范围：1.2 - 6.0）
    if (aFactor < 1.0 || aFactor > 6.5) {
      return err(new Error(`Invalid A-Factor: ${aFactor}. Must be between 1.0 and 6.5`));
    }

    this.meta = {
      ...this.meta,
      aFactor
    };
    this.updatedAt = new Date();
    return ok(undefined);
  }

  /**
   * 比较两个 Xiuyuan 是否相等（基于 ID）
   */
  equals(other: Xiuyuan): boolean {
    return this.id.equals(other.id);
  }

  /**
   * 转换为字符串（用于调试）
   */
  toString(): string {
    return `Xiuyuan(id: ${this.id.toString()}, cards: ${this.cards.size}, faces: ${this.faces.length})`;
  }
}
