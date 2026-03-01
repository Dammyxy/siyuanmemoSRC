import { createFormulaClozePlaceholderExpression } from '@/core/card/post-creation/formula-cloze-style';

type KatexLike = {
  renderToString?: (expression: string, options?: { displayMode?: boolean; throwOnError?: boolean }) => string;
};

type RenderWarningHandler = (error: unknown) => void;

const LEGACY_MATH_MARK_PLACEHOLDER = createFormulaClozePlaceholderExpression();

function parseBracedArgument(
  source: string,
  openBraceIndex: number
): { value: string; endIndex: number } | null {
  if (source[openBraceIndex] !== '{') {
    return null;
  }

  let depth = 1;
  let i = openBraceIndex + 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    }
    i++;
  }

  if (depth !== 0) {
    return null;
  }

  const endIndex = i - 1;
  return {
    value: source.slice(openBraceIndex + 1, endIndex),
    endIndex,
  };
}

function normalizeTextColorCommand(expression: string): string {
  const command = '\\textcolor';
  let result = '';
  let cursor = 0;

  while (cursor < expression.length) {
    const commandIndex = expression.indexOf(command, cursor);
    if (commandIndex === -1) {
      result += expression.slice(cursor);
      break;
    }

    result += expression.slice(cursor, commandIndex);
    let scan = commandIndex + command.length;
    while (scan < expression.length && /\s/.test(expression[scan])) {
      scan++;
    }

    const colorArg = parseBracedArgument(expression, scan);
    if (!colorArg) {
      result += expression.slice(commandIndex, scan);
      cursor = scan;
      continue;
    }

    scan = colorArg.endIndex + 1;
    while (scan < expression.length && /\s/.test(expression[scan])) {
      scan++;
    }

    const bodyArg = parseBracedArgument(expression, scan);
    if (!bodyArg) {
      result += expression.slice(commandIndex, scan);
      cursor = scan;
      continue;
    }

    result += `{\\color{${colorArg.value}}${bodyArg.value}}`;
    cursor = bodyArg.endIndex + 1;
  }

  return result;
}

function normalizeMathExpression(expression: string): string {
  if (!expression) {
    return expression;
  }

  let normalized = expression;

  // Legacy cards may contain HTML mark placeholder inside $$...$$.
  normalized = normalized.replace(
    /<\s*mark[^>]*>\s*\[\.\.\.]\s*<\/\s*mark\s*>/gi,
    LEGACY_MATH_MARK_PLACEHOLDER
  );
  normalized = normalized.replace(
    /&lt;\s*mark[^&]*&gt;\s*\[\.\.\.]\s*&lt;\s*\/\s*mark\s*&gt;/gi,
    LEGACY_MATH_MARK_PLACEHOLDER
  );

  // Remove leftover mark tags if any.
  normalized = normalized.replace(/<\/?\s*mark[^>]*>/gi, '');
  normalized = normalized.replace(/&lt;\s*\/?\s*mark[^&]*&gt;/gi, '');

  // Normalize unsupported \textcolor commands to grouped \color for KaTeX compatibility.
  normalized = normalizeTextColorCommand(normalized);

  return normalized;
}

/**
 * Render `$...$` and `$$...$$` fragments with global KaTeX when available.
 * Falls back to the original input when KaTeX is missing or rendering fails.
 */
export function renderMathWithKatex(html: string, onWarn?: RenderWarningHandler): string {
  if (!html) {
    return html;
  }

  const katex = (window as Window & { katex?: KatexLike }).katex;
  if (!katex?.renderToString) {
    return html;
  }

  const renderExpression = (expression: string, displayMode: boolean): string => {
    const normalized = normalizeMathExpression(expression).trim();
    if (!normalized) {
      return displayMode ? "$$$$" : "$$";
    }
    try {
      return katex.renderToString!(normalized, {
        displayMode,
        throwOnError: false,
      });
    } catch (error) {
      onWarn?.(error);
      return displayMode ? `$$${expression}$$` : `$${expression}$`;
    }
  };

  let rendered = html;
  rendered = rendered.replace(/\$\$([\s\S]+?)\$\$/g, (_full, expression: string) =>
    renderExpression(expression, true));
  rendered = rendered.replace(/\$(?!\$)([^$\n]+?)\$/g, (_full, expression: string) =>
    renderExpression(expression, false));
  return rendered;
}
