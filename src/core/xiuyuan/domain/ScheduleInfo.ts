/**
 * ScheduleInfo - 调度信息值对象
 * 
 * @description
 * 封装卡片的 FSRS 调度信息，提供验证和类型安全。
 * 
 * **设计原则**：
 * - 不可变性：一旦创建，值不可改变
 * - 验证逻辑：在创建时验证调度信息的有效性
 * - 业务语义：清晰表达 FSRS 调度概念
 */

import { Result, ok, err } from '../../../types/result';
import { CardState } from '../../../types/card';

export interface ScheduleInfoProps {
  due: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: Date;
  elapsedDays: number;
  scheduledDays: number;
  learning_step?: number;
}

export class ScheduleInfo {
  private constructor(
    public readonly due: Date,
    public readonly stability: number,
    public readonly difficulty: number,
    public readonly reps: number,
    public readonly lapses: number,
    public readonly state: CardState,
    public readonly lastReview: Date,
    public readonly elapsedDays: number,
    public readonly scheduledDays: number,
    public readonly learning_step?: number
  ) {}

  /**
   * 创建 ScheduleInfo
   * 
   * @param props - 调度信息属性
   * @returns Result<ScheduleInfo> - 成功返回 ScheduleInfo，失败返回错误
   */
  static create(props: ScheduleInfoProps): Result<ScheduleInfo> {
    // 验证：stability 必须 >= 0
    if (props.stability < 0) {
      return err(new Error('Stability must be >= 0'));
    }

    // 验证：difficulty 必须在 0-10 之间
    if (props.difficulty < 0 || props.difficulty > 10) {
      return err(new Error('Difficulty must be between 0 and 10'));
    }

    // 验证：reps 必须 >= 0
    if (props.reps < 0) {
      return err(new Error('Reps must be >= 0'));
    }

    // 验证：lapses 必须 >= 0
    if (props.lapses < 0) {
      return err(new Error('Lapses must be >= 0'));
    }

    // 验证：elapsedDays 必须 >= 0
    if (props.elapsedDays < 0) {
      return err(new Error('ElapsedDays must be >= 0'));
    }

    // 验证：scheduledDays 必须 >= 0
    if (props.scheduledDays < 0) {
      return err(new Error('ScheduledDays must be >= 0'));
    }

    // 验证：learning_step 如果存在必须 >= 0
    if (props.learning_step !== undefined && props.learning_step < 0) {
      return err(new Error('Learning step must be >= 0'));
    }

    return ok(new ScheduleInfo(
      props.due,
      props.stability,
      props.difficulty,
      props.reps,
      props.lapses,
      props.state,
      props.lastReview,
      props.elapsedDays,
      props.scheduledDays,
      props.learning_step
    ));
  }

  /**
   * 创建新卡片的默认调度信息
   */
  static createDefault(): ScheduleInfo {
    const now = new Date();
    return new ScheduleInfo(
      now,
      0,
      0,
      0,
      0,
      CardState.New,
      new Date(0),
      0,
      0,
      0
    );
  }

  /**
   * 比较两个 ScheduleInfo 是否相等
   */
  equals(other: ScheduleInfo): boolean {
    return (
      this.due.getTime() === other.due.getTime() &&
      this.stability === other.stability &&
      this.difficulty === other.difficulty &&
      this.reps === other.reps &&
      this.lapses === other.lapses &&
      this.state === other.state &&
      this.lastReview.getTime() === other.lastReview.getTime() &&
      this.elapsedDays === other.elapsedDays &&
      this.scheduledDays === other.scheduledDays &&
      this.learning_step === other.learning_step
    );
  }

  /**
   * 判断卡片是否到期
   */
  isDue(now: Date = new Date()): boolean {
    return this.due.getTime() <= now.getTime();
  }

  /**
   * 判断是否为新卡片
   */
  isNew(): boolean {
    return this.state === CardState.New;
  }

  /**
   * 判断是否在学习中
   */
  isLearning(): boolean {
    return this.state === CardState.Learning;
  }

  /**
   * 判断是否在复习阶段
   */
  isReview(): boolean {
    return this.state === CardState.Review;
  }

  /**
   * 判断是否在重新学习
   */
  isRelearning(): boolean {
    return this.state === CardState.Relearning;
  }

  /**
   * 转换为字符串（用于调试）
   */
  toString(): string {
    return `ScheduleInfo(due: ${this.due.toISOString()}, state: ${CardState[this.state]}, reps: ${this.reps})`;
  }
}
