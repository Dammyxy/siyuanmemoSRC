import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';

export interface MultiClozeCardViewModel extends BaseCardViewModel {
  currentFace: {
    question: string;
    answer: string;
  };
  faceIndex: number;
  totalFaces: number;
}

interface MultiClozeCardFace {
  question: string;
  answer: string;
}

interface MultiClozeCardInput {
  blockId: string;
  meta?: {
    faces?: MultiClozeCardFace[];
    faceIndex?: number;
  };
}

export class MultiClozeCardRenderService extends BaseCardRenderService {
  async prepareViewModel(card: MultiClozeCardInput): Promise<MultiClozeCardViewModel> {
    const faces = card.meta?.faces || [];
    const faceIndex = card.meta?.faceIndex ?? 0;
    const currentFaceRaw = faces[faceIndex] || { question: '', answer: '' };
    const normalizedAnswer = this.normalizeAnswerForMath(
      this.stripMarkTags(currentFaceRaw.answer),
      currentFaceRaw.question
    );

    const currentFace = {
      question: this.wrapClozeWithMark(currentFaceRaw.question),
      answer: normalizedAnswer,
    };

    const breadcrumbs = await this.loadBreadcrumbs(card.blockId);

    return {
      blockId: card.blockId,
      breadcrumbs,
      currentFace,
      faceIndex,
      totalFaces: faces.length,
    };
  }

  private wrapClozeWithMark(text: string): string {
    if (!text) return text;
    if (text.includes('<mark>')) return text;
    return this.replacePlaceholderOutsideMath(text, '<mark>[...]</mark>');
  }

  private stripMarkTags(text: string): string {
    if (!text) return text;
    return text.replace(/<\/?mark>/g, '');
  }

  private normalizeAnswerForMath(answer: string, question: string): string {
    const trimmed = answer.trim();
    if (!trimmed) return answer;
    const prefersDisplayMode = this.prefersDisplayMathAnswer(question);

    // Normalize legacy `$$...$$` short answers according to question math mode.
    const displayMathOnlyMatch = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
    if (displayMathOnlyMatch) {
      const expression = displayMathOnlyMatch[1].trim();
      if (expression && !expression.includes('\n')) {
        return prefersDisplayMode ? `$$${expression}$$` : `$${expression}$`;
      }
    }

    if (trimmed.includes('$')) return answer;
    if (!this.containsMathExpression(question)) return answer;
    if (!this.looksLikeLatex(trimmed)) return answer;
    return prefersDisplayMode ? `$$${trimmed}$$` : `$${trimmed}$`;
  }

  private prefersDisplayMathAnswer(question: string): boolean {
    if (!question) return false;

    const trimmedQuestion = question.trim();
    if (/^\$\$[\s\S]+\$\$$/.test(trimmedQuestion)) {
      return true;
    }

    const hasDisplayMath = /\$\$[\s\S]+?\$\$/.test(trimmedQuestion);
    const hasInlineMath = /\$(?!\$)[\s\S]+?\$/.test(trimmedQuestion);
    return hasDisplayMath && !hasInlineMath;
  }

  private containsMathExpression(text: string): boolean {
    if (!text) return false;
    if (/\$\$[\s\S]+?\$\$/.test(text)) return true;
    return /\$(?!\$)[^$\n]+?\$/.test(text);
  }

  private looksLikeLatex(text: string): boolean {
    return /\\[a-zA-Z]+|[\^_{}]/.test(text);
  }

  private replacePlaceholderOutsideMath(text: string, replacement: string): string {
    const segments = text.split(/(\$\$[\s\S]+?\$\$|\$(?!\$)[\s\S]+?\$)/g);
    return segments
      .map((segment) => {
        if (!segment) return segment;
        if (segment.startsWith('$$') || segment.startsWith('$')) {
          return segment;
        }
        return segment.replace(/\[\.\.\.]/g, replacement);
      })
      .join('');
  }
}
