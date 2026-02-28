type KatexLike = {
  renderToString?: (expression: string, options?: { displayMode?: boolean; throwOnError?: boolean }) => string;
};

type RenderWarningHandler = (error: unknown) => void;
const LEGACY_MATH_MARK_PLACEHOLDER = '\\color{#2e7d32}{\\boxed{\\text{[...]}}}';

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
