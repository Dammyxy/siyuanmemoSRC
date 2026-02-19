/**
 * CardFace - 卡片面值对象
 * 
 * @description
 * 封装卡片的正面和反面内容，提供验证和类型安全。
 * 
 * **设计原则**：
 * - 不可变性：一旦创建，值不可改变
 * - 验证逻辑：在创建时验证卡片面的有效性
 * - 业务语义：清晰表达卡片的正反面概念
 */

import { Result, ok, err } from '../../../types/result';

export interface CardFaceProps {
  question: string;
  answer: string;
  questionBlockId?: string;
  answerBlockId?: string;
}

export class CardFace {
  private constructor(
    public readonly question: string,
    public readonly answer: string,
    public readonly questionBlockId?: string,
    public readonly answerBlockId?: string
  ) {}

  /**
   * 创建 CardFace
   * 
   * @param props - 卡片面属性
   * @returns Result<CardFace> - 成功返回 CardFace，失败返回错误
   */
  static create(props: CardFaceProps): Result<CardFace> {
    // 验证：问题不能为空
    if (!props.question || props.question.trim().length === 0) {
      return err(new Error('Question cannot be empty'));
    }

    // 注意：答案可以为空字符串（例如概念卡无定义时）
    // 只验证答案字段存在
    if (props.answer === undefined || props.answer === null) {
      return err(new Error('Answer must be provided (can be empty string)'));
    }

    // 验证：如果提供了 blockId，需要验证格式
    if (props.questionBlockId) {
      const blockIdPattern = /^[0-9]{14}-[a-z0-9]{7}$/;
      if (!blockIdPattern.test(props.questionBlockId)) {
        return err(new Error(`Invalid questionBlockId format: ${props.questionBlockId}`));
      }
    }

    if (props.answerBlockId) {
      const blockIdPattern = /^[0-9]{14}-[a-z0-9]{7}$/;
      if (!blockIdPattern.test(props.answerBlockId)) {
        return err(new Error(`Invalid answerBlockId format: ${props.answerBlockId}`));
      }
    }

    return ok(new CardFace(
      props.question.trim(),
      props.answer, // 不 trim，保留空字符串
      props.questionBlockId,
      props.answerBlockId
    ));
  }

  /**
   * 比较两个 CardFace 是否相等
   */
  equals(other: CardFace): boolean {
    return (
      this.question === other.question &&
      this.answer === other.answer &&
      this.questionBlockId === other.questionBlockId &&
      this.answerBlockId === other.answerBlockId
    );
  }

  /**
   * 转换为字符串（用于调试）
   */
  toString(): string {
    return `CardFace(Q: ${this.question.substring(0, 20)}..., A: ${this.answer.substring(0, 20)}...)`;
  }
}
