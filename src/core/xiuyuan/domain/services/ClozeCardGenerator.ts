/**
 * ClozeCardGenerator - 填空卡片生成器（领域服务）
 * 
 * @description
 * 负责从原始内容和填空信息生成多张填空卡片的 CardFace。
 * 
 * **设计原则**：
 * - 领域服务：封装不属于任何实体的领域逻辑
 * - 无状态：纯函数，不保存状态
 * - 单一职责：只负责填空卡片的生成逻辑
 * 
 * **业务规则**：
 * - 每个填空生成一张卡片
 * - 问题：将当前填空替换为 [...]，其他填空显示原文
 * - 答案：当前填空的内容
 */

import { Result, ok } from '@/types/result';
import { CardFace } from '../CardFace';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ClozeCardGenerator');

/**
 * 填空信息
 */
export interface ClozeInfo {
  text: string;
  start: number;
  end: number;
  type: string;
}

/**
 * 填空卡片生成器
 */
export class ClozeCardGenerator {
  /**
   * 从原始内容和填空信息生成 CardFace 列表
   * 
   * @param originalContent - 原始内容（包含填空标记）
   * @param clozes - 填空列表
   * @param blockId - 块 ID
   * @returns Result<CardFace[]> - 成功返回 CardFace 列表，失败返回错误
   */
  static generateFaces(
    originalContent: string,
    clozes: ClozeInfo[],
    blockId: string
  ): Result<CardFace[]> {
    const faces: CardFace[] = [];

    for (let i = 0; i < clozes.length; i++) {
      const { question, answer } = this.generateClozeCard(
        originalContent,
        clozes,
        i
      );

      const faceResult = CardFace.create({
        question: question.trim(),
        answer: answer.trim(),
        questionBlockId: blockId,
        answerBlockId: blockId,
      });

      if (!faceResult.ok) {
        return faceResult as Result<CardFace[]>;
      }

      faces.push(faceResult.value);
    }

    return ok(faces);
  }

  /**
   * 生成单个填空卡片的问题和答案
   * 
   * @param content - 原始内容
   * @param clozes - 所有填空
   * @param currentIndex - 当前填空的索引
   * @returns { question, answer } - 问题和答案
   * 
   * @example
   * 输入：
   * - content: "1232==1111==111==111==111==111111==111"
   * - clozes: [{ text: "1111", start: 5, end: 11 }, { text: "111", start: 13, end: 18 }, ...]
   * - currentIndex: 0
   * 
   * 输出：
   * - question: "1232[...]111111111111111111"
   * - answer: "1111"
   */
  private static generateClozeCard(
    content: string,
    clozes: ClozeInfo[],
    currentIndex: number
  ): { question: string; answer: string } {
    const currentCloze = clozes[currentIndex];

    // 答案：当前填空的内容（纯文本，不添加样式）
    const answer = currentCloze.text;

    // 🔍 调试日志
    logger.debug(`Generating card ${currentIndex + 1}/${clozes.length}`);
    logger.debug(`Current cloze (index ${currentIndex}):`, currentCloze);

    // 问题：将当前填空替换为 [...]，其他填空显示原文
    // 🔧 新算法：为每个 cloze 添加索引标记，然后从后往前替换
    const clozesWithIndex = clozes.map((c, idx) => ({ ...c, originalIndex: idx }));
    const sortedClozes = [...clozesWithIndex].sort((a, b) => b.start - a.start);

    let question = content;

    for (const cloze of sortedClozes) {
      if (cloze.originalIndex === currentIndex) {
        // 当前填空：替换为 <mark>[...]</mark>
        question =
          question.substring(0, cloze.start) +
          '<mark>[...]</mark>' +
          question.substring(cloze.end);
        logger.debug(`Replaced cloze ${cloze.originalIndex} (${cloze.text}) with <mark>[...]</mark>`);
      } else {
        // 其他填空：显示原文（去掉标记）
        question =
          question.substring(0, cloze.start) +
          cloze.text +
          question.substring(cloze.end);
        logger.debug(`Kept cloze ${cloze.originalIndex} (${cloze.text}) as text`);
      }
    }

    logger.debug(`Generated question: "${question}"`);
    logger.debug(`Generated answer: "${answer}"`);

    return { question, answer };
  }
}
