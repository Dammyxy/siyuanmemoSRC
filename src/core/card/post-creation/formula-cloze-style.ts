export const FORMULA_CLOZE_RENDER_MODE_INLINE = 'inline-formula-cloze' as const;

// Keep KaTeX color explicit so both native sync and listener render identically.
export const FORMULA_CLOZE_SUCCESS_TEXT_COLOR = '#166534';
export const FORMULA_CLOZE_PLACEHOLDER = '[...]';

export { parseFormulaClozeTargets } from '@/utils/formula-cloze-parser';
export type {
  FormulaClozeMalformed,
  FormulaClozeParseResult,
  FormulaClozeTarget,
} from '@/utils/formula-cloze-parser';

export function createFormulaClozePlaceholderExpression(): string {
  return `{\\color{${FORMULA_CLOZE_SUCCESS_TEXT_COLOR}}\\boxed{\\text{${FORMULA_CLOZE_PLACEHOLDER}}}}`;
}

export function createFormulaClozeAnswerExpression(answer: string): string {
  const normalizedAnswer = String(answer || '').trim();
  return `{\\color{${FORMULA_CLOZE_SUCCESS_TEXT_COLOR}}${normalizedAnswer}}`;
}

export function hasMathDelimiters(content: string): boolean {
  const normalized = String(content || '');
  if (!normalized.trim()) {
    return false;
  }
  if (/\$\$[\s\S]+?\$\$/.test(normalized)) {
    return true;
  }
  return /\$(?!\$)[^$\n]+?\$/.test(normalized);
}

export function ensureDisplayMathDelimiters(content: string): string {
  const normalized = String(content || '');
  if (!normalized.trim()) {
    return normalized;
  }
  if (hasMathDelimiters(normalized)) {
    return normalized;
  }
  return `$$${normalized}$$`;
}
