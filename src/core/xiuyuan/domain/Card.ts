/**
 * Card - 卡片实体
 * 
 * @description
 * 卡片实体，封装卡片的调度信息和业务逻辑。
 * 
 * **设计原则**：
 * - 实体：有唯一标识（CardId）
 * - 封装业务规则：review 和 reschedule 方法
 * - 使用值对象：CardId, XiuyuanId, ScheduleInfo
 * - 不可变性：通过方法返回新实例而不是修改自身
 */

import { Result, ok, err, isErr } from '../../../types/result';
import { CardId } from './CardId';
import { XiuyuanId } from './XiuyuanId';
import { ScheduleInfo } from './ScheduleInfo';
import { Rating } from '../../../types/card';

export interface CardProps {
  id: CardId;
  xiuyuanId: XiuyuanId;
  faceIndex: number;
  scheduleInfo: ScheduleInfo;
  createdAt: Date;
  updatedAt: Date;
}

export class Card {
  private constructor(
    private readonly id: CardId,
    private xiuyuanId: XiuyuanId,
    private faceIndex: number,
    private scheduleInfo: ScheduleInfo,
    private readonly createdAt: Date,
    private updatedAt: Date
  ) {}

  /**
   * 创建 Card
   * 
   * @param props - 卡片属性
   * @returns Result<Card> - 成功返回 Card，失败返回错误
   */
  static create(props: CardProps): Result<Card> {
    // 验证：faceIndex 必须 >= 0
    if (props.faceIndex < 0) {
      return err(new Error('FaceIndex must be >= 0'));
    }

    return ok(new Card(
      props.id,
      props.xiuyuanId,
      props.faceIndex,
      props.scheduleInfo,
      props.createdAt,
      props.updatedAt
    ));
  }

  /**
   * 创建新卡片
   * 
   * @param id - 卡片 ID
   * @param xiuyuanId - Xiuyuan ID
   * @param faceIndex - 面索引
   * @returns Result<Card> - 成功返回 Card，失败返回错误
   */
  static createNew(
    id: CardId,
    xiuyuanId: XiuyuanId,
    faceIndex: number
  ): Result<Card> {
    if (faceIndex < 0) {
      return err(new Error('FaceIndex must be >= 0'));
    }

    const now = new Date();
    return ok(new Card(
      id,
      xiuyuanId,
      faceIndex,
      ScheduleInfo.createDefault(),
      now,
      now
    ));
  }

  // === Getters ===

  getId(): CardId {
    return this.id;
  }

  getXiuyuanId(): XiuyuanId {
    return this.xiuyuanId;
  }

  getFaceIndex(): number {
    return this.faceIndex;
  }

  getScheduleInfo(): ScheduleInfo {
    return this.scheduleInfo;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // === 业务方法 ===

  /**
   * 复习卡片
   * 
   * @param rating - 评分
   * @param newScheduleInfo - 新的调度信息（由调度器计算）
   * @returns Result<Card> - 成功返回新的 Card 实例，失败返回错误
   */
  review(rating: Rating, newScheduleInfo: ScheduleInfo): Result<Card> {
    // 验证：评分必须有效
    if (rating < Rating.Again || rating > Rating.Easy) {
      return err(new Error(`Invalid rating: ${rating}`));
    }

    // 创建新的 Card 实例（不可变性）
    return ok(new Card(
      this.id,
      this.xiuyuanId,
      this.faceIndex,
      newScheduleInfo,
      this.createdAt,
      new Date() // 更新 updatedAt
    ));
  }

  /**
   * 重新调度卡片
   * 
   * @param newDue - 新的到期时间
   * @returns Result<Card> - 成功返回新的 Card 实例，失败返回错误
   */
  reschedule(newDue: Date): Result<Card> {
    // 验证：新的到期时间不能早于创建时间
    if (newDue < this.createdAt) {
      return err(new Error('New due date cannot be earlier than creation date'));
    }

    // 创建新的调度信息
    const newScheduleInfoResult = ScheduleInfo.create({
      due: newDue,
      stability: this.scheduleInfo.stability,
      difficulty: this.scheduleInfo.difficulty,
      reps: this.scheduleInfo.reps,
      lapses: this.scheduleInfo.lapses,
      state: this.scheduleInfo.state,
      lastReview: this.scheduleInfo.lastReview,
      elapsedDays: this.scheduleInfo.elapsedDays,
      scheduledDays: this.scheduleInfo.scheduledDays,
      learning_step: this.scheduleInfo.learning_step
    });

    if (isErr(newScheduleInfoResult)) {
      return err(newScheduleInfoResult.error);
    }

    // 创建新的 Card 实例（不可变性）
    return ok(new Card(
      this.id,
      this.xiuyuanId,
      this.faceIndex,
      newScheduleInfoResult.value,
      this.createdAt,
      new Date() // 更新 updatedAt
    ));
  }

  /**
   * 判断卡片是否到期
   */
  isDue(now: Date = new Date()): boolean {
    return this.scheduleInfo.isDue(now);
  }

  /**
   * 判断是否为新卡片
   */
  isNew(): boolean {
    return this.scheduleInfo.isNew();
  }

  /**
   * 比较两个 Card 是否相等（基于 ID）
   */
  equals(other: Card): boolean {
    return this.id.equals(other.id);
  }

  /**
   * 转换为字符串（用于调试）
   */
  toString(): string {
    return `Card(id: ${this.id.toString()}, xiuyuanId: ${this.xiuyuanId.toString()}, faceIndex: ${this.faceIndex})`;
  }
}
