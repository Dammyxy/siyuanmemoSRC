import { stripSiyuanBlockAttributeArtifacts } from '@/core/card/common/utils/stripSiyuanBlockAttributeArtifacts';
import { createLogger } from '@/utils/logger';

export type ReviewMarkdownRenderKind = 'fragment' | 'block-flow';

export interface ReviewRenderedMarkdown {
  html: string;
  renderKind: ReviewMarkdownRenderKind;
  normalizedKramdown: string;
}

export interface ReviewMarkdownRenderOptions {
  forceRenderKind?: ReviewMarkdownRenderKind;
  preferSpinBlockDOM?: boolean;
}

interface LuteInstance {
  Md2HTML?: (markdown: string) => string;
  Md2BlockDOM?: (markdown: string) => string;
  SpinBlockDOM?: (markdown: string) => string;
}

interface LuteFactoryContainer {
  New?: () => LuteInstance;
}

const logger = createLogger('ReviewMarkdownRender');
const BLOCK_FLOW_HINT_RE = /(?:^|\n)\s*(?:[-*+]\s+|\d+\.\s+|>\s+|```|~~~|#{1,6}\s+|!\[[^\]]*\]\(|\|.+\||<(?:(?:img|table|blockquote|details|figure|iframe|video|audio|svg|math)\b))/i;
const PARAGRAPH_BREAK_RE = /\n\s*\n/u;

function escapeHtml(source: string): string {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(source: string): string {
  return escapeHtml(source);
}

function isAllowedFallbackHref(href: string): boolean {
  const normalized = href.trim();
  if (!normalized) {
    return false;
  }

  return /^(?:https?:\/\/|siyuan:\/\/|(?:\.{0,2}\/)?assets\/|\/assets\/)/iu.test(normalized);
}

function renderFallbackInline(source: string): string {
  const tokenPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)|\(\(([0-9]{14}-[a-z0-9]{7})(?:\s+"([^"]*)")?\)\)/giu;
  let html = '';
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    html += escapeHtml(source.slice(cursor, start));

    const markdownLabel = match[1];
    const markdownHref = match[2];
    const blockId = match[3];
    const blockLabel = match[4];

    if (typeof markdownLabel === 'string' && typeof markdownHref === 'string') {
      const href = markdownHref.trim();
      if (isAllowedFallbackHref(href)) {
        html += `<a href="${escapeAttribute(href)}">${escapeHtml(markdownLabel)}</a>`;
      } else {
        html += escapeHtml(match[0]);
      }
    } else if (typeof blockId === 'string') {
      const label = typeof blockLabel === 'string' && blockLabel.trim().length > 0
        ? blockLabel.trim()
        : '*';
      html += `<span data-type="block-ref" data-id="${escapeAttribute(blockId)}">${escapeHtml(label)}</span>`;
    } else {
      html += escapeHtml(match[0]);
    }

    cursor = start + match[0].length;
  }

  html += escapeHtml(source.slice(cursor));
  return html;
}

function normalizeReviewMarkdown(kramdown: string): string {
  return stripSiyuanBlockAttributeArtifacts(String(kramdown || ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectRenderKind(normalizedKramdown: string): ReviewMarkdownRenderKind {
  if (!normalizedKramdown) {
    return 'fragment';
  }

  if (PARAGRAPH_BREAK_RE.test(normalizedKramdown)) {
    return 'block-flow';
  }

  if (BLOCK_FLOW_HINT_RE.test(normalizedKramdown)) {
    return 'block-flow';
  }

  if (/\n/u.test(normalizedKramdown)) {
    return 'block-flow';
  }

  return 'fragment';
}

function readLuteFactory(): LuteFactoryContainer | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const lute = (window as Window & { Lute?: unknown }).Lute;
  if (!lute || typeof lute !== 'object') {
    return null;
  }

  return lute as LuteFactoryContainer;
}

function renderFallbackHtml(
  normalizedKramdown: string,
  renderKind: ReviewMarkdownRenderKind,
): string {
  if (!normalizedKramdown) {
    return '';
  }

  const paragraphs = normalizedKramdown
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  if (renderKind === 'fragment') {
    const fragmentText = renderFallbackInline(paragraphs.length > 0 ? paragraphs.join(' ') : normalizedKramdown);
    return `<p>${fragmentText}</p>`;
  }

  const html = (paragraphs.length > 0 ? paragraphs : [normalizedKramdown])
    .map((paragraph) => `<p>${paragraph
      .split(/\n/u)
      .map((line) => renderFallbackInline(line))
      .join('<br>')}</p>`)
    .join('');
  return html;
}

function renderFragmentHtml(normalizedKramdown: string, lute: LuteInstance): string {
  if (typeof lute.Md2HTML === 'function') {
    return lute.Md2HTML(normalizedKramdown);
  }

  if (typeof lute.Md2BlockDOM === 'function') {
    return lute.Md2BlockDOM(normalizedKramdown);
  }

  if (typeof lute.SpinBlockDOM === 'function') {
    return lute.SpinBlockDOM(normalizedKramdown);
  }

  return '';
}

function renderBlockFlowHtml(
  normalizedKramdown: string,
  lute: LuteInstance,
  preferSpinBlockDOM: boolean,
): string {
  if (preferSpinBlockDOM && typeof lute.SpinBlockDOM === 'function') {
    return lute.SpinBlockDOM(normalizedKramdown);
  }

  if (typeof lute.Md2BlockDOM === 'function') {
    return lute.Md2BlockDOM(normalizedKramdown);
  }

  if (typeof lute.Md2HTML === 'function') {
    return lute.Md2HTML(normalizedKramdown);
  }

  if (!preferSpinBlockDOM && typeof lute.SpinBlockDOM === 'function') {
    return lute.SpinBlockDOM(normalizedKramdown);
  }

  return '';
}

export function renderReviewMarkdown(
  kramdown: string,
  options: ReviewMarkdownRenderOptions = {},
): ReviewRenderedMarkdown {
  const normalizedKramdown = normalizeReviewMarkdown(kramdown);
  const renderKind = options.forceRenderKind ?? detectRenderKind(normalizedKramdown);

  if (!normalizedKramdown) {
    return {
      html: '',
      renderKind,
      normalizedKramdown,
    };
  }

  const luteContainer = readLuteFactory();
  const luteFactory = luteContainer?.New;
  if (typeof luteFactory !== 'function') {
    logger.warn('Lute not available, falling back to escaped review markdown', {
      renderKind,
      preview: normalizedKramdown.substring(0, 120),
    });
    return {
      html: renderFallbackHtml(normalizedKramdown, renderKind),
      renderKind,
      normalizedKramdown,
    };
  }

  try {
    const lute = luteFactory.call(luteContainer);
    const html = renderKind === 'fragment'
      ? renderFragmentHtml(normalizedKramdown, lute)
      : renderBlockFlowHtml(normalizedKramdown, lute, options.preferSpinBlockDOM !== false);

    return {
      html: html || renderFallbackHtml(normalizedKramdown, renderKind),
      renderKind,
      normalizedKramdown,
    };
  } catch (error) {
    logger.error('Failed to render review markdown', {
      renderKind,
      preview: normalizedKramdown.substring(0, 120),
      error,
    });
    return {
      html: renderFallbackHtml(normalizedKramdown, renderKind),
      renderKind,
      normalizedKramdown,
    };
  }
}

export function renderReviewMarkdownFragment(kramdown: string): ReviewRenderedMarkdown {
  return renderReviewMarkdown(kramdown, { forceRenderKind: 'fragment' });
}

export function renderReviewMarkdownBlockFlow(kramdown: string): ReviewRenderedMarkdown {
  return renderReviewMarkdown(kramdown, { forceRenderKind: 'block-flow' });
}
