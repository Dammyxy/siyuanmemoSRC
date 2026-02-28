import { createLogger } from '@/utils/logger';
import { Result, ok } from '@/types/result';
import { CardFace } from '../CardFace';

const logger = createLogger('ClozeCardGenerator');

const LATEX_FRONT_PLACEHOLDER = '\\color{#2e7d32}{\\boxed{\\text{[...]}}}';

export interface ClozeInfo {
  text: string;
  start: number;
  end: number;
  type: string;
}

export class ClozeCardGenerator {
  static generateFaces(
    originalContent: string,
    clozes: ClozeInfo[],
    blockId: string
  ): Result<CardFace[]> {
    const faces: CardFace[] = [];

    for (let i = 0; i < clozes.length; i++) {
      const { question, answer } = this.generateClozeCard(originalContent, clozes, i);

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

  private static generateClozeCard(
    content: string,
    clozes: ClozeInfo[],
    currentIndex: number
  ): { question: string; answer: string } {
    const currentCloze = clozes[currentIndex];
    const isLatexAnswer = currentCloze.type === 'latex';
    const answer = isLatexAnswer ? `$$${currentCloze.text}$$` : currentCloze.text;

    logger.debug(`Generating card ${currentIndex + 1}/${clozes.length}`);
    logger.debug(`Current cloze (index ${currentIndex}):`, currentCloze);

    const clozesWithIndex = clozes.map((c, idx) => ({ ...c, originalIndex: idx }));
    const sortedClozes = [...clozesWithIndex].sort((a, b) => b.start - a.start);

    let question = content;

    for (const cloze of sortedClozes) {
      if (cloze.originalIndex === currentIndex) {
        const placeholder = cloze.type === 'latex'
          ? LATEX_FRONT_PLACEHOLDER
          : '<mark>[...]</mark>';
        question =
          question.substring(0, cloze.start) +
          placeholder +
          question.substring(cloze.end);
        logger.debug(`Replaced cloze ${cloze.originalIndex} (${cloze.text}) with placeholder`);
      } else {
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
