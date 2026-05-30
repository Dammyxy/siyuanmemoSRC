import { BaseCardRenderService } from '@/core/card/common/application/BaseCardRenderService';
import type { BaseCardViewModel } from '@/core/card/common/application/types';
import { SiyuanKramdownGateway } from '@/core/card/common/infrastructure/SiyuanKramdownGateway';
import {
  FORMULA_CLOZE_RENDER_MODE_INLINE,
  createFormulaClozeAnswerExpression,
  createFormulaClozePlaceholderExpression,
  ensureDisplayMathDelimiters,
  hasMathDelimiters,
  parseFormulaClozeTargets,
} from '@/core/card/post-creation/formula-cloze-style';
import { stripSiyuanBlockAttributeArtifacts } from '@/core/card/common/utils/stripSiyuanBlockAttributeArtifacts';
import { resolveCardFaceIndex } from '@/core/card/cardSemanticLocator';
import type { CardFaceKey } from '@/types/card';
import { type ClozeInfo, ClozeDetector } from '@/utils/cloze-detector';
import { createLogger } from '@/utils/logger';

export type MultiClozeRenderMode = typeof FORMULA_CLOZE_RENDER_MODE_INLINE | 'default';

export interface MultiClozeCardViewModel extends BaseCardViewModel {
  frontHtml: string;
  backHtml: string;
  faceIndex: number;
  requestedFaceIndex?: number;
  totalFaces: number;
  renderMode: MultiClozeRenderMode;
}

interface MultiClozeCardFace {
  question: string;
  answer: string;
}

interface MultiClozeCardInput {
  blockId: string;
  faceKey?: CardFaceKey;
  meta?: {
    faces?: MultiClozeCardFace[];
    faceIndex?: number;
    clozeRenderMode?: unknown;
  };
}

interface MultiClozeCardRenderResult {
  frontHtml: string;
  backHtml: string;
  faceIndex: number;
  requestedFaceIndex?: number;
}

const logger = createLogger('MultiClozeCardRenderService');
const CLOZE_PLACEHOLDER_TOKEN = 'SIYUANMEMO_MULTI_CLOZE_PLACEHOLDER_TOKEN';
const CLOZE_PLACEHOLDER_START_TOKEN = 'SIYUANMEMO_MULTI_CLOZE_PLACEHOLDER_START_TOKEN';
const CLOZE_PLACEHOLDER_END_TOKEN = 'SIYUANMEMO_MULTI_CLOZE_PLACEHOLDER_END_TOKEN';
const CLOZE_CURRENT_ANSWER_START_TOKEN = 'SIYUANMEMO_MULTI_CLOZE_CURRENT_ANSWER_START_TOKEN';
const CLOZE_CONTEXT_ANSWER_START_TOKEN = 'SIYUANMEMO_MULTI_CLOZE_CONTEXT_ANSWER_START_TOKEN';
const CLOZE_ANSWER_END_TOKEN = 'SIYUANMEMO_MULTI_CLOZE_ANSWER_END_TOKEN';
const MIN_TEXT_BLANK_WIDTH_CH = 4;
const MAX_TEXT_BLANK_WIDTH_CH = 28;
const COMPLEX_BLANK_WIDTH_CH = 12;

export class MultiClozeCardRenderService extends BaseCardRenderService {
  private readonly kramdownGateway = new SiyuanKramdownGateway(logger);

  async prepareViewModel(card: MultiClozeCardInput): Promise<MultiClozeCardViewModel> {
    const faces = card.meta?.faces || [];
    const requestedFaceIndex = resolveCardFaceIndex(card);
    const renderMode = this.resolveRenderMode(card.meta?.clozeRenderMode);
    const rendered = await this.renderCardFaces(card.blockId, faces, requestedFaceIndex, renderMode);
    const breadcrumbs = await this.loadBreadcrumbs(card.blockId);

    return {
      blockId: card.blockId,
      breadcrumbs,
      frontHtml: rendered.frontHtml,
      backHtml: rendered.backHtml,
      faceIndex: rendered.faceIndex,
      requestedFaceIndex: rendered.requestedFaceIndex,
      totalFaces: faces.length,
      renderMode,
    };
  }

  private resolveRenderMode(value: unknown): MultiClozeRenderMode {
    if (value === FORMULA_CLOZE_RENDER_MODE_INLINE) {
      return FORMULA_CLOZE_RENDER_MODE_INLINE;
    }
    return 'default';
  }

  protected async loadSourceKramdown(blockId: string): Promise<string | null> {
    return this.kramdownGateway.getBlockKramdown(blockId);
  }

  protected renderRichKramdown(kramdown: string): string {
    return this.kramdownGateway.kramdownToHtml(kramdown, {
      stripAttributeLines: true,
      preferSpinBlockDOM: true,
    });
  }

  private async renderCardFaces(
    blockId: string,
    faces: MultiClozeCardFace[],
    requestedFaceIndex: number,
    renderMode: MultiClozeRenderMode,
  ): Promise<MultiClozeCardRenderResult> {
    const sourceKramdown = await this.loadSourceKramdown(blockId);
    const normalizedSourceKramdown = this.stripAttributeArtifacts(sourceKramdown || '');
    if (normalizedSourceKramdown) {
      const renderedFromSource = this.renderFromSourceKramdown(
        blockId,
        normalizedSourceKramdown,
        faces,
        requestedFaceIndex,
        renderMode,
      );
      if (renderedFromSource) {
        return renderedFromSource;
      }
    }

    return this.renderFromStoredFaces(blockId, faces, requestedFaceIndex, renderMode);
  }

  private renderFromSourceKramdown(
    blockId: string,
    sourceKramdown: string,
    faces: MultiClozeCardFace[],
    requestedFaceIndex: number,
    renderMode: MultiClozeRenderMode,
  ): MultiClozeCardRenderResult | null {
    const clozes = ClozeDetector.extractClozes(sourceKramdown);
    if (clozes.length === 0) {
      return null;
    }
    const sourceStoredCountMismatch = faces.length > 0 && clozes.length !== faces.length;
    if (sourceStoredCountMismatch) {
      const requestedHitsSource = requestedFaceIndex >= 0 && requestedFaceIndex < clozes.length;
      const requestedHitsStored = requestedFaceIndex >= 0 && requestedFaceIndex < faces.length;
      if (!requestedHitsSource && requestedHitsStored && faces.length > 1) {
        return null;
      }
    }
    const effectiveFaceIndex = this.resolveEffectiveFaceIndex(
      blockId,
      requestedFaceIndex,
      clozes.length,
      'source',
    );
    if (effectiveFaceIndex === null) {
      return null;
    }
    if (sourceStoredCountMismatch) {
      logger.warn('[MultiClozeCardRenderService] Source/stored cloze count mismatch; using source cloze rendering', {
        blockId,
        requestedFaceIndex,
        effectiveFaceIndex,
        sourceClozeCount: clozes.length,
        storedFaceCount: faces.length,
      });
    }

    const frontKramdown = this.processSourceKramdown(
      sourceKramdown,
      clozes,
      effectiveFaceIndex,
      renderMode,
      false,
    );
    const backKramdown = this.processSourceKramdown(
      sourceKramdown,
      clozes,
      effectiveFaceIndex,
      renderMode,
      true,
    );

    return {
      ...this.finalizeRenderedFaces(frontKramdown, backKramdown, renderMode),
      faceIndex: effectiveFaceIndex,
      requestedFaceIndex: effectiveFaceIndex === requestedFaceIndex ? undefined : requestedFaceIndex,
    };
  }

  private renderFromStoredFaces(
    blockId: string,
    faces: MultiClozeCardFace[],
    requestedFaceIndex: number,
    renderMode: MultiClozeRenderMode,
  ): MultiClozeCardRenderResult {
    const effectiveFaceIndex = this.resolveEffectiveFaceIndex(
      blockId,
      requestedFaceIndex,
      faces.length,
      'stored',
    ) ?? 0;
    const currentFaceRaw = faces[effectiveFaceIndex] || { question: '', answer: '' };
    if (renderMode === FORMULA_CLOZE_RENDER_MODE_INLINE) {
      const normalizedQuestion = this.normalizeStoredFormulaFace(
        currentFaceRaw.question,
        effectiveFaceIndex,
        false,
      );
      const normalizedAnswer = this.normalizeStoredFormulaFace(
        currentFaceRaw.answer,
        effectiveFaceIndex,
        true,
      );
      return {
        frontHtml: normalizedQuestion,
        backHtml: normalizedAnswer,
        faceIndex: effectiveFaceIndex,
        requestedFaceIndex: effectiveFaceIndex === requestedFaceIndex ? undefined : requestedFaceIndex,
      };
    }

    const normalizedQuestion = this.normalizeQuestionForMath(
      this.stripAttributeArtifacts(currentFaceRaw.question),
      renderMode,
    );
    const normalizedAnswer = this.normalizeAnswerForMath(
      this.stripAttributeArtifacts(this.stripMarkTags(currentFaceRaw.answer)),
      normalizedQuestion,
      renderMode,
    );

    const frontKramdown = this.replaceFirstPlaceholderOutsideMath(
      normalizedQuestion,
      this.createPlaceholderToken(normalizedAnswer),
    );
    const backKramdown = this.restoreAnswerIntoPlaceholder(
      frontKramdown,
      this.createCurrentAnswerToken(normalizedAnswer),
    );
    return {
      frontHtml: this.finalizeRichHtml(frontKramdown),
      backHtml: this.finalizeRichHtml(backKramdown),
      faceIndex: effectiveFaceIndex,
      requestedFaceIndex: effectiveFaceIndex === requestedFaceIndex ? undefined : requestedFaceIndex,
    };
  }

  private resolveEffectiveFaceIndex(
    blockId: string,
    requestedFaceIndex: number,
    totalFaces: number,
    source: 'source' | 'stored',
  ): number | null {
    if (totalFaces <= 0) {
      return source === 'stored' ? 0 : null;
    }

    if (requestedFaceIndex >= 0 && requestedFaceIndex < totalFaces) {
      return requestedFaceIndex;
    }

    const effectiveFaceIndex = totalFaces === 1
      ? 0
      : Math.min(Math.max(requestedFaceIndex, 0), totalFaces - 1);

    logger.warn('[MultiClozeCardRenderService] Repaired invalid faceIndex while rendering multi-cloze card', {
      blockId,
      requestedFaceIndex,
      effectiveFaceIndex,
      totalFaces,
      source,
    });

    return effectiveFaceIndex;
  }

  private finalizeRenderedFaces(
    frontKramdown: string,
    backKramdown: string,
    renderMode: MultiClozeRenderMode,
  ): MultiClozeCardRenderResult {
    if (renderMode === FORMULA_CLOZE_RENDER_MODE_INLINE) {
      const normalizedFront = this.normalizeQuestionForMath(frontKramdown, renderMode);
      const normalizedBack = this.normalizeAnswerForMath(backKramdown, normalizedFront, renderMode);
      return {
        frontHtml: normalizedFront,
        backHtml: normalizedBack,
      };
    }

    return {
      frontHtml: this.finalizeRichHtml(frontKramdown),
      backHtml: this.finalizeRichHtml(backKramdown),
    };
  }

  private processSourceKramdown(
    sourceKramdown: string,
    clozes: ClozeInfo[],
    faceIndex: number,
    renderMode: MultiClozeRenderMode,
    revealCurrent: boolean,
  ): string {
    const currentCloze = clozes[faceIndex];
    const sortedClozes = [...clozes].sort((a, b) => b.start - a.start);
    let processedKramdown = sourceKramdown;

    for (const cloze of sortedClozes) {
      const before = processedKramdown.substring(0, cloze.start);
      const after = processedKramdown.substring(cloze.end);
      const replacement = this.resolveSourceReplacement(
        cloze,
        currentCloze,
        renderMode,
        revealCurrent,
      );
      processedKramdown = before + replacement + after;
    }

    return processedKramdown;
  }

  private normalizeStoredFormulaFace(
    rawFormula: string,
    faceIndex: number,
    revealCurrent: boolean,
  ): string {
    const cleaned = this.stripAttributeArtifacts(this.stripMarkTags(rawFormula));
    if (!this.containsFormulaClozeCommand(cleaned)) {
      return this.normalizeQuestionForMath(cleaned, FORMULA_CLOZE_RENDER_MODE_INLINE);
    }

    const parsed = parseFormulaClozeTargets(cleaned);
    if (parsed.targets.length === 0) {
      logger.warn('[MultiClozeCardRenderService] Stored formula cloze face could not be safely parsed', {
        clozeTargetCount: 0,
        malformedCount: parsed.malformed.length,
      });
      return '';
    }

    const effectiveTargetIndex = Math.min(Math.max(faceIndex, 0), parsed.targets.length - 1);
    let renderedFormula = cleaned;
    for (let index = parsed.targets.length - 1; index >= 0; index -= 1) {
      const target = parsed.targets[index];
      const replacement = index === effectiveTargetIndex
        ? (revealCurrent
            ? createFormulaClozeAnswerExpression(target.text)
            : createFormulaClozePlaceholderExpression())
        : target.text;
      renderedFormula = renderedFormula.slice(0, target.start) + replacement + renderedFormula.slice(target.end);
    }

    return this.normalizeQuestionForMath(renderedFormula, FORMULA_CLOZE_RENDER_MODE_INLINE);
  }

  private resolveSourceReplacement(
    cloze: ClozeInfo,
    currentCloze: ClozeInfo,
    renderMode: MultiClozeRenderMode,
    revealCurrent: boolean,
  ): string {
    const isCurrent =
      cloze.start === currentCloze.start
      && cloze.end === currentCloze.end
      && cloze.type === currentCloze.type;

    if (!isCurrent) {
      if (renderMode === FORMULA_CLOZE_RENDER_MODE_INLINE) {
        return cloze.text;
      }
      return this.createContextAnswerToken(cloze.text);
    }

    if (revealCurrent) {
      if (renderMode === FORMULA_CLOZE_RENDER_MODE_INLINE && cloze.type === 'latex') {
        return createFormulaClozeAnswerExpression(cloze.text);
      }
      return this.createCurrentAnswerToken(cloze.text);
    }

    if (renderMode === FORMULA_CLOZE_RENDER_MODE_INLINE && cloze.type === 'latex') {
      return createFormulaClozePlaceholderExpression();
    }

    return this.createPlaceholderToken(cloze.text);
  }

  private stripMarkTags(text: string): string {
    if (!text) return text;
    return text.replace(/<\/?mark>/g, '');
  }

  private normalizeQuestionForMath(question: string, renderMode: MultiClozeRenderMode): string {
    const trimmed = question.trim();
    if (!trimmed) return question;
    if (hasMathDelimiters(trimmed)) return question;
    const shouldForceMathByMode = renderMode === FORMULA_CLOZE_RENDER_MODE_INLINE && this.looksLikeLatex(trimmed);
    const shouldForceMathByToken = this.containsFormulaMathToken(trimmed);
    if (!shouldForceMathByMode && !shouldForceMathByToken) return question;
    return ensureDisplayMathDelimiters(trimmed);
  }

  private normalizeAnswerForMath(
    answer: string,
    question: string,
    renderMode: MultiClozeRenderMode,
  ): string {
    const trimmed = answer.trim();
    if (!trimmed) return answer;
    const prefersDisplayMode = this.prefersDisplayMathAnswer(question);

    const displayMathOnlyMatch = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
    if (displayMathOnlyMatch) {
      const expression = displayMathOnlyMatch[1].trim();
      if (expression && !expression.includes('\n')) {
        return prefersDisplayMode ? `$$${expression}$$` : `$${expression}$`;
      }
    }

    if (trimmed.includes('$')) return answer;
    if (!this.containsMathExpression(question)) {
      const shouldForceMathByMode = renderMode === FORMULA_CLOZE_RENDER_MODE_INLINE && this.looksLikeLatex(trimmed);
      const shouldForceMathByToken = this.containsFormulaMathToken(trimmed);
      if (shouldForceMathByMode || shouldForceMathByToken) {
        return ensureDisplayMathDelimiters(trimmed);
      }
      return answer;
    }
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

  private containsFormulaMathToken(text: string): boolean {
    return /\\(?:color|textcolor|boxed|cloze|frac|sqrt|left|right|begin|end)\b/.test(text);
  }

  private containsFormulaClozeCommand(text: string): boolean {
    return /\\+cloze\b/.test(text);
  }

  private restoreAnswerIntoPlaceholder(question: string, answer: string): string {
    if (!question) {
      return answer;
    }

    let replaced = false;
    const segments = question.split(/(\$\$[\s\S]+?\$\$|\$(?!\$)[\s\S]+?\$)/g);
    return segments
      .map((segment) => {
        if (!segment || segment.startsWith('$$') || segment.startsWith('$') || replaced) {
          return segment;
        }

        const next = this.replaceFirstPlaceholder(segment, answer);
        if (next !== segment) {
          replaced = true;
        }
        return next;
      })
      .join('');
  }

  private replaceFirstPlaceholder(text: string, replacement: string): string {
    const patterns = [
      new RegExp(
        `${this.escapeRegExp(CLOZE_PLACEHOLDER_START_TOKEN)}\\d+${this.escapeRegExp(CLOZE_PLACEHOLDER_END_TOKEN)}`,
        'i',
      ),
      new RegExp(this.escapeRegExp(CLOZE_PLACEHOLDER_TOKEN), 'i'),
      /<mark>\s*\[\.\.\.]\s*<\/mark>/i,
      /<span[^>]*data-type=(["'])mark\1[^>]*>\s*\[\.\.\.]\s*<\/span>/i,
      /==\s*\[\.\.\.]\s*==/i,
      /\[\.\.\.]/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return text.replace(pattern, replacement);
      }
    }

    return text;
  }

  private stripAttributeArtifacts(kramdown: string): string {
    return stripSiyuanBlockAttributeArtifacts(kramdown);
  }

  private replaceFirstPlaceholderOutsideMath(text: string, replacement: string): string {
    const segments = text.split(/(\$\$[\s\S]+?\$\$|\$(?!\$)[\s\S]+?\$)/g);
    let replaced = false;
    return segments
      .map((segment) => {
        if (!segment || segment.startsWith('$$') || segment.startsWith('$') || replaced) {
          return segment;
        }

        const next = this.replaceFirstPlaceholder(segment, replacement);
        if (next !== segment) {
          replaced = true;
        }
        return next;
      })
      .join('');
  }

  private finalizeRichHtml(kramdown: string): string {
    const renderedHtml = this.renderRichKramdown(this.stripAttributeArtifacts(kramdown));
    return this.normalizeRenderedHtml(renderedHtml);
  }

  private normalizeRenderedHtml(html: string): string {
    if (!html) {
      return html;
    }

    const currentAnswerPattern = new RegExp(
      `${this.escapeRegExp(CLOZE_CURRENT_ANSWER_START_TOKEN)}([\\s\\S]*?)${this.escapeRegExp(CLOZE_ANSWER_END_TOKEN)}`,
      'g',
    );
    const contextAnswerPattern = new RegExp(
      `${this.escapeRegExp(CLOZE_CONTEXT_ANSWER_START_TOKEN)}([\\s\\S]*?)${this.escapeRegExp(CLOZE_ANSWER_END_TOKEN)}`,
      'g',
    );
    const placeholderPattern = new RegExp(
      `${this.escapeRegExp(CLOZE_PLACEHOLDER_START_TOKEN)}(\\d+)${this.escapeRegExp(CLOZE_PLACEHOLDER_END_TOKEN)}`,
      'g',
    );

    return html
      .split(CLOZE_PLACEHOLDER_TOKEN)
      .join(this.wrapPlaceholderHtml(MIN_TEXT_BLANK_WIDTH_CH))
      .replace(placeholderPattern, (_match, width: string) => this.wrapPlaceholderHtml(readBoundedWidth(width)))
      .replace(currentAnswerPattern, (_match, innerHtml: string) => this.wrapAnswerHtml(innerHtml, 'current'))
      .replace(contextAnswerPattern, (_match, innerHtml: string) => this.wrapAnswerHtml(innerHtml, 'context'));
  }

  private createPlaceholderToken(answer: string): string {
    return `${CLOZE_PLACEHOLDER_START_TOKEN}${this.resolveBlankWidth(answer)}${CLOZE_PLACEHOLDER_END_TOKEN}`;
  }

  private createCurrentAnswerToken(answer: string): string {
    return `${CLOZE_CURRENT_ANSWER_START_TOKEN}${answer}${CLOZE_ANSWER_END_TOKEN}`;
  }

  private createContextAnswerToken(answer: string): string {
    return `${CLOZE_CONTEXT_ANSWER_START_TOKEN}${answer}${CLOZE_ANSWER_END_TOKEN}`;
  }

  private wrapPlaceholderHtml(widthCh: number): string {
    return `<span data-type="mark" class="siyuanmemo-multi-cloze__placeholder" style="--siyuanmemo-multi-cloze-blank-width: ${widthCh}ch">[...]</span>`;
  }

  private wrapAnswerHtml(innerHtml: string, role: 'current' | 'context'): string {
    return `<span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--${role}">${innerHtml}</span>`;
  }

  private resolveBlankWidth(answer: string): number {
    if (this.isComplexAnswerShape(answer)) {
      return COMPLEX_BLANK_WIDTH_CH;
    }
    const visibleText = this.toVisibleText(answer);
    const length = Array.from(visibleText).length;
    return Math.min(MAX_TEXT_BLANK_WIDTH_CH, Math.max(MIN_TEXT_BLANK_WIDTH_CH, length));
  }

  private isComplexAnswerShape(answer: string): boolean {
    return /<[^>]+>|!\[[^\]]*]\([^)]+\)|\$\$?[\s\S]+?\$\$?|\\[a-zA-Z]+/.test(answer);
  }

  private toVisibleText(answer: string): string {
    return answer
      .replace(/<[^>]+>/g, '')
      .replace(/!\[[^\]]*]\([^)]+\)/g, '')
      .replace(/\[([^\]]*)]\([^)]+\)/g, (_match, label: string) => label || '')
      .replace(/[*_`~#>\[\](){}]/g, '')
      .trim();
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

function readBoundedWidth(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return MIN_TEXT_BLANK_WIDTH_CH;
  }
  return Math.min(MAX_TEXT_BLANK_WIDTH_CH, Math.max(MIN_TEXT_BLANK_WIDTH_CH, Math.floor(parsed)));
}
