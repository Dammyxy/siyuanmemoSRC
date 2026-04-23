import { renderMarkdownToHtml } from '@/ui/shared/rich-content';

const TRAILING_BLOCK_ATTR_PATTERN = /\s*\{:[^{}]*\}\s*$/s;
const CDF_MULTILINE_MARKER_RE = /\s*(:::\s*|;;;\s*|：：：\s*|；；；\s*)(?=(?:<\/[^>]+>|\s*$))/g;
const CDF_INLINE_MARKER_RE = /\s*(;<>|；《》|;<|；《|;;|；；|::|：：|:>|：》|:<|：《)\s*/g;

export function stripCdfDirectMarkers(source: string): string {
  return String(source || '')
    .replace(TRAILING_BLOCK_ATTR_PATTERN, '')
    .replace(CDF_MULTILINE_MARKER_RE, '')
    .replace(CDF_INLINE_MARKER_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderCdfDirectMarkdown(markdown: string): string {
  const cleaned = stripCdfDirectMarkers(markdown);
  return cleaned ? renderMarkdownToHtml(cleaned) : '';
}

export function stripCdfDirectHtmlMarkers(html: string): string {
  return stripCdfDirectMarkers(html);
}
