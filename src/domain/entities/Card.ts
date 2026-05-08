/**
 * Card Entity - 卡片领域实体
 * 
 * @module Card
 * @description
 * 真正的 DDD 领域模型，包含业务逻辑和验证规则。
 * 
 * **设计原则**：
 * 1. 不可变性：通过私有构造函数和工厂方法创建
 * 2. 封装性：业务逻辑封装在方法中
 * 3. 自验证：创建时自动验证
 * 4. 领域语言：使用业务术语
 * 
 * **与 FSRSCard 的区别**：
 * - FSRSCard: 数据传输对象（DTO），纯数据结构
 * - Card: 领域实体（Entity），包含业务逻辑
 * 
 * @see FSRSCard - 数据传输对象
 * @see ICardRepository - 仓储接口
 */

import type { CardState, CardType, FSRSCard } from '../../types/card';
import { ok, err, isErr, type Result } from '../../types/result';

type SchedulerMeta = FSRSCard['schedulerMeta'];
type RescheduleHistory = FSRSCard['rescheduleHistory'];

/**
 * 卡片 ID 值对象
 */
export class CardId {
  private constructor(public readonly value: string) {}

  static create(value: string): Result<CardId> {
    if (!value || value.trim().length === 0) {
      return err(new Error('Card ID cannot be empty'));
    }
    return ok(new CardId(value));
  }

  equals(other: CardId): boolean {
    return this.value === other.value;
  }
}

/**
 * 块 ID 值对象
 */
export class BlockId {
  private constructor(public readonly value: string) {}

  static create(value: string): Result<BlockId> {
    if (!value || value.trim().length === 0) {
      return err(new Error('Block ID cannot be empty'));
    }
    return ok(new BlockId(value));
  }

  equals(other: BlockId): boolean {
    return this.value === other.value;
  }
}

/**
 * 优先级值对象
 */
export class Priority {
  private constructor(public readonly value: number) {}

  static create(value: number): Result<Priority> {
    if (value < 0 || value > 100) {
      return err(new Error('Priority must be between 0 and 100'));
    }
    return ok(new Priority(value));
  }

  static createDefault(): Priority {
    return new Priority(50);
  }

  isHigher(other: Priority): boolean {
    return this.value < other.value; // 数值越小优先级越高
  }

  equals(other: Priority): boolean {
    return this.value === other.value;
  }
}

/**
 * Xiuyuan 元数据值对象
 */
export interface XiuyuanMetadata {
  xiuyuanID: string;
  templateID: string;
  frontBlockIDs: string[];
  backBlockIDs: string[];
  fieldMapping?: Record<string, string>;
  priority?: number;
}

/**
 * 卡片创建属性
 */
export interface CardProps {
  id: string;
  blockId: string;
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: number;
  elapsedDays: number;
  scheduledDays: number;
  learning_step?: number;
  priority: number;
  type: CardType;
  tags?: string[];
  cardTypeMarker?: 'concept' | 'descriptor';
  neuralRoamSeed?: boolean;
  leechCount: number;
  isLeech: boolean;
  skipped: boolean;
  skipNote?: string;
  skipUntil?: number;
  sourceUrl?: string;
  extractedFrom?: string;
  createdAt: number;
  updatedAt: number;
  aFactor?: number;
  schedulerType?: 'fsrs-v6' | 'a-factor-v2' | 'riff' | string;
  syncToRiff?: boolean;
  riffCardId?: string;
  schedulerMeta?: SchedulerMeta;
  postponeCount?: number;
  lastPostponeDate?: number;
  rescheduleHistory?: RescheduleHistory;
  xiuyuanMetadata?: XiuyuanMetadata;
  extensionData?: Record<string, unknown>;
}

/**
 * Card Entity - 卡片领域实体
 * 
 * 职责：
 * 1. 封装卡片业务逻辑
 * 2. 维护卡片不变量
 * 3. 提供领域方法
 */
export class Card {
  // === 标识 ===
  private readonly _id: CardId;
  private readonly _blockId: BlockId;

  // === FSRS 核心字段 ===
  private _due: number;
  private _stability: number;
  private _difficulty: number;
  private _reps: number;
  private _lapses: number;
  private _state: CardState;
  private _lastReview: number;
  private _elapsedDays: number;
  private _scheduledDays: number;
  private _learning_step?: number;

  // === 扩展功能 ===
  private _priority: Priority;
  private _type: CardType;
  private _tags: string[];
  private _cardTypeMarker?: 'concept' | 'descriptor';
  private _neuralRoamSeed?: boolean;

  // === 难点攻克 ===
  private _leechCount: number;
  private _isLeech: boolean;

  // === 跳过/留言 ===
  private _skipped: boolean;
  private _skipNote?: string;
  private _skipUntil?: number;

  // === 增量阅读 ===
  private _sourceUrl?: string;
  private _extractedFrom?: string;

  // === 元数据 ===
  private _createdAt: number;
  private _updatedAt: number;

  // === Topic/Item 区分 ===
  private _aFactor?: number;

  // === 调度器相关 ===
  private _schedulerType?: 'fsrs-v6' | 'a-factor-v2' | 'riff' | string;
  private _syncToRiff?: boolean;
  private _riffCardId?: string;
  private _schedulerMeta?: SchedulerMeta;

  // === 重新调度相关 ===
  private _postponeCount?: number;
  private _lastPostponeDate?: number;
  private _rescheduleHistory?: RescheduleHistory;

  // === Xiuyuan 元数据 ===
  private _xiuyuanMetadata?: XiuyuanMetadata;

  // === 扩展数据 ===
  private _extensionData?: Record<string, unknown>;

  private constructor(props: CardProps) {
    // 创建值对象
    const idResult = CardId.create(props.id);
    const blockIdResult = BlockId.create(props.blockId);
    const priorityResult = Priority.create(props.priority);

    if (isErr(idResult)) throw idResult.error;
    if (isErr(blockIdResult)) throw blockIdResult.error;
    if (isErr(priorityResult)) throw priorityResult.error;

    this._id = idResult.value;
    this._blockId = blockIdResult.value;
    this._priority = priorityResult.value;

    // 赋值其他字段
    this._due = props.due;
    this._stability = props.stability;
    this._difficulty = props.difficulty;
    this._reps = props.reps;
    this._lapses = props.lapses;
    this._state = props.state;
    this._lastReview = props.lastReview;
    this._elapsedDays = props.elapsedDays;
    this._scheduledDays = props.scheduledDays;
    this._learning_step = props.learning_step;
    this._type = props.type;
    this._tags = props.tags || [];
    this._cardTypeMarker = props.cardTypeMarker;
    this._neuralRoamSeed = props.neuralRoamSeed;
    this._leechCount = props.leechCount;
    this._isLeech = props.isLeech;
    this._skipped = props.skipped;
    this._skipNote = props.skipNote;
    this._skipUntil = props.skipUntil;
    this._sourceUrl = props.sourceUrl;
    this._extractedFrom = props.extractedFrom;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._aFactor = props.aFactor;
    this._schedulerType = props.schedulerType;
    this._syncToRiff = props.syncToRiff;
    this._riffCardId = props.riffCardId;
    this._schedulerMeta = props.schedulerMeta;
    this._postponeCount = props.postponeCount;
    this._lastPostponeDate = props.lastPostponeDate;
    this._rescheduleHistory = props.rescheduleHistory;
    this._xiuyuanMetadata = props.xiuyuanMetadata;
    this._extensionData = props.extensionData;

    // 验证不变量
    this.validate();
  }

  /**
   * 工厂方法：创建新卡片
   */
  static create(props: CardProps): Result<Card> {
    try {
      const card = new Card(props);
      return ok(card);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 工厂方法：创建新卡片（默认值）
   */
  static createNew(blockId: string, type: CardType): Result<Card> {
    const now = Date.now();
    return Card.create({
      id: blockId, // 使用 blockId 作为 cardId
      blockId,
      due: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: 0, // CardState.New
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 50,
      type,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * 验证不变量
   */
  private validate(): void {
    if (this._stability < 0) {
      throw new Error('Stability must be non-negative');
    }
    if (this._difficulty < 1 || this._difficulty > 10) {
      throw new Error('Difficulty must be between 1 and 10');
    }
    if (this._reps < 0) {
      throw new Error('Reps must be non-negative');
    }
    if (this._lapses < 0) {
      throw new Error('Lapses must be non-negative');
    }
  }

  // ==================== 业务方法 ====================

  /**
   * 判断卡片是否到期
   */
  isOverdue(): boolean {
    return this._due <= Date.now() && this._state !== 4; // 4 = Suspended
  }

  /**
   * 判断是否为 Xiuyuan 卡片
   */
  isXiuyuanCard(): boolean {
    return this._xiuyuanMetadata !== undefined;
  }

  /**
   * 判断是否为新卡片
   */
  isNew(): boolean {
    return this._state === 0; // CardState.New
  }

  /**
   * 判断是否为学习中卡片
   */
  isLearning(): boolean {
    return this._state === 1 || this._state === 3; // Learning or Relearning
  }

  /**
   * 判断是否为复习卡片
   */
  isReview(): boolean {
    return this._state === 2; // CardState.Review
  }

  /**
   * 标记为难点
   */
  markAsLeech(): void {
    this._isLeech = true;
    this._leechCount++;
    this._updatedAt = Date.now();
  }

  /**
   * 取消难点标记
   */
  unmarkAsLeech(): void {
    this._isLeech = false;
    this._updatedAt = Date.now();
  }

  /**
   * 跳过卡片
   */
  skip(note?: string, skipUntil?: number): void {
    this._skipped = true;
    this._skipNote = note;
    this._skipUntil = skipUntil;
    this._updatedAt = Date.now();
  }

  /**
   * 取消跳过
   */
  unskip(): void {
    this._skipped = false;
    this._skipNote = undefined;
    this._skipUntil = undefined;
    this._updatedAt = Date.now();
  }

  /**
   * 添加标签
   */
  addTag(tag: string): void {
    if (!this._tags.includes(tag)) {
      this._tags.push(tag);
      this._updatedAt = Date.now();
    }
  }

  /**
   * 移除标签
   */
  removeTag(tag: string): void {
    const index = this._tags.indexOf(tag);
    if (index !== -1) {
      this._tags.splice(index, 1);
      this._updatedAt = Date.now();
    }
  }

  /**
   * 更新 FSRS 数据（复习后）
   */
  updateFSRSData(data: {
    due: number;
    stability: number;
    difficulty: number;
    state: CardState;
    lastReview: number;
    elapsedDays: number;
    scheduledDays: number;
  }): void {
    this._due = data.due;
    this._stability = data.stability;
    this._difficulty = data.difficulty;
    this._state = data.state;
    this._lastReview = data.lastReview;
    this._elapsedDays = data.elapsedDays;
    this._scheduledDays = data.scheduledDays;
    this._reps++;
    this._updatedAt = Date.now();

    this.validate();
  }

  /**
   * 记录遗忘
   */
  recordLapse(): void {
    this._lapses++;
    this._leechCount++;
    this._updatedAt = Date.now();

    // 检查是否应该标记为难点（连续遗忘 8 次）
    if (this._leechCount >= 8) {
      this.markAsLeech();
    }
  }

  /**
   * 更新优先级
   */
  updatePriority(priority: number): Result<void> {
    const priorityResult = Priority.create(priority);
    if (isErr(priorityResult)) {
      return err(priorityResult.error);
    }
    this._priority = priorityResult.value;
    this._updatedAt = Date.now();
    return ok(undefined);
  }

  /**
   * 设置 Xiuyuan 元数据
   */
  setXiuyuanMetadata(metadata: XiuyuanMetadata): void {
    this._xiuyuanMetadata = metadata;
    this._updatedAt = Date.now();
  }

  /**
   * 设置扩展数据
   */
  setExtensionData(key: string, value: unknown): void {
    if (!this._extensionData) {
      this._extensionData = {};
    }
    this._extensionData[key] = value;
    this._updatedAt = Date.now();
  }

  /**
   * 获取扩展数据
   */
  getExtensionData(key: string): unknown {
    return this._extensionData?.[key];
  }

  // ==================== Getters ====================

  get id(): CardId {
    return this._id;
  }

  get blockId(): BlockId {
    return this._blockId;
  }

  get due(): number {
    return this._due;
  }

  get stability(): number {
    return this._stability;
  }

  get difficulty(): number {
    return this._difficulty;
  }

  get reps(): number {
    return this._reps;
  }

  get lapses(): number {
    return this._lapses;
  }

  get state(): CardState {
    return this._state;
  }

  get lastReview(): number {
    return this._lastReview;
  }

  get elapsedDays(): number {
    return this._elapsedDays;
  }

  get scheduledDays(): number {
    return this._scheduledDays;
  }

  get learning_step(): number | undefined {
    return this._learning_step;
  }

  get priority(): Priority {
    return this._priority;
  }

  get type(): CardType {
    return this._type;
  }

  get tags(): readonly string[] {
    return this._tags;
  }

  get cardTypeMarker(): 'concept' | 'descriptor' | undefined {
    return this._cardTypeMarker;
  }

  get neuralRoamSeed(): boolean | undefined {
    return this._neuralRoamSeed;
  }

  get leechCount(): number {
    return this._leechCount;
  }

  get isLeech(): boolean {
    return this._isLeech;
  }

  get skipped(): boolean {
    return this._skipped;
  }

  get skipNote(): string | undefined {
    return this._skipNote;
  }

  get skipUntil(): number | undefined {
    return this._skipUntil;
  }

  get sourceUrl(): string | undefined {
    return this._sourceUrl;
  }

  get extractedFrom(): string | undefined {
    return this._extractedFrom;
  }

  get createdAt(): number {
    return this._createdAt;
  }

  get updatedAt(): number {
    return this._updatedAt;
  }

  get aFactor(): number | undefined {
    return this._aFactor;
  }

  get schedulerType(): string | undefined {
    return this._schedulerType;
  }

  get syncToRiff(): boolean | undefined {
    return this._syncToRiff;
  }

  get riffCardId(): string | undefined {
    return this._riffCardId;
  }

  get schedulerMeta(): SchedulerMeta {
    return this._schedulerMeta;
  }

  get postponeCount(): number | undefined {
    return this._postponeCount;
  }

  get lastPostponeDate(): number | undefined {
    return this._lastPostponeDate;
  }

  get rescheduleHistory(): RescheduleHistory {
    return this._rescheduleHistory;
  }

  get xiuyuanMetadata(): XiuyuanMetadata | undefined {
    return this._xiuyuanMetadata;
  }

  get extensionData(): Record<string, unknown> | undefined {
    return this._extensionData;
  }

  /**
   * 转换为普通对象（用于序列化）
   */
  toObject(): CardProps {
    return {
      id: this._id.value,
      blockId: this._blockId.value,
      due: this._due,
      stability: this._stability,
      difficulty: this._difficulty,
      reps: this._reps,
      lapses: this._lapses,
      state: this._state,
      lastReview: this._lastReview,
      elapsedDays: this._elapsedDays,
      scheduledDays: this._scheduledDays,
      learning_step: this._learning_step,
      priority: this._priority.value,
      type: this._type,
      tags: [...this._tags],
      cardTypeMarker: this._cardTypeMarker,
      neuralRoamSeed: this._neuralRoamSeed,
      leechCount: this._leechCount,
      isLeech: this._isLeech,
      skipped: this._skipped,
      skipNote: this._skipNote,
      skipUntil: this._skipUntil,
      sourceUrl: this._sourceUrl,
      extractedFrom: this._extractedFrom,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      aFactor: this._aFactor,
      schedulerType: this._schedulerType,
      syncToRiff: this._syncToRiff,
      riffCardId: this._riffCardId,
      schedulerMeta: this._schedulerMeta,
      postponeCount: this._postponeCount,
      lastPostponeDate: this._lastPostponeDate,
      rescheduleHistory: this._rescheduleHistory,
      xiuyuanMetadata: this._xiuyuanMetadata,
      extensionData: this._extensionData,
    };
  }
}
