import type { HeaderVisualTone } from '@/ui/shared/cardVisualTokens';
import type {
  ReviewHeaderCounterBadge,
  ReviewHeaderCounterBadgeKind,
  ReviewHeaderCounterSummary,
  ReviewHeaderCounterSummaryPart,
} from './types';

export interface ReviewHeaderCounterBadgeInput {
  id: string;
  label: string;
  kind: ReviewHeaderCounterBadgeKind;
  tone?: HeaderVisualTone;
  remaining?: number;
  total?: number;
  value?: number | string;
}

export interface ReviewHeaderValueSummaryInput {
  label?: string;
  value: number | string;
  tooltip?: string;
  ariaLabel?: string;
}

export interface ReviewHeaderCounterPresentationOptions {
  parts?: ReviewHeaderCounterSummaryPart[];
  badges?: ReviewHeaderCounterBadgeInput[];
  summaryValue?: ReviewHeaderValueSummaryInput;
  total: number;
  showZeroVisible?: boolean;
  forceParentheses?: boolean;
}

function normalizeCount(value: number | string | null | undefined): number {
  return Math.max(0, Number(value) || 0);
}

function formatRatio(remaining: number | string | null | undefined, total: number | string | null | undefined): string {
  return `${normalizeCount(remaining)}/${normalizeCount(total)}`;
}

function createAriaLabel(label: string, text: string): string {
  return `${label} ${text}`.trim();
}

export function createReviewHeaderCounterBadge(input: ReviewHeaderCounterBadgeInput): ReviewHeaderCounterBadge {
  if (input.kind === 'ratio') {
    const text = formatRatio(input.remaining, input.total);
    return {
      ...input,
      text,
      remaining: normalizeCount(input.remaining),
      total: normalizeCount(input.total),
      ariaLabel: createAriaLabel(input.label, text),
    };
  }

  const text = String(input.value ?? 0);
  return {
    ...input,
    text,
    value: input.value ?? 0,
    ariaLabel: createAriaLabel(input.label, text),
  };
}

export function createReviewHeaderCounterSummary(
  parts: ReviewHeaderCounterSummaryPart[],
  options: Pick<ReviewHeaderCounterPresentationOptions, 'total' | 'showZeroVisible' | 'forceParentheses'>,
): ReviewHeaderCounterSummary | null {
  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }

  const total = normalizeCount(options.total);
  const showZeroVisible = Boolean(options.showZeroVisible);
  const forceParentheses = Boolean(options.forceParentheses);
  const visibleParts = showZeroVisible
    ? parts
    : parts.filter(part => normalizeCount(part.remaining) > 0);
  const visibleNumbers = visibleParts.map(part => String(normalizeCount(part.remaining)));
  const text = visibleNumbers.length === 0
    ? `0/${total}`
    : visibleNumbers.length === 1 && !forceParentheses
      ? `${visibleNumbers[0]}/${total}`
      : `(${visibleNumbers.join('+')})/${total}`;
  const tooltip = parts
    .map(part => `${part.label} ${formatRatio(part.remaining, part.total)}`)
    .join(' · ');

  return {
    kind: 'ratio',
    text,
    tooltip,
    ariaLabel: tooltip || text,
    parts,
    total,
    forceParentheses,
  };
}

export function createReviewHeaderValueSummary(
  input: ReviewHeaderValueSummaryInput,
): ReviewHeaderCounterSummary {
  const value = typeof input.value === 'number'
    ? Math.max(0, Math.trunc(input.value))
    : String(input.value ?? 0);
  const text = String(value);
  const tooltip = input.tooltip || (input.label ? createAriaLabel(input.label, text) : text);
  const summary: ReviewHeaderCounterSummary = {
    kind: 'value',
    text,
    tooltip,
    ariaLabel: input.ariaLabel || tooltip,
    value,
  };

  if (input.label) {
    summary.label = input.label;
  }

  return summary;
}

export function createReviewHeaderCounterPresentation(
  options: ReviewHeaderCounterPresentationOptions,
): { counterSummary: ReviewHeaderCounterSummary | null; counterBadges: ReviewHeaderCounterBadge[] } {
  return {
    counterSummary: options.summaryValue
      ? createReviewHeaderValueSummary(options.summaryValue)
      : createReviewHeaderCounterSummary(options.parts || [], options),
    counterBadges: (options.badges || []).map(createReviewHeaderCounterBadge),
  };
}
